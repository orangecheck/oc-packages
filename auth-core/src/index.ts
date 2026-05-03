/**
 * @orangecheck/auth-core
 *
 * Cross-subdomain oc_session JWT verification + cookie helpers.
 *
 * The auth HOST (whoever owns sign-in) holds a private key and issues
 * tokens with `signSession()`. Every CONSUMER subdomain holds only the
 * public JWK and verifies tokens locally with `verifySessionToken()` —
 * no network round-trip, no shared secret.
 *
 * The ochk.io ecosystem picks Ed25519 (EdDSA) with JWKs distributed
 * via environment variable. The public key is also published at
 * `/.well-known/jwks.json` on the auth host for dynamic discovery.
 */

import {
    importJWK,
    jwtVerify,
    SignJWT,
    type CryptoKey,
    type JWTPayload,
    type KeyObject,
} from 'jose';

export const JWT_ALG = 'EdDSA' as const;
export const SESSION_COOKIE = 'oc_session' as const;
export const DEFAULT_ISSUER = 'https://ochk.io' as const;

export type AuthKey = CryptoKey | KeyObject;

export interface SessionPayload extends JWTPayload {
    sub: string;
    addr: string;
    jti: string;
    /**
     * Optional display name set by the user via the auth host's profile
     * surface. When present, consumer subdomains can render it in their
     * header chip without a network round-trip. Re-minted on signin and
     * whenever the user updates their profile.
     */
    name?: string | null;
    /** Optional Nostr npub set by the user. Same lifecycle as `name`. */
    npub?: string | null;
}

export interface VerifyConfig {
    /** Base64url-encoded JWK containing the Ed25519 public key. */
    publicJwk: string;
    /** Expected `iss` claim. Tokens with a different issuer are rejected. */
    issuer?: string;
}

export interface SignConfig extends VerifyConfig {
    /** Base64url-encoded JWK containing the Ed25519 private key. */
    privateJwk: string;
    /** Short key id placed in the JWT header (`kid`). Must match the JWK. */
    kid: string;
}

// ─── JWK helpers ────────────────────────────────────────────────────────

function decodeJwk(value: string): Record<string, unknown> {
    const json =
        typeof Buffer !== 'undefined'
            ? Buffer.from(value, 'base64url').toString('utf8')
            : new TextDecoder().decode(base64UrlDecode(value));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('[@orangecheck/auth-core] JWK env did not decode to an object');
    }
    return parsed;
}

function base64UrlDecode(input: string): Uint8Array {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
    const bin = typeof atob !== 'undefined' ? atob(b64) : '';
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

let publicKeyPromise: Promise<AuthKey> | null = null;
let publicKeyCache: string | null = null;
export function loadPublicKey(publicJwk: string): Promise<AuthKey> {
    if (!publicKeyPromise || publicKeyCache !== publicJwk) {
        publicKeyCache = publicJwk;
        publicKeyPromise = importJWK(decodeJwk(publicJwk), JWT_ALG) as Promise<AuthKey>;
    }
    return publicKeyPromise;
}

let privateKeyPromise: Promise<AuthKey> | null = null;
let privateKeyCache: string | null = null;
export function loadPrivateKey(privateJwk: string): Promise<AuthKey> {
    if (!privateKeyPromise || privateKeyCache !== privateJwk) {
        privateKeyCache = privateJwk;
        privateKeyPromise = importJWK(decodeJwk(privateJwk), JWT_ALG) as Promise<AuthKey>;
    }
    return privateKeyPromise;
}

/** Parse the `OC_AUTH_PUBLIC_JWK` env var back into a JWK object. */
export function parsePublicJwk(publicJwk: string): Record<string, unknown> {
    return decodeJwk(publicJwk);
}

// ─── Sign / verify ──────────────────────────────────────────────────────

/**
 * Mint a fresh oc_session JWT. Only called on the auth host (the only
 * place that holds the private key).
 *
 * The caller owns persisting `jti` to a revocation list if they want
 * revocation semantics — auth-core is deliberately stateless.
 */
export async function signSession(
    claims: {
        sub: string;
        addr: string;
        jti: string;
        name?: string | null;
        npub?: string | null;
    },
    cfg: SignConfig,
    ttlSeconds: number
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
        .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT', kid: cfg.kid })
        .setIssuer(cfg.issuer ?? DEFAULT_ISSUER)
        .setIssuedAt(now)
        .setExpirationTime(now + ttlSeconds)
        .sign(await loadPrivateKey(cfg.privateJwk));
}

/**
 * Crypto-only JWT verify. Returns the payload on success, `null` on
 * any failure (bad signature, expired, wrong issuer, malformed).
 *
 * Safe for consumer subdomains — they only need the public JWK.
 * Revocation-aware checks live on the auth host.
 */
export async function verifySessionToken(
    token: string,
    cfg: VerifyConfig
): Promise<SessionPayload | null> {
    try {
        const res = await jwtVerify(token, await loadPublicKey(cfg.publicJwk), {
            algorithms: [JWT_ALG],
            issuer: cfg.issuer ?? DEFAULT_ISSUER,
        });
        const p = res.payload as SessionPayload;
        if (!p.sub || !p.addr || !p.jti) return null;
        return p;
    } catch {
        return null;
    }
}

// ─── Cookie helpers ─────────────────────────────────────────────────────

export interface CookieOptions {
    domain?: string;
    maxAge?: number;
    expires?: Date;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Lax' | 'Strict' | 'None';
}

/**
 * Serialize a cookie header value for `Set-Cookie`. Defaults match the
 * ochk.io session shape: HttpOnly, SameSite=Lax, Path=/, Secure in prod.
 */
export function serializeSessionCookie(
    token: string,
    opts: CookieOptions = {}
): string {
    const parts: string[] = [`${SESSION_COOKIE}=${token}`];
    parts.push(`Path=${opts.path ?? '/'}`);
    if (opts.httpOnly ?? true) parts.push('HttpOnly');
    parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
    if (opts.secure ?? true) parts.push('Secure');
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
    return parts.join('; ');
}

/** Clear the session cookie. Must match the Domain used when it was set. */
export function clearSessionCookieHeader(opts: Pick<CookieOptions, 'domain' | 'path' | 'secure'> = {}): string {
    return serializeSessionCookie('', {
        ...opts,
        maxAge: 0,
        expires: new Date(0),
    });
}

/**
 * Read the oc_session token out of a raw `Cookie:` header string.
 * Returns `null` if the cookie is missing or empty.
 */
export function readSessionCookie(cookieHeader: string | null | undefined): string | null {
    if (!cookieHeader) return null;
    const prefix = `${SESSION_COOKIE}=`;
    for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        if (trimmed.startsWith(prefix)) {
            const val = trimmed.slice(prefix.length);
            return val.length > 0 ? val : null;
        }
    }
    return null;
}

// ─── JWKS-aware verification (zero env vars · zero JWK handling) ─────────
//
// verifyOcToken / getOcSession are the integrator-facing verification
// primitives. They lazy-fetch the auth host's published JWKS at
// `<issuer>/.well-known/jwks.json` and cache it in-process. Integrators
// install @orangecheck/me-client (which re-exports these), call
// `verifyOcToken(token)` or `getOcSession(headers)`, and never see a
// JWK string, an env var, or a base64 dance.

const DEFAULT_JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

interface JwksCacheEntry {
    keys: Record<string, AuthKey>;
    fetchedAt: number;
}

const jwksCache = new Map<string, JwksCacheEntry>();
const inflight = new Map<string, Promise<JwksCacheEntry>>();

interface JwksJson {
    keys: Array<Record<string, unknown> & { kid?: string }>;
}

async function fetchJwks(issuer: string, ttlMs: number): Promise<JwksCacheEntry> {
    const cached = jwksCache.get(issuer);
    if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached;
    const existing = inflight.get(issuer);
    if (existing) return existing;
    const p = (async (): Promise<JwksCacheEntry> => {
        const url = `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
            throw new Error(`[@orangecheck/auth-core] JWKS fetch ${url} returned ${res.status}`);
        }
        const json = (await res.json()) as JwksJson;
        if (!json || !Array.isArray(json.keys)) {
            throw new Error(`[@orangecheck/auth-core] JWKS at ${url} did not return {keys:[…]}`);
        }
        const keys: Record<string, AuthKey> = {};
        for (const k of json.keys) {
            if (typeof k.kid !== 'string') continue;
            try {
                keys[k.kid] = (await importJWK(k, JWT_ALG)) as AuthKey;
            } catch {
                /* skip keys that won't import for our alg */
            }
        }
        const entry: JwksCacheEntry = { keys, fetchedAt: Date.now() };
        jwksCache.set(issuer, entry);
        return entry;
    })().finally(() => {
        inflight.delete(issuer);
    });
    inflight.set(issuer, p);
    return p;
}

export interface VerifyOcOptions {
    /** Auth host issuer. Defaults to https://ochk.io. */
    issuer?: string;
    /** JWKS cache TTL in ms. Defaults to 1 hour. Stale-on-error: if the
     *  cache exists, verification still works during a transient outage. */
    jwksCacheTtlMs?: number;
}

/**
 * Verify a JWT issued by an OC auth host. Lazy-fetches the JWKS from
 * `<issuer>/.well-known/jwks.json`, picks the key whose `kid` matches
 * the token's protected header, and verifies the signature.
 *
 * Returns the payload on success, `null` on any failure (bad signature,
 * expired, wrong issuer, kid not in JWKS, malformed). Never throws.
 *
 * Integrators don't need to handle JWKs, env vars, or rotation — the
 * cache picks up new keys automatically when they appear in the JWKS
 * response. Stale tokens signed under a retired key continue to verify
 * as long as the retired key is still published in the JWKS (standard
 * key-rotation overlap window).
 */
export async function verifyOcToken(
    token: string,
    options: VerifyOcOptions = {}
): Promise<SessionPayload | null> {
    const issuer = options.issuer ?? DEFAULT_ISSUER;
    const ttl = options.jwksCacheTtlMs ?? DEFAULT_JWKS_TTL_MS;
    try {
        // Fast path: try the cache. If the kid isn't in the cache (e.g.
        // brand-new key just rotated in), fall through to a fresh fetch.
        let entry = await fetchJwks(issuer, ttl);
        const headerB64 = token.split('.')[0];
        if (!headerB64) return null;
        const headerJson =
            typeof Buffer !== 'undefined'
                ? Buffer.from(headerB64, 'base64url').toString('utf8')
                : new TextDecoder().decode(base64UrlDecode(headerB64));
        const header = JSON.parse(headerJson) as { kid?: string; alg?: string };
        if (!header.kid) return null;
        let key = entry.keys[header.kid];
        if (!key) {
            // Force a fresh JWKS fetch in case the integrator's cache is
            // older than the active key set on the auth host.
            jwksCache.delete(issuer);
            entry = await fetchJwks(issuer, ttl);
            key = entry.keys[header.kid];
        }
        if (!key) return null;
        const res = await jwtVerify(token, key, {
            algorithms: [JWT_ALG],
            issuer,
        });
        const p = res.payload as SessionPayload;
        if (!p.sub || !p.addr || !p.jti) return null;
        return p;
    } catch {
        return null;
    }
}

export interface SessionRequestHeaders {
    cookie?: string | null;
    authorization?: string | null;
}

/**
 * Verify the OC session for a request. Accepts either a plain object
 * with `cookie` / `authorization` properties (Express / Next.js / etc.)
 * or a Web Headers object (Hono / edge / Fetch API). Reads the session
 * from the Cookie header first; falls back to a `Authorization: Bearer
 * <token>` header so cross-domain integrators (different eTLD+1, no
 * .ochk.io cookie) can verify the same way.
 *
 * Returns `null` for unauthenticated, missing, or invalid requests.
 * Never throws.
 */
export async function getOcSession(
    headers: SessionRequestHeaders | Headers,
    options: VerifyOcOptions = {}
): Promise<SessionPayload | null> {
    const cookie = isHeaders(headers) ? headers.get('cookie') : (headers.cookie ?? null);
    const authorization = isHeaders(headers)
        ? headers.get('authorization')
        : (headers.authorization ?? null);
    let token = readSessionCookie(cookie);
    if (!token && typeof authorization === 'string') {
        const m = /^Bearer\s+(.+)$/i.exec(authorization);
        if (m) token = m[1]!;
    }
    if (!token) return null;
    return verifyOcToken(token, options);
}

function isHeaders(value: unknown): value is Headers {
    return (
        typeof Headers !== 'undefined' && value !== null && typeof value === 'object' && value instanceof Headers
    );
}
