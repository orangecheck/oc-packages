/**
 * `oc.identity.verifyActivityAttestation` — one-call ed25519 verifier
 * for a /api/me/activity-attestation bundle.
 *
 * Cashes the "trivially to verify" strategic claim: an integrator
 * receiving a signed attestation JSON from a user calls one function,
 * gets a typed result with per-check detail, never reaches into
 * @noble/curves or jose themselves.
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const result = await oc.identity.verifyActivityAttestation(bundle);
 *   if (!result.ok) return res.status(401).send(result.reason);
 *   // result.attestation is typed · safe to gate on lifetime_sats etc.
 *
 * The JWKS issuer is me.ochk.io (the envelope key), DISTINCT from
 * the auth host's ochk.io JWKS that signs webhooks. Same Ed25519
 * curve, same kid lookup pattern, fetched + cached separately.
 */

import { importJWK, type CryptoKey, type KeyObject } from 'jose';

const DEFAULT_ISSUER = 'https://me.ochk.io';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
/** How old a key list may be and still stand in for one that can't be fetched. */
const DEFAULT_MAX_STALE_MS = 6 * 60 * 60 * 1000;
/** An unknown kid refetches the key list at most this often per issuer. */
const FORCED_REFRESH_MIN_INTERVAL_MS = 60_000;
const ENVELOPE_JWKS_PATH = '/.well-known/oc-envelope-jwks.json';

export interface ActivityAttestation {
    id: string;
    v: 1;
    kind: 'oc-me-activity';
    did_oc: string;
    event_count: number;
    human_event_count: number;
    lifetime_sats: number;
    distinct_integrator_count: number;
    oldest_event_at: string | null;
    active_days: number;
    computed_at: string;
    expires_at: string;
}

export interface ActivityAttestationBundle {
    /** A readable copy. Never trusted: the result is read from the signed
     *  bytes, and a copy that differs from them fails the check. */
    attestation?: ActivityAttestation;
    sig: string;
    kid: string;
    canonical_b64: string;
}

export interface ActivityVerifyCheck {
    ok: boolean;
    label: string;
    detail?: string;
}

export interface ActivityVerifyResult {
    ok: boolean;
    reason?: string;
    attestation?: ActivityAttestation;
    checks: ActivityVerifyCheck[];
}

interface OcEnvelopePublicJwk {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid: string;
    alg?: 'EdDSA';
    use?: 'sig';
}

export interface VerifyActivityOptions {
    /** Override the me.ochk.io issuer (defaults to https://me.ochk.io).
     *  Useful for staging / self-hosted dev. */
    issuer?: string;
    /** Pass a JWK directly to skip the network fetch · convenient when
     *  embedding the public key in your service for air-gapped or
     *  edge-runtime deployments. */
    jwk?: OcEnvelopePublicJwk;
    /** JWKS cache TTL in ms. Defaults to 1h. Stale-on-error falls back
     *  to the previous cached value, for at most `jwksMaxStaleMs`. */
    jwksCacheTtlMs?: number;
    /** How old a cached JWKS may be and still stand in during an outage.
     *  Defaults to 6h; past it, verification fails closed. */
    jwksMaxStaleMs?: number;
    /** Optional · override "now" for deterministic tests. */
    now?: Date;
}

type AuthKey = CryptoKey | KeyObject;

interface JwksCacheEntry {
    keys: Record<string, AuthKey>;
    fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const inflight = new Map<string, Promise<JwksCacheEntry>>();
const lastForcedRefresh = new Map<string, number>();

async function fetchEnvelopeJwks(
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
            const url = `${issuer.replace(/\/$/, '')}${ENVELOPE_JWKS_PATH}`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`envelope JWKS fetch ${url} returned ${res.status}`);
            const json = (await res.json()) as { keys: OcEnvelopePublicJwk[] };
            if (!json || !Array.isArray(json.keys)) {
                throw new Error(`envelope JWKS at ${url} did not return {keys:[…]}`);
            }
            const keys: Record<string, AuthKey> = {};
            for (const k of json.keys) {
                if (typeof k.kid !== 'string') continue;
                try {
                    keys[k.kid] = (await importJWK(k, 'EdDSA')) as AuthKey;
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

function base64ToBytes(b64: string): Uint8Array | null {
    try {
        const bin =
            typeof atob === 'function'
                ? atob(b64)
                : Buffer.from(b64, 'base64').toString('binary');
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

function bytesToHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    const subtle =
        typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle
            ? globalThis.crypto.subtle
            : null;
    if (!subtle) {
        throw new Error('crypto.subtle unavailable · need Node 20+ / modern browser / Edge runtime');
    }
    const buf = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
    return new Uint8Array(buf);
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(view.byteLength);
    new Uint8Array(buf).set(view);
    return buf;
}

async function verifyEd25519(
    key: AuthKey,
    sig: Uint8Array,
    msg: Uint8Array
): Promise<boolean> {
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

/** The signed fields, in the order me.ochk.io encodes them. */
const SIGNED_FIELDS = [
    'v',
    'kind',
    'did_oc',
    'event_count',
    'human_event_count',
    'lifetime_sats',
    'distinct_integrator_count',
    'oldest_event_at',
    'active_days',
    'computed_at',
    'expires_at',
] as const;
const COUNTS = [
    'event_count',
    'human_event_count',
    'lifetime_sats',
    'distinct_integrator_count',
    'active_days',
] as const;

/** The attestation the signature covers, read from the signed bytes, or
 *  null when they are not one in canonical form. */
function readSignedAttestation(canonical: Uint8Array, id: string): ActivityAttestation | null {
    const text = new TextDecoder().decode(canonical);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1 || o.kind !== 'oc-me-activity' || typeof o.did_oc !== 'string') return null;
    const countsOk = COUNTS.every((k) => {
        const n = o[k];
        return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
    });
    if (!countsOk) return null;
    if (o.oldest_event_at !== null && typeof o.oldest_event_at !== 'string') return null;
    if (typeof o.computed_at !== 'string' || typeof o.expires_at !== 'string') return null;
    const ordered = Object.fromEntries(SIGNED_FIELDS.map((k) => [k, o[k]]));
    // Only the canonical encoding counts: no extra keys, no reordering, no whitespace.
    if (JSON.stringify(ordered) !== text) return null;
    return { id, ...(ordered as Omit<ActivityAttestation, 'id'>) };
}

/** True when every field of the readable copy equals the signed value. */
function sameAttestation(copy: ActivityAttestation, signed: ActivityAttestation): boolean {
    const c = copy as unknown as Record<string, unknown>;
    const v = signed as unknown as Record<string, unknown>;
    return (['id', ...SIGNED_FIELDS] as const).every((k) => c[k] === v[k]);
}

/**
 * Verify a signed activity attestation bundle. Returns a typed
 * ActivityVerifyResult with per-check detail · never throws (network
 * + parse failures surface as ok=false rows in the checks array, so
 * the caller can log them without try/catch).
 *
 * Checks, in order: bundle shape, the signed bytes decode and are an
 * attestation in canonical form, the readable copy (when given) equals
 * them, JWK with matching kid present, ed25519 signature, freshness.
 * `attestation` in the result is read from the signed bytes, and is set
 * only when every check passes.
 */
export async function verifyActivityAttestation(
    bundle: ActivityAttestationBundle,
    options: VerifyActivityOptions = {}
): Promise<ActivityVerifyResult> {
    const checks: ActivityVerifyCheck[] = [];

    // 1. Bundle shape
    const shapeOk =
        !!bundle &&
        typeof bundle === 'object' &&
        typeof bundle.sig === 'string' &&
        typeof bundle.kid === 'string' &&
        typeof bundle.canonical_b64 === 'string' &&
        (bundle.attestation === undefined ||
            (!!bundle.attestation && typeof bundle.attestation === 'object'));
    checks.push({
        ok: shapeOk,
        label: 'bundle shape · sig / kid / canonical_b64',
    });
    if (!shapeOk) {
        return { ok: false, reason: 'bundle shape invalid', checks };
    }

    // 2. canonical_b64 decodes
    const canonical = base64ToBytes(bundle.canonical_b64);
    checks.push({
        ok: canonical !== null,
        label: 'canonical_b64 decodes',
        detail: canonical ? `${canonical.length} bytes` : 'invalid base64',
    });
    if (!canonical) return { ok: false, reason: 'canonical_b64 invalid base64', checks };

    // 3. The signed bytes are an attestation, and the readable copy says the same
    const computedId = bytesToHex(await sha256(canonical));
    const signed = readSignedAttestation(canonical, computedId);
    checks.push({
        ok: signed !== null,
        label: 'canonical_bytes are an oc-me-activity attestation in canonical form',
    });
    if (!signed) return { ok: false, reason: 'canonical bytes are not an activity attestation', checks };

    const copy = bundle.attestation;
    const copyOk = copy === undefined || sameAttestation(copy, signed);
    checks.push({
        ok: copyOk,
        label: 'attestation === the signed bytes, id = sha256(canonical_bytes)',
        detail: copyOk ? computedId : 'the readable copy differs from what was signed',
    });
    if (!copyOk) return { ok: false, reason: 'attestation does not match the signed bytes', checks };

    // 4. JWK lookup + ed25519 verify
    let key: AuthKey | null = null;
    if (options.jwk) {
        if (options.jwk.kid !== bundle.kid) {
            checks.push({
                ok: false,
                label: 'JWK with matching kid present',
                detail: `provided jwk.kid=${options.jwk.kid} but bundle.kid=${bundle.kid}`,
            });
            return { ok: false, reason: 'kid mismatch with provided jwk', checks };
        }
        try {
            key = (await importJWK(options.jwk, 'EdDSA')) as AuthKey;
            checks.push({ ok: true, label: 'JWK with matching kid present', detail: `kid ${bundle.kid} (provided)` });
        } catch (err) {
            checks.push({
                ok: false,
                label: 'JWK with matching kid present',
                detail: `provided jwk failed import: ${(err as Error).message}`,
            });
            return { ok: false, reason: 'provided jwk failed import', checks };
        }
    } else {
        const issuer = options.issuer ?? DEFAULT_ISSUER;
        const ttl = options.jwksCacheTtlMs ?? DEFAULT_TTL_MS;
        const maxStale = options.jwksMaxStaleMs ?? DEFAULT_MAX_STALE_MS;
        try {
            let entry = await fetchEnvelopeJwks(issuer, ttl, maxStale);
            key = entry.keys[bundle.kid] ?? null;
            if (!key && Date.now() - (lastForcedRefresh.get(issuer) ?? 0) >= FORCED_REFRESH_MIN_INTERVAL_MS) {
                // Cache miss · likely a rotation. Refetch, at most once a minute.
                lastForcedRefresh.set(issuer, Date.now());
                entry = await fetchEnvelopeJwks(issuer, 0, maxStale);
                key = entry.keys[bundle.kid] ?? null;
            }
            checks.push({
                ok: !!key,
                label: 'JWK with matching kid present',
                detail: key ? `kid ${bundle.kid}` : `no JWK with kid ${bundle.kid} at ${issuer}${ENVELOPE_JWKS_PATH}`,
            });
            if (!key) {
                return { ok: false, reason: `kid ${bundle.kid} not in envelope JWKS`, checks };
            }
        } catch (err) {
            checks.push({
                ok: false,
                label: 'JWK with matching kid present',
                detail: `envelope JWKS unavailable: ${(err as Error).message}`,
            });
            return {
                ok: false,
                reason: `envelope JWKS unavailable: ${(err as Error).message}`,
                checks,
            };
        }
    }

    const sigBytes = hexToBytes(bundle.sig);
    if (!sigBytes) {
        checks.push({
            ok: false,
            label: 'ed25519.verify(sig, canonical_bytes, jwk.public)',
            detail: 'malformed sig (expected hex)',
        });
        return { ok: false, reason: 'malformed sig', checks };
    }
    const sigOk = await verifyEd25519(key, sigBytes, canonical);
    checks.push({
        ok: sigOk,
        label: 'ed25519.verify(sig, canonical_bytes, jwk.public)',
        detail: sigOk ? 'signature valid' : 'signature does not match',
    });
    if (!sigOk) return { ok: false, reason: 'signature does not match', checks };

    // 5. Freshness, from the signed expiry
    const now = options.now ?? new Date();
    const expiresMs = Date.parse(signed.expires_at);
    const freshOk = Number.isFinite(expiresMs) && expiresMs > now.getTime();
    checks.push({
        ok: freshOk,
        label: 'now < attestation.expires_at',
        detail: freshOk
            ? `expires ${new Date(expiresMs).toISOString()}`
            : 'attestation has expired',
    });
    if (!freshOk) return { ok: false, reason: 'attestation has expired', checks };

    return { ok: true, attestation: signed, checks };
}

/** Force-refresh the envelope-JWKS cache · useful after a key rotation
 *  if you don't want to wait for the TTL to expire. */
export async function refreshEnvelopeJwks(issuer = DEFAULT_ISSUER): Promise<void> {
    jwksCache.delete(issuer);
    await fetchEnvelopeJwks(issuer, DEFAULT_TTL_MS);
}

export const identity = {
    verifyActivityAttestation,
    refreshEnvelopeJwks,
};
