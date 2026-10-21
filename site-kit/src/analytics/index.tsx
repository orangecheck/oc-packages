/**
 * The family's analytics, reported without any page's query or fragment.
 *
 * A page's query and fragment can hold values only that page should read.
 * Plausible's scripts send `location.href` and the full `document.referrer`
 * with every event, and its hash script records the fragment as part of the
 * page. So the kit sends Plausible's events itself: each page as origin and
 * path with its campaign tags, a referrer as its origin and only from another
 * site. The sender is a small inline script, so `window.plausible` works
 * before React loads; `useFamilyPageviews()` reports each route. oc-pulse
 * (insights.ochk.io) sends origin and path too.
 *
 * Nothing here imports Next. Next loads this package outside its bundle on
 * the server, where a bare `next/router` does not resolve and `next/router.js`
 * is a second copy of the router's module; the hook needs neither.
 */
import { useEffect } from 'react';

declare global {
    interface Window {
        plausible?: (
            event: string,
            options?: { props?: Record<string, string | number | boolean>; callback?: () => void }
        ) => void;
    }
}

/** The query keys a pageview keeps: campaign tags, nothing a page might carry as a secret. */
export const KEPT_QUERY_KEYS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'ref',
] as const;

/** A page's address as analytics may see it: origin and path, campaign tags only, never the fragment. */
export function familyPageUrl(href: string): string {
    const u = new URL(href);
    const kept = new URLSearchParams();
    for (const k of KEPT_QUERY_KEYS) {
        const v = u.searchParams.get(k);
        if (v !== null) kept.set(k, v);
    }
    const q = kept.toString();
    return `${u.origin}${u.pathname}${q ? `?${q}` : ''}`;
}

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{0,253}$/i;
const SAFE_URL_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./+%@~,!$&'()*-]*)?$/i;
// A first-party proxy path (a site rewrites it to plausible.io).
const SAFE_PATH_RE = /^\/[\w./-]*$/;
const safeRef = (v: string | undefined) => (v && (SAFE_URL_RE.test(v) || SAFE_PATH_RE.test(v)) ? v : '');

/**
 * Plausible's sender, as script text. It reads `location.origin`,
 * `location.pathname` and `location.search` (for the campaign tags), never
 * `location.hash` or `location.href`. Exported for the tests.
 */
export function plausibleSenderScript(domain: string, api: string): string {
    const keep = JSON.stringify(KEPT_QUERY_KEYS);
    return `(function () {
    var API = ${JSON.stringify(api)}, DOMAIN = ${JSON.stringify(domain)}, KEEP = ${keep};
    var loc = window.location, doc = document, queued = (window.plausible && window.plausible.q) || [];
    function page() {
        var q = new URLSearchParams(loc.search), kept = new URLSearchParams();
        for (var i = 0; i < KEEP.length; i++) { var v = q.get(KEEP[i]); if (v !== null) kept.set(KEEP[i], v); }
        var s = kept.toString();
        return loc.origin + loc.pathname + (s ? '?' + s : '');
    }
    function origin(href) {
        try { var u = new URL(href); return u.origin === loc.origin ? null : u.origin + '/'; } catch (e) { return null; }
    }
    function bare(href) {
        try { var u = new URL(href); return u.origin + u.pathname; } catch (e) { return null; }
    }
    function ignored() {
        try { if (window.localStorage && localStorage.getItem('plausible_ignore') === 'true') return true; } catch (e) { /* storage blocked */ }
        return navigator.webdriver === true || loc.protocol === 'file:' || /^localhost$|^127\\.|\\.local$/.test(loc.hostname);
    }
    function send(name, opts) {
        var done = opts && opts.callback;
        if (ignored()) { if (done) done(); return; }
        var body = { n: name, u: page(), d: DOMAIN, r: origin(doc.referrer) };
        if (opts && opts.props) body.p = opts.props;
        var text = JSON.stringify(body);
        try {
            if (navigator.sendBeacon && navigator.sendBeacon(API, new Blob([text], { type: 'text/plain' }))) { if (done) done(); return; }
        } catch (e) { /* fall through to fetch */ }
        try {
            fetch(API, { method: 'POST', body: text, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
                .catch(function () {}).then(function () { if (done) done(); });
        } catch (e) { if (done) done(); }
    }
    window.plausible = send;
    for (var i = 0; i < queued.length; i++) send.apply(null, queued[i]);
    // A click on a link to another site, as Plausible's outbound-links extension reports it.
    doc.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
        if (!a) return;
        var to = bare(a.href);
        if (to && new URL(a.href).origin !== loc.origin) send('Outbound Link: Click', { props: { url: to } });
    }, true);
})();`;
}

function pulseLoaderScript(src: string, api: string): string {
    return `window.ocpulse = window.ocpulse || function () { (window.ocpulse.q = window.ocpulse.q || []).push(arguments) };
(function () {
    var s = document.createElement('script');
    s.defer = true;
    s.dataset.api = ${JSON.stringify(api)};
    s.src = ${JSON.stringify(src)};
    s.onerror = function () {};
    document.head.appendChild(s);
})();`;
}

export interface FamilyAnalyticsProps {
    /** The Plausible site. Default `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, else `ochk.io` (the family rollup). */
    domain?: string;
    /** Plausible's event endpoint, a first-party path the site rewrites. Default `NEXT_PUBLIC_PLAUSIBLE_API`, else `/oc-insights/event`. */
    api?: string;
    /** oc-pulse's script. Default `NEXT_PUBLIC_OCPULSE_SRC`, else insights.ochk.io's. */
    pulseSrc?: string;
    /** oc-pulse's endpoint. Default `NEXT_PUBLIC_OCPULSE_API`, else insights.ochk.io's. */
    pulseApi?: string;
    /** Default: in production only. */
    enabled?: boolean;
}

/**
 * The analytics scripts for `_document`'s `<Head>`. Values are validated as
 * the sites validated them: a bad one turns that beacon off rather than
 * reaching the page.
 */
export function FamilyAnalytics({
    domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? 'ochk.io',
    api = process.env.NEXT_PUBLIC_PLAUSIBLE_API ?? '/oc-insights/event',
    pulseSrc = process.env.NEXT_PUBLIC_OCPULSE_SRC ?? 'https://insights.ochk.io/oc-pulse.js',
    pulseApi = process.env.NEXT_PUBLIC_OCPULSE_API ?? 'https://insights.ochk.io/oc-pulse/event',
    enabled = process.env.NODE_ENV === 'production',
}: FamilyAnalyticsProps) {
    if (!enabled) return null;
    const plausibleApi = DOMAIN_RE.test(domain) ? safeRef(api) : '';
    const src = safeRef(pulseSrc);
    return (
        <>
            {plausibleApi ? (
                <script
                    data-oc-analytics="plausible"
                    dangerouslySetInnerHTML={{ __html: plausibleSenderScript(domain, plausibleApi) }}
                />
            ) : null}
            {src ? (
                <script
                    data-oc-analytics="ocpulse"
                    dangerouslySetInnerHTML={{ __html: pulseLoaderScript(src, safeRef(pulseApi)) }}
                />
            ) : null}
        </>
    );
}

/**
 * In `_app`: one pageview per page, reported as origin and path. It counts
 * the way oc-pulse and Plausible's own script do, so the lanes agree: a new
 * path reached with `history.pushState` (Next's router among them) or
 * `popstate`. A query change or a `replaceState` is not a new page. It listens
 * to history rather than to a router, so it needs no router of its own.
 */
export function useFamilyPageviews(): void {
    useEffect(() => {
        let last = '';
        const report = () => {
            if (window.location.pathname === last) return;
            last = window.location.pathname;
            window.plausible?.('pageview');
        };
        report();
        const history = window.history;
        const push = history.pushState;
        const pushed: typeof push = function (this: History, ...args) {
            push.apply(this, args);
            report();
        };
        history.pushState = pushed;
        window.addEventListener('popstate', report);
        return () => {
            // Put back only what is still ours: another script may have wrapped it since.
            if (history.pushState === pushed) history.pushState = push;
            window.removeEventListener('popstate', report);
        };
    }, []);
}
