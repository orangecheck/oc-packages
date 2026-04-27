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
