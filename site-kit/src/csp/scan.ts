/**
 * What a page's HTML would run inline against its Content-Security-Policy.
 * Pure, for `cspCheck` over a built site and for its tests.
 */

/** A script element's type that the browser runs: none, empty, a JavaScript MIME type, or module. */
const RUNS = new Set([
    '',
    'module',
    'text/javascript',
    'application/javascript',
    'application/ecmascript',
    'application/x-ecmascript',
    'application/x-javascript',
    'text/ecmascript',
    'text/jscript',
    'text/livescript',
]);

/** The text of every inline script the page runs, exactly as served: a hash covers these bytes. */
export function inlineScripts(html: string): string[] {
    const out: string[] = [];
    for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
        const attrs = m[1] ?? '';
        if (/\ssrc\s*=/i.test(` ${attrs}`)) continue;
        const type = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(` ${attrs}`);
        const value = (type?.[1] ?? type?.[2] ?? type?.[3] ?? '').trim().toLowerCase();
        if (RUNS.has(value)) out.push(m[2] ?? '');
    }
    return out;
}

/** The sources of script-src, or of default-src when there is no script-src. */
export function scriptSources(csp: string): string[] {
    const directives = new Map(
        csp
            .split(';')
            .map((d) => d.trim().split(/\s+/))
            .filter((d) => d[0])
            .map((d) => [d[0]!.toLowerCase(), d.slice(1)] as const)
    );
    return [...(directives.get('script-src') ?? directives.get('default-src') ?? [])];
}

/** Handler attributes (onclick=…) and javascript: URLs, which no hash allows; script and style bodies are skipped. */
export function inlineHandlers(html: string): string[] {
    const tags = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const found: string[] = [];
    for (const m of tags.matchAll(/<[a-z][^>]*>/gi)) {
        for (const a of m[0].matchAll(/\s(on[a-z]+)\s*=/gi)) found.push(a[1]!.toLowerCase());
        if (/\s(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(m[0]))
            found.push('javascript:');
    }
    return found;
}

/** What would not run: 'unsafe-inline' in script-src, each inline script whose hash is missing, each handler. */
export function cspGaps(
    html: string,
    csp: string,
    sha256: (text: string) => string
): { unsafeInline: boolean; unlisted: string[]; handlers: string[] } {
    const sources = new Set(scriptSources(csp));
    return {
        unsafeInline: sources.has("'unsafe-inline'"),
        unlisted: inlineScripts(html).filter((s) => !sources.has(`'sha256-${sha256(s)}'`)),
        handlers: inlineHandlers(html),
    };
}
