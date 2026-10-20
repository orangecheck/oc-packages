/**
 * A return address never carries a fragment.
 *
 * A fragment can hold what a page means to keep in the browser: a share
 * link's envelope, a team invite's key. A return address travels in a query
 * string (`/sudo?return_to=…`, `/signin?return_to=…`), and a query reaches the
 * server, its logs and its analytics. So every return address this package
 * builds has its fragment taken off. When the browser leaves for one, the
 * fragment is kept in this tab's sessionStorage under the path it belongs
 * to, and OcSessionProvider puts it back when the browser lands on that path
 * again, before the page renders.
 *
 * It is kept at the moment of leaving, never while a page merely renders a
 * link: redirectToSudo and returnToHere keep it when called, and the provider
 * keeps it when a link carrying this page as its return_to is followed. What
 * is kept stays in the tab that had it, is used once, and is dropped after
 * {@link FRAGMENT_TTL_MS}. A return to another origin loses its fragment
 * rather than carry it: sessionStorage belongs to one origin.
 */

const PREFIX = 'oc:return-fragment:';

/** Long enough for an email code or a wallet signature; short enough not to linger. */
export const FRAGMENT_TTL_MS = 15 * 60 * 1000;

function store(): Storage | null {
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

/** `target` without its fragment. Pure: what to put in a URL, for a link rendered now and followed later. */
export function stripFragment(target: string): string {
    const cut = target.indexOf('#');
    return cut < 0 ? target : target.slice(0, cut);
}

function keep(pathAndQuery: string, hash: string): void {
    if (hash.length < 2) return;
    try {
        store()?.setItem(PREFIX + pathAndQuery, JSON.stringify({ hash, at: Date.now() }));
    } catch {
        // Storage refused: the fragment is dropped, never sent.
    }
}

/**
 * `target` without its fragment, for a browser about to leave for it. A
 * fragment on a same-origin target is kept for {@link restoreReturnFragment}.
 * Safe on the server, where it only cuts the fragment off.
 */
export function withoutFragment(target: string): string {
    if (typeof window !== 'undefined' && target.includes('#')) {
        try {
            const u = new URL(target, window.location.href);
            if (u.origin === window.location.origin) keep(u.pathname + u.search, u.hash);
        } catch {
            // Not a URL: nothing to keep.
        }
    }
    return stripFragment(target);
}

/**
 * This page as a return address: its path and query, never its fragment,
 * which is kept and restored on return. For a site that builds
 * `/signin?return_to=` itself:
 *
 *   `/signin?return_to=${encodeURIComponent(returnToHere())}`
 */
export function returnToHere(): string {
    if (typeof window === 'undefined') return '/';
    const { pathname, search, hash } = window.location;
    return withoutFragment(pathname + search + hash);
}

/**
 * Keep this page's fragment when a link that names this page as its
 * `return_to` is followed: the session's signInUrl, an add-account link, a
 * site's own `/signin?return_to=` link. Installed by OcSessionProvider;
 * returns the uninstaller.
 */
export function keepFragmentOnReturnLinks(): () => void {
    if (typeof document === 'undefined') return () => {};
    const onClick = (e: MouseEvent) => {
        const { pathname, search, hash, href } = window.location;
        if (hash.length < 2 || e.defaultPrevented) return;
        const link = (e.target as Element | null)?.closest?.('a[href]');
        if (!link) return;
        try {
            const to = new URL(link.getAttribute('href') ?? '', href);
            const back = to.searchParams.get('return_to');
            if (!back) return;
            const here = new URL(back, href);
            if (
                here.origin === window.location.origin &&
                here.pathname === pathname &&
                here.search === search
            ) {
                keep(pathname + search, hash);
            }
        } catch {
            // Not a URL: not a return link.
        }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
}

/**
 * Put back the fragment a return address left behind, if the browser has
 * just landed on its path with no fragment of its own. Used once, then gone.
 * OcSessionProvider calls this before its children render; returns whether a
 * fragment was restored.
 */
export function restoreReturnFragment(): boolean {
    if (typeof window === 'undefined') return false;
    const s = store();
    if (!s) return false;
    const { pathname, search, hash } = window.location;
    const key = PREFIX + pathname + search;
    let raw: string | null;
    try {
        raw = s.getItem(key);
        if (raw === null) return false;
        s.removeItem(key);
    } catch {
        return false;
    }
    // The address brought its own fragment: that one wins.
    if (hash) return false;
    try {
        const kept = JSON.parse(raw) as { hash?: unknown; at?: unknown };
        if (typeof kept.hash !== 'string' || !kept.hash.startsWith('#')) return false;
        if (typeof kept.at !== 'number' || Date.now() - kept.at > FRAGMENT_TTL_MS) return false;
        window.history.replaceState(window.history.state, '', pathname + search + kept.hash);
        return true;
    } catch {
        return false;
    }
}
