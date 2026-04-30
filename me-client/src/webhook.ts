import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

/**
 * Public Ed25519 JWK published at ochk.io/.well-known/jwks.json. Webhook
 * verification uses the key matching the OC-Key-Id header.
 */
export interface OcPublicJwk {
    kty: 'OKP';
    crv: 'Ed25519';
    x: string;
    kid: string;
    alg?: string;
    use?: string;
}

export interface VerifyResult {
    ok: boolean;
    /** Reason verification failed. Undefined when ok is true. */
    reason?: string;
    /** kid that was matched (or attempted). */
    key_id?: string;
}

const FAMILY_JWKS_URL = 'https://ochk.io/.well-known/jwks.json';

let cachedJwks: { fetched_at: number; keys: OcPublicJwk[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

/** Fetch (and short-cache) the OC public JWKS. */
async function fetchJwks(): Promise<OcPublicJwk[]> {
    if (cachedJwks && Date.now() - cachedJwks.fetched_at < JWKS_TTL_MS) {
        return cachedJwks.keys;
    }
    const res = await fetch(FAMILY_JWKS_URL, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`failed to fetch JWKS: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { keys: OcPublicJwk[] };
    cachedJwks = { fetched_at: Date.now(), keys: data.keys };
    return data.keys;
}

function base64urlDecode(input: string): Uint8Array {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(
        Math.ceil(input.length / 4) * 4,
        '='
    );
    const bin =
        typeof atob === 'function'
            ? atob(padded)
            : Buffer.from(padded, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function hexDecode(input: string): Uint8Array {
    const clean = input.toLowerCase().replace(/^0x/, '');
    if (clean.length % 2 !== 0) throw new Error('hex string has odd length');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/**
 * Verify a webhook signature against the raw request body. The signature
 * is hex-encoded in the OC-Signature header; the kid is in OC-Key-Id.
 *
 * NOTE: pass the *raw* body bytes (not the parsed JSON). Frameworks that
 * re-serialize before your handler runs produce a different byte sequence
 * and verification will fail. In Express set
 *   app.use(express.text({ type: '*\/*' }));
 * In Next.js Pages API routes set
 *   export const config = { api: { bodyParser: false } };
 *
 * If `jwk` is omitted the function fetches and caches OC's published JWKS
 * for an hour. Pre-fetching once on boot and passing the matching JWK
 * here is the recommended hot path.
 */
export async function verify(
    rawBody: string | Uint8Array,
    sigHex: string,
    kid: string,
    jwk?: OcPublicJwk
): Promise<VerifyResult> {
    let key = jwk;
    if (!key || key.kid !== kid) {
        const keys = await fetchJwks();
        key = keys.find((k) => k.kid === kid);
        if (!key) {
            return { ok: false, reason: `no JWK with kid=${kid} in published JWKS`, key_id: kid };
        }
    }
    if (key.kty !== 'OKP' || key.crv !== 'Ed25519') {
        return { ok: false, reason: `JWK kid=${kid} is not Ed25519`, key_id: kid };
    }

    let pubKey: Uint8Array;
    try {
        pubKey = base64urlDecode(key.x);
    } catch (err) {
        return {
            ok: false,
            reason: `failed to decode JWK x: ${(err as Error).message}`,
            key_id: kid,
        };
    }
    if (pubKey.length !== 32) {
        return {
            ok: false,
            reason: `Ed25519 public key must be 32 bytes; got ${pubKey.length}`,
            key_id: kid,
        };
    }

    let sig: Uint8Array;
    try {
        sig = hexDecode(sigHex);
    } catch (err) {
        return {
            ok: false,
            reason: `failed to decode signature: ${(err as Error).message}`,
            key_id: kid,
        };
    }
    if (sig.length !== 64) {
        return {
            ok: false,
            reason: `Ed25519 signature must be 64 bytes; got ${sig.length}`,
            key_id: kid,
        };
    }

    const bodyBytes =
        typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : rawBody;
    const hash = sha256(bodyBytes);

    try {
        const ok = ed25519.verify(sig, hash, pubKey);
        return ok
            ? { ok: true, key_id: kid }
            : { ok: false, reason: 'signature does not match', key_id: kid };
    } catch (err) {
        return { ok: false, reason: (err as Error).message, key_id: kid };
    }
}

export const webhook = { verify, fetchJwks };
