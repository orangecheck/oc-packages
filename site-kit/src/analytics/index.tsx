/**
 * The family's analytics: oc-pulse, orangecheck's own cookieless counter at
 * insights.ochk.io. The kit writes a small inline loader, so `window.ocpulse`
 * queues events before the script arrives. oc-pulse reports each page as
 * origin and path, never its query or fragment, a referrer as its origin, and
 * counts a client-side route change itself.
 *
 * Nothing here imports Next. Next loads this package outside its bundle on
 * the server, where a bare `next/router` does not resolve and `next/router.js`
 * is a second copy of the router's module.
 */
const SAFE_URL_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./+%@~,!$&'()*-]*)?$/i;
// A first-party path, for a site that serves oc-pulse from its own origin.
const SAFE_PATH_RE = /^\/[\w./-]*$/;
const safeRef = (v: string | undefined) => (v && (SAFE_URL_RE.test(v) || SAFE_PATH_RE.test(v)) ? v : '');
// An origin as `location.origin` reads it: https, a lowercase host, no port, path or slash.
const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * `script` as script text that runs only on a page whose origin is one of
 * `origins`, compared exactly, never as a prefix. A test or preview deployment
 * of the same build runs none of it. An empty list, or any entry that is not
 * an origin, and it runs nowhere.
 */
export function onlyOnOrigins(origins: readonly string[], script: string): string {
    if (origins.length === 0 || !origins.every((o) => ORIGIN_RE.test(o))) return '';
    return `if (${JSON.stringify(origins)}.indexOf(window.location.origin) !== -1) {
${script}
}`;
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
    /** oc-pulse's script. Default `NEXT_PUBLIC_OCPULSE_SRC`, else insights.ochk.io's. */
    pulseSrc?: string;
    /** oc-pulse's endpoint. Default `NEXT_PUBLIC_OCPULSE_API`, else insights.ochk.io's. */
    pulseApi?: string;
    /** Default: in production only. */
    enabled?: boolean;
    /**
     * The production origins this site reports from (`https://ochk.io`). The
     * loader runs only when the page's origin is one of them, so a test or
     * preview deployment of the same build reports nothing. Absent: every host
     * reports.
     */
    origins?: readonly string[];
}

/** The script FamilyAnalytics writes; an empty string when oc-pulse is off. */
export interface FamilyAnalyticsScripts {
    ocpulse: string;
}

/**
 * The text of the script FamilyAnalytics writes for these props, which is
 * also what a Content-Security-Policy hashes (`@orangecheck/site-kit/csp`).
 * Values are validated as the sites validated them: a bad one never reaches
 * the page, and a bad `pulseSrc` turns oc-pulse off.
 */
export function familyAnalyticsScripts({
    pulseSrc = process.env.NEXT_PUBLIC_OCPULSE_SRC ?? 'https://insights.ochk.io/oc-pulse.js',
    pulseApi = process.env.NEXT_PUBLIC_OCPULSE_API ?? 'https://insights.ochk.io/oc-pulse/event',
    enabled = process.env.NODE_ENV === 'production',
    origins,
}: FamilyAnalyticsProps = {}): FamilyAnalyticsScripts {
    if (!enabled) return { ocpulse: '' };
    const gate = (script: string) => (origins ? onlyOnOrigins(origins, script) : script);
    const src = safeRef(pulseSrc);
    return { ocpulse: src ? gate(pulseLoaderScript(src, safeRef(pulseApi))) : '' };
}

/** The analytics script for `_document`'s `<Head>`: `familyAnalyticsScripts`' oc-pulse loader in a script element. */
export function FamilyAnalytics(props: FamilyAnalyticsProps) {
    const { ocpulse: loader } = familyAnalyticsScripts(props);
    if (!loader) return null;
    return <script data-oc-analytics="ocpulse" dangerouslySetInnerHTML={{ __html: loader }} />;
}
