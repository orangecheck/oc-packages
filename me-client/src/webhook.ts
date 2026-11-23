/**
 * `oc.webhook.verify` — Ed25519 signature verification for me.ochk.io
 * webhook deliveries.
 *
 * Webhook envelopes are signed with the auth host's Ed25519 key. The
 * signature is sent as a hex string in the `OC-Signature` header, and
 * the kid is in the `OC-Key-Id` header.
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   // In your webhook handler — pass RAW BODY BYTES, not the parsed
 *   // JSON. Frameworks that re-serialize before your handler will
 *   // produce a different byte sequence and the signature will not
 *   // validate.
 *   const result = await oc.webhook.verify(
 *     rawBody,                       // string | Uint8Array
 *     req.headers['oc-signature'],   // hex
 *     req.headers['oc-key-id']       // kid
 *   );
 *   if (!result.ok) return res.status(401).send(result.reason);
 *   // result.id is the delivery's signed id: deduplicate on it.
 *
 * Pass `{ project: 'pk_live_…' }`, your project key. One key signs every
 * project's deliveries, so without it a delivery signed for another project
 * verifies too. It is optional until the next major version, and a verify
 * without it warns once per process. A delivery is also refused when its
 * signed `issued_at` is more than a day old (`maxAgeSeconds`) or more than five
 * minutes ahead of this clock. me.ochk.io signs each send as it sends it, so a
 * retry carries its own `issued_at` and the delivery's `id`.
 *
 * The verifier auto-fetches and caches the webhook-signing JWKS at
 * `https://me.ochk.io/api/dev-jwks` for 1h. Pass `{ jwk }` to skip the
 * network round-trip if you've embedded the key.
 *
 * It used to fetch `https://ochk.io/.well-known/jwks.json` — the family
 * SESSION key, a different key for a different job — so every verification
 * that did not pass `{ jwk }` failed with `kid … not in JWKS` before it could
 * check anything.
 */

import { importJWK, type CryptoKey, type KeyObject } from 'jose';

import { ISSUER_ORIGIN_RULE, parseIssuerOrigin } from '@orangecheck/auth-core/issuer-origin';

import { issuerOrigin } from './origin';

/** me.ochk.io signs its own webhook deliveries; the family auth host does not.
 *  Its published key lives at /api/dev-jwks (the path is historical — the note
 *  in that document names it as the production webhook-signing key). */
const DEFAULT_ISSUER = 'https://me.ochk.io';
const JWKS_PATH = '/api/dev-jwks';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
/** How old a key list may be and still stand in for one that can't be fetched. */
const DEFAULT_MAX_STALE_MS = 6 * 60 * 60 * 1000;
/** An unknown kid refetches the key list at most this often per issuer. */
const FORCED_REFRESH_MIN_INTERVAL_MS = 60_000;
/** The oldest delivery accepted. me.ochk.io signs each send, retries included, as it sends it. */
const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
/** How far ahead of this clock a delivery's `issued_at` may be. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;
/** The form me.ochk.io writes `issued_at` in (toISOString), and the only one taken. */
const ISSUED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export interface VerifyResult {
    ok: boolean;
    reason?: string;
    /** When ok: the delivery's signed id. Deduplicate on it. */
    id?: string;
    /** When ok: the project the delivery was signed for. */
    project_key?: string;
    /** When ok: when this send was signed, an ISO time. */
    issued_at?: string;
}

export interface OcPublicJwk {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid: string;
    alg?: 'EdDSA';
    use?: 'sig';
}

export interface VerifyOptions {
    /** Override the issuer: one origin with no path. Defaults to https://me.ochk.io. */
    issuer?: string;
    /** Pass a JWK directly to skip the network fetch entirely. Useful
     *  for tests, edge runtimes that can't fetch, or integrators that
     *  ship the public key alongside their webhook handler. */
    jwk?: OcPublicJwk;
    /** JWKS cache TTL in ms. Defaults to 1 hour. Stale-on-error: a
     *  transient JWKS outage falls back to the previous cached value
     *  rather than rejecting every webhook, for at most `jwksMaxStaleMs`. */
    jwksCacheTtlMs?: number;
    /** How old a cached JWKS may be and still stand in during an outage.
     *  Defaults to 6 hours; past it, verification fails closed. */
    jwksMaxStaleMs?: number;
    /** Your project key. A delivery signed for another project is refused.
     *  Optional until the next major version; without it, verify warns once. */
    project?: string;
    /** The oldest delivery accepted, in seconds since it was signed.
     *  Defaults to 24 hours. */
    maxAgeSeconds?: number;
}

let warnedNoProject = false;

/** Tests only: let the next verify without `project` warn again. */
export function _resetWebhookWarningForTests(): void {
    warnedNoProject = false;
}

function warnNoProjectOnce(): void {
    if (warnedNoProject) return;
    warnedNoProject = true;
    console.warn(
        '@orangecheck/me-client: webhook.verify was called without `project`, so it accepts a ' +
            'delivery signed for any project. Pass your project key; it is required from the next major version.'
    );
}

/** A UTC time as toISOString writes it, naming a second that exists (no Feb 30, no :60). */
function isIsoTime(v: string): boolean {
    if (!ISSUED_AT.test(v)) return false;
    const t = Date.parse(v);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 19) === v.slice(0, 19);
}

/** The fields every delivery signs: its id, its project and when it was signed. */
function signedFields(msg: Uint8Array, options: VerifyOptions): VerifyResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(new TextDecoder().decode(msg));
    } catch {
        return { ok: false, reason: 'body is not JSON' };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, reason: 'body is not a JSON object' };
    }
    const { id, project_key, issued_at } = parsed as Record<string, unknown>;
    if (
        typeof id !== 'string' ||
        id === '' ||
        typeof project_key !== 'string' ||
        project_key === '' ||
        typeof issued_at !== 'string' ||
        !isIsoTime(issued_at)
    ) {
        return { ok: false, reason: 'missing a signed id, project_key or issued_at' };
    }
    if (options.project !== undefined && project_key !== options.project) {
        return { ok: false, reason: `signed for another project (${project_key})` };
    }
    const age = Date.now() - Date.parse(issued_at);
    if (age > (options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS) * 1000) {
        return { ok: false, reason: 'older than the accepted age (issued_at)' };
    }
    if (-age > FUTURE_SKEW_MS) return { ok: false, reason: 'issued_at is in the future' };
    return { ok: true, id, project_key, issued_at };
}

type AuthKey = CryptoKey | KeyObject;

interface JwksCacheEntry {
    /** kid → key. A Map, so a kid is only ever one of the set's own entries. */
    keys: Map<string, AuthKey>;
    fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const inflight = new Map<string, Promise<JwksCacheEntry>>();
const lastForcedRefresh = new Map<string, number>();

async function fetchJwks(
    issuer: string,
    ttlMs: number,
    maxStaleMs = DEFAULT_MAX_STALE_MS
): Promise<JwksCacheEntry> {
    const cached = jwksCache.get(issuer);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached;
    const existing = inflight.get(issuer);
    if (existing) return existing;
    const p = (async (): Promise<JwksCacheEntry> => {
        try {
            const url = `${issuer.replace(/\/$/, '')}${JWKS_PATH}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`JWKS fetch ${url} returned ${res.status}`);
            const json = (await res.json()) as { keys: OcPublicJwk[] };
            if (!json || !Array.isArray(json.keys)) {
                throw new Error(`JWKS at ${url} did not return {keys:[…]}`);
            }
            const keys = new Map<string, AuthKey>();
            for (const k of json.keys) {
                if (typeof k.kid !== 'string') continue;
                try {
                    keys.set(k.kid, (await importJWK(k, 'EdDSA')) as AuthKey);
                } catch {
                    /* skip keys that won't import */
                }
            }
            const entry: JwksCacheEntry = { keys, fetchedAt: Date.now() };
            jwksCache.set(issuer, entry);
            return entry;
        } catch (err) {
            // A key the issuer removed must stop verifying even while its list can't be fetched.
            const stale = jwksCache.get(issuer);
            if (stale && Date.now() - stale.fetchedAt < maxStaleMs) return stale;
            throw err;
        }
    })().finally(() => {
        inflight.delete(issuer);
    });
    inflight.set(issuer, p);
    return p;
}

function hexToBytes(hex: string): Uint8Array | null {
    if (typeof hex !== 'string') return null;
    const s = hex.trim();
    if (s.length === 0 || s.length % 2 !== 0) return null;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) {
        const b = parseInt(s.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(b)) return null;
        out[i] = b;
    }
    return out;
}

function toBytes(input: string | Uint8Array): Uint8Array {
    if (typeof input === 'string') return new TextEncoder().encode(input);
    return input;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    // SubtleCrypto's BufferSource type requires Uint8Array<ArrayBuffer>
    // (not ArrayBufferLike). Copy into a fresh ArrayBuffer so the
    // resulting buffer is statically typed as ArrayBuffer (slicing a
    // SharedArrayBuffer would yield SharedArrayBuffer which the type
    // system rejects).
    const buf = new ArrayBuffer(view.byteLength);
    new Uint8Array(buf).set(view);
    return buf;
}

async function verifyEd25519(
    key: AuthKey,
    sig: Uint8Array,
    msg: Uint8Array
): Promise<boolean> {
    // jose normalizes the key into a CryptoKey under WebCrypto-capable
    // runtimes (Node 20+, Vercel Edge, modern browsers); fall through
    // to subtle.verify for the actual signature check.
    const subtle =
        typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle
            ? globalThis.crypto.subtle
            : null;
    if (!subtle) return false;
    try {
        return await subtle.verify(
            'Ed25519',
            key as CryptoKey,
            toArrayBuffer(sig),
            toArrayBuffer(msg)
        );
    } catch {
        return false;
    }
}

/**
 * Verify a webhook signature. Pass the raw body bytes (not parsed
 * JSON), the hex-encoded signature from the `OC-Signature` header, and
 * the kid from the `OC-Key-Id` header.
 *
 * Returns `{ ok: true, id, project_key, issued_at }` on success, and
 * `{ ok: false, reason }` on any failure (bad signature, kid not in JWKS,
 * malformed signature, a delivery for another project or outside the age
 * window, a key list that cannot be fetched with none cached, etc.). Never
 * throws.
 */
export async function verify(
    rawBody: string | Uint8Array,
    sigHex: string | null | undefined,
    kid: string | null | undefined,
    options: VerifyOptions = {}
): Promise<VerifyResult> {
    if (options.project === undefined) warnNoProjectOnce();
    if (!sigHex) return { ok: false, reason: 'missing signature' };
    if (!kid) return { ok: false, reason: 'missing kid' };
    const sig = hexToBytes(sigHex);
    if (!sig) return { ok: false, reason: 'malformed signature (expected hex)' };
    const msg = toBytes(rawBody);

    let key: AuthKey | undefined;
    if (options.jwk) {
        if (options.jwk.kid !== kid) {
            return { ok: false, reason: `kid mismatch (header=${kid}, jwk=${options.jwk.kid})` };
        }
        try {
            key = (await importJWK(options.jwk, 'EdDSA')) as AuthKey;
        } catch {
            return { ok: false, reason: 'could not import provided jwk' };
        }
    } else {
        const issuer = parseIssuerOrigin(options.issuer ?? DEFAULT_ISSUER);
        if (issuer === null) return { ok: false, reason: `issuer must be ${ISSUER_ORIGIN_RULE}` };
        const ttl = options.jwksCacheTtlMs ?? DEFAULT_TTL_MS;
        const maxStale = options.jwksMaxStaleMs ?? DEFAULT_MAX_STALE_MS;
        try {
            let entry = await fetchJwks(issuer, ttl, maxStale);
            key = entry.keys.get(kid);
            if (!key && Date.now() - (lastForcedRefresh.get(issuer) ?? 0) >= FORCED_REFRESH_MIN_INTERVAL_MS) {
                // Likely a rotation. Refetch, at most once a minute.
                lastForcedRefresh.set(issuer, Date.now());
                entry = await fetchJwks(issuer, 0, maxStale);
                key = entry.keys.get(kid);
            }
        } catch (err) {
            return { ok: false, reason: `jwks unavailable: ${(err as Error).message}` };
        }
        if (!key) return { ok: false, reason: `kid ${kid} not in JWKS` };
    }

    if (!(await verifyEd25519(key, sig, msg))) return { ok: false, reason: 'signature does not match' };
    return signedFields(msg, options);
}

/** Force-refresh the JWKS cache. Useful after a key rotation event
 *  if you don't want to wait for the TTL to expire. */
export async function fetchJwksForce(issuer = DEFAULT_ISSUER): Promise<void> {
    const origin = issuerOrigin(issuer, 'webhook.fetchJwks: issuer');
    jwksCache.delete(origin);
    await fetchJwks(origin, DEFAULT_TTL_MS);
}

export const webhook = { verify, fetchJwks: fetchJwksForce };
