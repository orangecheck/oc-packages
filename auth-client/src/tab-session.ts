/**
 * Per-tab account pinning · sessionStorage-backed.
 *
 * One browser holds ONE shared `oc_session` cookie (the browser-wide
 * default account) but may be signed into N roster accounts at once. A
 * tab pins itself to one account by holding that account's session JWT
 * here — sessionStorage is per-tab by nature — and sending it on every
 * same-site API call as the `x-oc-tab-session` header. Servers verify
 * the header exactly like the cookie token (it IS a session JWT, a
 * credential, never a bare account selector), so switching accounts in
 * one tab no longer yanks the identity out from under every other tab.
 *
 * Trade-off, named: a pinned token is readable by same-origin script,
 * unlike the HttpOnly cookie. An XSS on a family site can already act
 * as the user via `credentials: 'include'`; the marginal exposure is
 * token exfiltration for offline use, bounded by the token's TTL and
 * the host's per-row revocation. The host has echoed session JWTs in
 * `/api/auth/signin` / `/api/auth/switch` response bodies since the
 * multi-account migration, so this channel is not new.
 */

/** Header carrying the tab-pinned session JWT. Mirrors `@orangecheck/auth-core`'s `TAB_SESSION_HEADER`. */
export const TAB_SESSION_HEADER = 'x-oc-tab-session';

export const TAB_SESSION_STORAGE_KEY = 'oc_tab_session';

/**
 * Hash marker the auth host appends to a post-ceremony redirect so the
 * landing tab adopts the cookie account instead of keeping a stale pin
 * (the user just completed a sign-in/add ceremony and expects to BE the
 * new account in that tab). Never sent to any server (it's a fragment).
 */
export const TAB_ADOPT_HASH = '#oc-adopt';

export interface OcTabSession {
    token: string;
    didOc: string;
}

export function readTabSession(): OcTabSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { token?: unknown; didOc?: unknown };
        if (typeof parsed.token !== 'string' || parsed.token.length === 0) return null;
        if (typeof parsed.didOc !== 'string' || parsed.didOc.length === 0) return null;
        return { token: parsed.token, didOc: parsed.didOc };
    } catch {
        // sessionStorage can throw (privacy modes) · malformed JSON → unpinned
        return null;
    }
}

export function writeTabSession(session: OcTabSession): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
        // quota / privacy mode — degrade to unpinned (cookie-default) behavior
    }
}

export function clearTabSession(): void {
    if (typeof window === 'undefined') return;
    try {
        window.sessionStorage.removeItem(TAB_SESSION_STORAGE_KEY);
    } catch {
        // nothing to clear
    }
}

/** `{ 'x-oc-tab-session': <jwt> }` when this tab is pinned, else `{}`. */
export function tabSessionHeader(): Record<string, string> {
    const pin = readTabSession();
    return pin ? { [TAB_SESSION_HEADER]: pin.token } : {};
}

/**
 * Should this request carry the tab pin? Same-origin requests (relative
 * URLs or the page's own origin) and requests to the auth host — never
 * third parties.
 */
function isPinnableUrl(url: string, authOrigin: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const u = new URL(url, window.location.href);
        return u.origin === window.location.origin || u.origin === authOrigin;
    } catch {
        return false;
    }
}

/**
 * Install a scoped `window.fetch` wrapper that attaches the tab pin to
 * every same-site request, so app-level data fetches (vault shares, me
 * wallet, fleet projects, …) execute as the account this tab displays —
 * without touching any call site. Returns an uninstaller.
 *
 * Conservative by design:
 *   - no pin → pass-through (zero behavior change)
 *   - only same-origin + auth-host URLs (see {@link isPinnableUrl})
 *   - never overrides an existing `Authorization` or `x-oc-tab-session`
 *     header (programmatic Bearer / integrator-token paths keep their
 *     own credential semantics)
 *   - any internal error → original fetch, untouched
 */
export function installTabFetchInterceptor(authOrigin: string): () => void {
    if (typeof window === 'undefined') return () => {};
    const original = window.fetch;
    const wrapped: typeof window.fetch = (input, init) => {
        try {
            const pin = readTabSession();
            if (pin) {
                const url =
                    typeof input === 'string'
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url;
                if (isPinnableUrl(url, authOrigin)) {
                    const headers = new Headers(
                        init?.headers ?? (input instanceof Request ? input.headers : undefined)
                    );
                    if (!headers.has('authorization') && !headers.has(TAB_SESSION_HEADER)) {
                        headers.set(TAB_SESSION_HEADER, pin.token);
                        init = { ...init, headers };
                    }
                }
            }
        } catch {
            // never break a fetch over pinning
        }
        return original.call(window, input as RequestInfo | URL, init);
    };
    window.fetch = wrapped;
    return () => {
        // only restore if nobody else wrapped on top of us in the meantime
        if (window.fetch === wrapped) window.fetch = original;
    };
}

/**
 * If the URL carries the {@link TAB_ADOPT_HASH} marker, clear the pin
 * (so the tab adopts the cookie account) and strip the marker from the
 * address bar. Returns `true` when adoption happened.
 */
export function consumeTabAdoptMarker(): boolean {
    if (typeof window === 'undefined') return false;
    if (!window.location.hash.includes(TAB_ADOPT_HASH.slice(1))) return false;
    clearTabSession();
    try {
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState(window.history.state, '', url.toString());
    } catch {
        // cosmetic only — a lingering #oc-adopt re-adopts on reload, which
        // is idempotent (the pin is already cleared).
    }
    return true;
}
