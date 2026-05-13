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
    attestation: ActivityAttestation;
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
     *  to the previous cached value. */
    jwksCacheTtlMs?: number;
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

async function fetchEnvelopeJwks(issuer: string, ttlMs: number): Promise<JwksCacheEntry> {
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

/**
 * Verify a signed activity attestation bundle. Returns a typed
 * ActivityVerifyResult with per-check detail · never throws (network
 * + parse failures surface as ok=false rows in the checks array, so
 * the caller can log them without try/catch).
 *
 * Five checks, in order: bundle shape, canonical-bytes hash matches
 * id, JWK with matching kid present, ed25519 signature, freshness.
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
        !!bundle.attestation &&
        typeof bundle.attestation.id === 'string' &&
        typeof bundle.attestation.expires_at === 'string';
    checks.push({
        ok: shapeOk,
        label: 'bundle shape · sig / kid / canonical_b64 / attestation',
    });
    if (!shapeOk) {
        return { ok: false, reason: 'bundle shape invalid', checks };
    }

    const a = bundle.attestation;

    // 2. canonical_b64 decodes
    const canonical = base64ToBytes(bundle.canonical_b64);
    checks.push({
        ok: canonical !== null,
        label: 'canonical_b64 decodes',
        detail: canonical ? `${canonical.length} bytes` : 'invalid base64',
    });
    if (!canonical) return { ok: false, reason: 'canonical_b64 invalid base64', checks, attestation: a };

    // 3. sha256 === id
    const digest = await sha256(canonical);
    const computedId = bytesToHex(digest);
    const idOk = computedId === a.id;
    checks.push({
        ok: idOk,
        label: 'sha256(canonical_bytes) === id',
        detail: idOk ? a.id : `expected ${a.id}, got ${computedId}`,
    });
    if (!idOk) return { ok: false, reason: 'id does not match canonical-bytes hash', checks, attestation: a };

    // 4. JWK lookup + ed25519 verify
    let key: AuthKey | null = null;
    if (options.jwk) {
        if (options.jwk.kid !== bundle.kid) {
            checks.push({
                ok: false,
                label: 'JWK with matching kid present',
                detail: `provided jwk.kid=${options.jwk.kid} but bundle.kid=${bundle.kid}`,
            });
            return { ok: false, reason: 'kid mismatch with provided jwk', checks, attestation: a };
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
            return { ok: false, reason: 'provided jwk failed import', checks, attestation: a };
        }
    } else {
        const issuer = options.issuer ?? DEFAULT_ISSUER;
        const ttl = options.jwksCacheTtlMs ?? DEFAULT_TTL_MS;
        try {
            let entry = await fetchEnvelopeJwks(issuer, ttl);
            key = entry.keys[bundle.kid] ?? null;
            if (!key) {
                // Cache miss · likely a rotation. Force-refresh once.
                jwksCache.delete(issuer);
                entry = await fetchEnvelopeJwks(issuer, ttl);
                key = entry.keys[bundle.kid] ?? null;
            }
            checks.push({
                ok: !!key,
                label: 'JWK with matching kid present',
                detail: key ? `kid ${bundle.kid}` : `no JWK with kid ${bundle.kid} at ${issuer}${ENVELOPE_JWKS_PATH}`,
            });
            if (!key) {
                return { ok: false, reason: `kid ${bundle.kid} not in envelope JWKS`, checks, attestation: a };
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
                attestation: a,
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
        return { ok: false, reason: 'malformed sig', checks, attestation: a };
    }
    const sigOk = await verifyEd25519(key, sigBytes, canonical);
    checks.push({
        ok: sigOk,
        label: 'ed25519.verify(sig, canonical_bytes, jwk.public)',
        detail: sigOk ? 'signature valid' : 'signature does not match',
    });
    if (!sigOk) return { ok: false, reason: 'signature does not match', checks, attestation: a };

    // 5. Freshness
    const now = options.now ?? new Date();
    const expiresMs = Date.parse(a.expires_at);
    const freshOk = Number.isFinite(expiresMs) && expiresMs > now.getTime();
    checks.push({
        ok: freshOk,
        label: 'now < attestation.expires_at',
        detail: freshOk
            ? `expires ${new Date(expiresMs).toISOString()}`
            : 'attestation has expired',
    });
    if (!freshOk) return { ok: false, reason: 'attestation has expired', checks, attestation: a };

    return { ok: true, attestation: a, checks };
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
