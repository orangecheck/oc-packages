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
 * URL-fragment key the link decorator stamps onto family-origin
 * navigations so a NEW tab (or a cross-subdomain document GET) inherits
 * the OPENER tab's effective account instead of falling back to the
 * shared cookie's default account.
 *
 * The value is the account's `did:oc` — a PUBLIC identifier, never the
 * session JWT. It rides a fragment (`#oc-as=<did>`), which is never sent
 * to any server, and the host re-validates roster membership before
 * minting a tab token for it, so a hand-crafted link grants nothing the
 * visitor's own cookie/roster doesn't already authorize.
 */
export const TAB_ACCOUNT_HINT_KEY = 'oc-as';

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

// ─── Cross-tab account inheritance (the new-tab pin handoff) ────────────
//
// The pin lives in sessionStorage, which a NEW tab does not inherit
// cross-origin (and not at all on Safari). So a CTRL/⌘/middle-click on a
// family link — or a same-tab navigation to a sibling subdomain — would
// land unpinned and resolve to the shared cookie's DEFAULT account, i.e.
// "the other account." We bridge the gap WITHOUT putting a credential in
// a URL: the opener tab stamps the destination link with the public
// `did:oc` of its effective account (`#oc-as=<did>`), and the landing
// tab mints its own pin for that account via the host (which re-checks
// roster membership). The did is a selector, not a credential.

const OC_AS_HINT_RE = /^oc-as=(did:oc:[0-9a-f]{32})$/;

/** Apex hostname of the auth host, e.g. `ochk.io`. Null if unparseable. */
function familyApex(authOrigin: string): string | null {
    try {
        return new URL(authOrigin).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Is `u` a family destination worth stamping — current origin or any
 * host at/under the auth host's apex (so `stamp.ochk.io`, `ochk.io`,
 * etc. match, but `example.com` never does)? http(s) only — `mailto:`,
 * `tel:`, `javascript:`, `blob:` are excluded by construction.
 */
function isFamilyUrl(u: URL, authOrigin: string): boolean {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (typeof window !== 'undefined' && u.origin === window.location.origin) return true;
    const apex = familyApex(authOrigin);
    if (!apex) return false;
    const host = u.hostname.toLowerCase();
    return host === apex || host.endsWith(`.${apex}`);
}

/** Would following this link land in a context that can't see this tab's pin? */
function opensWithoutTabPin(e: MouseEvent, anchor: HTMLAnchorElement, dest: URL): boolean {
    // Cross-origin always loses the pin (sessionStorage is per-origin).
    if (typeof window !== 'undefined' && dest.origin !== window.location.origin) return true;
    // Same-origin: only a NEW tab/window risks losing it (Safari doesn't
    // clone sessionStorage); a same-tab navigation keeps it, so leave
    // those links untouched to avoid needless URL noise.
    const target = (anchor.getAttribute('target') ?? '').toLowerCase();
    return (
        e.button === 1 || // middle-click
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        target === '_blank'
    );
}

/**
 * Install a capture-phase listener that stamps the tab's effective
 * `did:oc` onto outgoing family-origin links the instant they're
 * activated, so a new/cross-subdomain tab adopts THIS tab's account.
 * Returns an uninstaller. Mirrors {@link installTabFetchInterceptor}'s
 * conservatism:
 *   - no pin → never stamps (zero behavior change)
 *   - family origins only → never leaks the did to third parties
 *   - reads the pin FRESH per event (no install-time capture)
 *   - never clobbers an existing `#fragment`, a download, or a
 *     non-http(s) scheme
 *   - any internal error → leaves the link alone
 *
 * It mutates `a.href` in place rather than calling `window.open`, so it
 * never trips a popup blocker and the browser's own ctrl/⌘/middle-click
 * handling (and the context menu's "open in new tab") all carry the
 * stamp. The stamp is idempotent and self-healing — React resets the
 * href on the next render, and the destination strips the fragment via
 * {@link consumeTabAccountHint}.
 */
export function installTabLinkDecorator(authOrigin: string): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
    const onActivate = (e: MouseEvent) => {
        try {
            const pin = readTabSession();
            if (!pin) return;
            const target = e.target;
            if (!(target instanceof Element)) return;
            const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
            if (!anchor || anchor.hasAttribute('download')) return;
            const raw = anchor.getAttribute('href');
            if (!raw || raw.includes(`${TAB_ACCOUNT_HINT_KEY}=`)) return;
            let dest: URL;
            try {
                dest = new URL(anchor.href);
            } catch {
                return;
            }
            if (dest.hash) return; // don't clobber a real #anchor deep-link
            if (!isFamilyUrl(dest, authOrigin)) return;
            if (!opensWithoutTabPin(e, anchor, dest)) return;
            anchor.setAttribute('href', `${raw}#${TAB_ACCOUNT_HINT_KEY}=${pin.didOc}`);
        } catch {
            // never break a navigation over decoration
        }
    };
    window.addEventListener('click', onActivate, true);
    window.addEventListener('auxclick', onActivate, true);
    return () => {
        window.removeEventListener('click', onActivate, true);
        window.removeEventListener('auxclick', onActivate, true);
    };
}

/**
 * On load, if the URL carries `#oc-as=<did>`, adopt that account for
 * THIS tab: mint a pin for it via the host's `/api/auth/tab` (which
 * re-validates the did is in this browser's roster) and stash it in
 * sessionStorage, then strip the fragment from the address bar. Must run
 * BEFORE the provider's first `/api/auth/me` fetch so that fetch carries
 * the right pin.
 *
 * Returns the adopted `did:oc` on success, else null. Best-effort and
 * fail-safe: a stale host (no targeted minting), a roster miss (403), or
 * a network error leaves the tab unpinned — exactly the legacy
 * cookie-following behavior. The fragment is always stripped so it never
 * lingers in history/bookmarks or re-fires on reload.
 */
export async function consumeTabAccountHint(authOrigin: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    const frag = window.location.hash.replace(/^#/, '');
    const m = OC_AS_HINT_RE.exec(frag);
    if (!m) return null;
    const did = m[1]!;
    // Strip the fragment regardless of what happens next.
    try {
        const url = new URL(window.location.href);
        url.hash = '';
        window.history.replaceState(window.history.state, '', url.toString());
    } catch {
        // cosmetic only
    }
    // Already pinned to the hinted account (same-tab nav, or a same-origin
    // new tab that cloned sessionStorage) → nothing to mint.
    const existing = readTabSession();
    if (existing && existing.didOc === did) return did;
    try {
        const res = await fetch(`${authOrigin}/api/auth/tab`, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ did_oc: did }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
            ok?: boolean;
            token?: string;
            account?: { did_oc?: string };
        };
        // Only pin when the host minted for the hinted account — a stale
        // host that ignores the body mints for the cookie account, which
        // we must NOT adopt (it's the wrong-account bug we're fixing).
        if (body.ok && typeof body.token === 'string' && body.account?.did_oc === did) {
            writeTabSession({ token: body.token, didOc: did });
            return did;
        }
    } catch {
        // best-effort by construction
    }
    return null;
}
