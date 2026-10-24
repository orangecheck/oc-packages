/**
 * Two things a site's own backend does with the token from the sign-in popup,
 * once it has verified it (ochk.io/docs/me/sdk):
 *
 *   spendOnce(jti, exp, store)  → true the first time, false for a repeat
 *   revokeToken(token)          → { ok, revoked } | { ok: false, reason, status }
 *
 * spendOnce keeps a token from starting a second session; revokeToken ends it
 * at the auth host once the site's own session has taken over. Only a mistake
 * in the call itself throws, before anything is read or sent.
 */

const DEFAULT_ISSUER = 'https://ochk.io';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30_000;
/** What ochk.io's /api/auth/revoke takes in one call. */
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 4096;

function fail(message: string): never {
    throw new TypeError(`@orangecheck/me-client: ${message}`);
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Where you record the jti of each token you accepted, until it expires. Yours
 * to provide, shared by every server that accepts sign-ins: a unique row in your
 * database, or Redis `SET jti 1 NX EXAT exp`. `add` must be atomic: true when
 * it recorded the jti, false when the jti was there already.
 */
export interface JtiStore {
    add(jti: string, exp: number): boolean | Promise<boolean>;
}

/**
 * A {@link JtiStore} in this process's memory: for tests and a single process.
 * Two servers, or a restart, each have their own, so a token could start a
 * session on each: in production, use a store they share.
 */
export class MemoryJtiStore implements JtiStore {
    private readonly spent = new Map<string, number>();

    add(jti: string, exp: number): boolean {
        const now = nowSeconds();
        for (const [k, until] of this.spent) if (until <= now) this.spent.delete(k);
        if (this.spent.has(jti)) return false;
        this.spent.set(jti, exp);
        return true;
    }
}

/**
 * Spend a verified token's `jti` so it starts one session: true the first time,
 * false for a repeat or a token that has expired (`exp`, in seconds, at or
 * before now). Call it after verifying the token and before starting your own
 * session; on false, refuse the sign-in. A store that fails throws, so the
 * sign-in fails closed.
 */
export function spendOnce(jti: string, exp: number, store: JtiStore): Promise<boolean> {
    if (typeof jti !== 'string' || jti === '') fail('spendOnce: jti must be one non-empty string');
    if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        fail("spendOnce: exp must be the token's expiry, in seconds");
    }
    if (store === null || typeof store !== 'object' || typeof store.add !== 'function') {
        fail('spendOnce: store must have add(jti, exp)');
    }
    if (exp <= nowSeconds()) return Promise.resolve(false);
    return Promise.resolve()
        .then(() => store.add(jti, exp))
        .then((spent) => {
            if (typeof spent !== 'boolean') fail('spendOnce: store.add must answer true or false');
            return spent;
        });
}

export interface RevokeTokenOptions {
    /** The auth host that issued the token. Default https://ochk.io. */
    issuer?: string;
    /** Answer `unavailable` after this long. Default 5000, at most 30000. */
    timeoutMs?: number;
}

/**
 * Why ochk.io did not end the tokens. `unavailable` covers an outage, a timeout
 * and any answer this SDK can't read: the token still ends when it expires.
 */
export type RevokeTokenRefusal = 'rate_limited' | 'bad_request' | 'unavailable';

/**
 * `revoked` counts the tokens ochk.io ended: 0 when it could not read one as
 * its own (expired already, or signed elsewhere). A refusal's `status` is
 * ochk.io's HTTP status, 0 when nothing came back.
 */
export type RevokeTokenResult =
    | { ok: true; revoked: number }
    | { ok: false; reason: RevokeTokenRefusal; status: number };

const REVOKE_OPTIONS: ReadonlySet<string> = new Set<keyof RevokeTokenOptions>(['issuer', 'timeoutMs']);

/**
 * The issuer as one origin, `scheme://host[:port]`: https, or http on this
 * machine only. A path, a query, a fragment or a user name would send the
 * tokens somewhere else on the host (or carry credentials), so each is refused.
 */
export function issuerOrigin(issuer: unknown, where = 'revokeToken'): string {
    if (typeof issuer !== 'string') fail(`${where}: issuer must be a URL`);
    const refuse = (): never =>
        fail(`${where}: issuer must be one https origin (http only on this machine), such as https://ochk.io, got ${issuer}`);
    if (/[?#@\\]/.test(issuer)) refuse();
    let url: URL;
    try {
        url = new URL(issuer);
    } catch {
        return refuse();
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) refuse();
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
        refuse();
    }
    return url.origin;
}

/**
 * End a sign-in token at the auth host (`POST /api/auth/revoke`), on every
 * site that reads the list of ended sessions. Holding a token is the authority
 * to end it; nothing else is sent. Call it once your own session has taken
 * over. Takes one token or up to eight. An outage is a result, never a throw,
 * so it can't break a sign-in.
 */
export function revokeToken(
    token: string | readonly string[],
    options: RevokeTokenOptions = {}
): Promise<RevokeTokenResult> {
    if (options === null || typeof options !== 'object') fail('revokeToken: options must be an object');
    const unknown = Object.keys(options).filter((k) => !REVOKE_OPTIONS.has(k));
    if (unknown.length > 0) {
        fail(`revokeToken: unknown option ${unknown.join(', ')}. It reads only ${[...REVOKE_OPTIONS].join(', ')}.`);
    }
    const tokens = typeof token === 'string' ? [token] : Array.isArray(token) ? [...token] : null;
    if (
        !tokens ||
        tokens.length < 1 ||
        tokens.length > MAX_TOKENS ||
        !tokens.every((t) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TOKEN_LENGTH)
    ) {
        fail(`revokeToken: pass one token, or 1 to ${MAX_TOKENS}, each a non-empty string of at most ${MAX_TOKEN_LENGTH} characters`);
    }
    const origin = issuerOrigin(options.issuer ?? DEFAULT_ISSUER);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof timeoutMs !== 'number' || !(timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS)) {
        fail(`revokeToken: timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`);
    }
    return post(`${origin}/api/auth/revoke`, tokens, timeoutMs);
}

async function post(url: string, tokens: string[], timeoutMs: number): Promise<RevokeTokenResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            // The endpoint never redirects, so a redirect is an error: the tokens go
            // to the auth host and nowhere else.
            redirect: 'error',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tokens }),
            signal: controller.signal,
        });
        let body: unknown = null;
        try {
            body = await res.json();
        } catch {
            body = null;
        }
        const b = body !== null && typeof body === 'object' ? (body as { ok?: unknown; revoked?: unknown }) : null;
        if (res.status === 200) {
            return b?.ok === true && Number.isSafeInteger(b.revoked) && (b.revoked as number) >= 0
                ? { ok: true, revoked: b.revoked as number }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
        if (res.status === 429) return { ok: false, reason: 'rate_limited', status: 429 };
        if (res.status === 400) return { ok: false, reason: 'bad_request', status: 400 };
        return { ok: false, reason: 'unavailable', status: res.status };
    } catch {
        return { ok: false, reason: 'unavailable', status: 0 };
    } finally {
        clearTimeout(timer);
    }
}
