/**
 * The family's security headers and Content-Security-Policy, built from options.
 *
 * Every copy in the family shared one header set and one CSP skeleton and
 * differed only in the hosts each site talks to. The skeleton lives here; a
 * site passes its hosts. Every source is validated, so a typo or a pasted
 * value can never inject a directive (`;`), widen a list to `*`, or downgrade
 * to plain http.
 */

export interface Header {
    key: string;
    value: string;
}

export interface CspOptions {
    /** Extra script-src hosts, after `'self' 'unsafe-inline'`. https hosts only. */
    script?: readonly string[];
    /** connect-src sources after `'self'`: https/wss hosts, or the `https:`/`wss:` schemes. */
    connect?: readonly string[];
    /** Nostr relay URLs; each is appended to connect-src as its wss:// origin. */
    relays?: readonly string[];
    /** Extra img-src sources after `'self' data: https:` (e.g. `blob:`). */
    img?: readonly string[];
    /** media-src sources after `'self'` (e.g. `blob:`, `mediastream:`). Omitted when absent. */
    media?: readonly string[];
    /** frame-src hosts after `'self'`. Omitted when absent. */
    frame?: readonly string[];
    /** Local development only: adds `'unsafe-eval'` and `ws:` for hot reload. Never in production. */
    dev?: boolean;
}

export interface SecurityHeaderOptions {
    csp: CspOptions;
    /** Permissions-Policy camera: `'self'` for a QR scanner. Default `'none'`. */
    camera?: 'self' | 'none';
    /** Headers appended after the security set (e.g. X-Robots-Tag). They cannot replace one. */
    extra?: readonly Header[];
}

type Directive = 'script' | 'connect' | 'img' | 'media' | 'frame';

// A wildcard covers subdomains of a name with at least two labels (`*.ochk.io`, never `*.io`).
const HOST = /^(https|wss):\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?(\/[a-z0-9._~/-]*)?$/;
const SCHEMES: Record<Directive, ReadonlySet<string>> = {
    script: new Set(),
    connect: new Set(['https:', 'wss:']),
    img: new Set(['blob:']),
    media: new Set(['blob:', 'mediastream:']),
    frame: new Set(),
};

function checkSource(directive: Directive, source: string): string {
    if (SCHEMES[directive].has(source)) return source;
    const m = HOST.exec(source);
    if (m) {
        if (directive !== 'connect' && m[1] !== 'https') {
            throw new TypeError(`site-kit csp: ${directive}-src takes https hosts only, got ${JSON.stringify(source)}`);
        }
        return source;
    }
    throw new TypeError(`site-kit csp: ${JSON.stringify(source)} is not an allowed ${directive}-src source`);
}

/** A relay URL as the wss:// origin CSP matches on. */
export function relayOrigin(url: string): string {
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        throw new TypeError(`site-kit csp: relay ${JSON.stringify(url)} is not a URL`);
    }
    if (u.protocol !== 'wss:') throw new TypeError(`site-kit csp: relay ${JSON.stringify(url)} is not wss://`);
    if (u.username || u.password || u.search || u.hash) {
        throw new TypeError(`site-kit csp: relay ${JSON.stringify(url)} carries more than an origin and path`);
    }
    return checkSource('connect', u.origin);
}

const dedupe = (xs: string[]) => [...new Set(xs)];

/** The Content-Security-Policy value. */
export function buildCsp(o: CspOptions): string {
    const list = (d: Directive, xs: readonly string[] | undefined) => (xs ?? []).map((s) => checkSource(d, s));
    const script = dedupe([
        "'self'",
        "'unsafe-inline'",
        ...(o.dev ? ["'unsafe-eval'"] : []),
        ...list('script', o.script),
    ]);
    const connect = dedupe([
        "'self'",
        ...(o.dev ? ['ws:'] : []),
        ...list('connect', o.connect),
        ...(o.relays ?? []).map(relayOrigin),
    ]);
    const img = dedupe(["'self'", 'data:', 'https:', ...list('img', o.img)]);
    const directives = [
        "default-src 'self'",
        `script-src ${script.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src ${img.join(' ')}`,
        ...(o.media ? [`media-src ${dedupe(["'self'", ...list('media', o.media)]).join(' ')}`] : []),
        "font-src 'self' data:",
        `connect-src ${connect.join(' ')}`,
        ...(o.frame ? [`frame-src ${dedupe(["'self'", ...list('frame', o.frame)]).join(' ')}`] : []),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ];
    return directives.join('; ');
}

/** Two years, the longest any family site sent, and what the preload list asks for. */
export const HSTS = 'max-age=63072000; includeSubDomains; preload';

/** The family header set for every response. */
export function securityHeaders(o: SecurityHeaderOptions): Header[] {
    const headers: Header[] = [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        {
            key: 'Permissions-Policy',
            value: `camera=(${o.camera === 'self' ? 'self' : ''}), microphone=(), geolocation=()`,
        },
        { key: 'Strict-Transport-Security', value: HSTS },
        { key: 'Content-Security-Policy', value: buildCsp(o.csp) },
    ];
    const taken = new Set(headers.map((h) => h.key.toLowerCase()));
    for (const h of o.extra ?? []) {
        if (taken.has(h.key.toLowerCase())) {
            throw new TypeError(`site-kit headers: extra header ${h.key} would replace a security header`);
        }
        if (/[\r\n]/.test(h.key) || /[\r\n]/.test(h.value)) {
            throw new TypeError(`site-kit headers: extra header ${h.key} contains a line break`);
        }
        headers.push({ key: h.key, value: h.value });
    }
    return headers;
}

/** What next.config `headers()` returns: the security set on every path. */
export function siteHeaders(o: SecurityHeaderOptions): Array<{ source: string; headers: Header[] }> {
    return [{ source: '/:path*', headers: securityHeaders(o) }];
}
