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
 *
 * The verifier auto-fetches and caches the JWKS at
 * `https://ochk.io/.well-known/jwks.json` for 1h. Pass `{ jwk }` to
 * skip the network round-trip if you've embedded the key.
 */

import { importJWK, type CryptoKey, type KeyObject } from 'jose';

const DEFAULT_ISSUER = 'https://ochk.io';
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export interface VerifyResult {
    ok: boolean;
    reason?: string;
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
    /** Override the auth host issuer. Defaults to https://ochk.io. */
    issuer?: string;
    /** Pass a JWK directly to skip the network fetch entirely. Useful
     *  for tests, edge runtimes that can't fetch, or integrators that
     *  ship the public key alongside their webhook handler. */
    jwk?: OcPublicJwk;
    /** JWKS cache TTL in ms. Defaults to 1 hour. Stale-on-error: a
     *  transient JWKS outage falls back to the previous cached value
     *  rather than rejecting every webhook. */
    jwksCacheTtlMs?: number;
}

type AuthKey = CryptoKey | KeyObject;

interface JwksCacheEntry {
    keys: Record<string, AuthKey>;
    fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const inflight = new Map<string, Promise<JwksCacheEntry>>();

async function fetchJwks(issuer: string, ttlMs: number): Promise<JwksCacheEntry> {
    const cached = jwksCache.get(issuer);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached;
    const existing = inflight.get(issuer);
    if (existing) return existing;
    const p = (async (): Promise<JwksCacheEntry> => {
        try {
            const url = `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`JWKS fetch ${url} returned ${res.status}`);
            const json = (await res.json()) as { keys: OcPublicJwk[] };
            if (!json || !Array.isArray(json.keys)) {
                throw new Error(`JWKS at ${url} did not return {keys:[…]}`);
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
            const stale = jwksCache.get(issuer);
            if (stale) return stale;
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
 * Returns `{ ok: true }` on success, `{ ok: false, reason }` on any
 * failure (bad signature, kid not in JWKS, malformed signature,
 * network-only JWKS fetch failed without prior cache, etc.). Never
 * throws.
 */
export async function verify(
    rawBody: string | Uint8Array,
    sigHex: string,
    kid: string,
    options: VerifyOptions = {}
): Promise<VerifyResult> {
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
        const issuer = options.issuer ?? DEFAULT_ISSUER;
        const ttl = options.jwksCacheTtlMs ?? DEFAULT_TTL_MS;
        try {
            let entry = await fetchJwks(issuer, ttl);
            key = entry.keys[kid];
            if (!key) {
                jwksCache.delete(issuer);
                entry = await fetchJwks(issuer, ttl);
                key = entry.keys[kid];
            }
        } catch (err) {
            return { ok: false, reason: `jwks unavailable: ${(err as Error).message}` };
        }
        if (!key) return { ok: false, reason: `kid ${kid} not in JWKS` };
    }

    const ok = await verifyEd25519(key, sig, msg);
    return ok ? { ok: true } : { ok: false, reason: 'signature does not match' };
}

/** Force-refresh the JWKS cache. Useful after a key rotation event
 *  if you don't want to wait for the TTL to expire. */
export async function fetchJwksForce(issuer = DEFAULT_ISSUER): Promise<void> {
    jwksCache.delete(issuer);
    await fetchJwks(issuer, DEFAULT_TTL_MS);
}

export const webhook = { verify, fetchJwks: fetchJwksForce };
