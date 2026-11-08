import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cspGaps, inlineHandlers, inlineScripts, scriptSources } from './scan';

/** The scanner cspCheck runs over every built page. */

const sha256 = (t: string) => createHash('sha256').update(t, 'utf8').digest('base64');
const policy = (...sources: string[]) =>
    `default-src 'self'; script-src 'self' ${sources.join(' ')}; style-src 'self'`;

describe('inlineScripts', () => {
    it('takes the scripts the browser runs and leaves data and external ones', () => {
        const html = [
            '<script>a()</script>',
            '<script type="module">b()</script>',
            '<script type="text/javascript">c()</script>',
            '<script id="__NEXT_DATA__" type="application/json">{"x":1}</script>',
            '<script type="application/ld+json">{}</script>',
            '<script src="/x.js" defer="">ignored()</script>',
            '<script data-type="json">d()</script>',
        ].join('');
        expect(inlineScripts(html)).toEqual(['a()', 'b()', 'c()', 'd()']);
    });

    it('keeps the text byte for byte, entities and whitespace included', () => {
        expect(inlineScripts('<script>\n if (a &amp;&amp; b) {}\n</script>')).toEqual([
            '\n if (a &amp;&amp; b) {}\n',
        ]);
    });
});

describe('scriptSources', () => {
    it('reads script-src, or default-src without one', () => {
        expect(scriptSources(policy("'sha256-x'"))).toEqual(["'self'", "'sha256-x'"]);
        expect(scriptSources("default-src 'self' 'unsafe-inline'")).toEqual([
            "'self'",
            "'unsafe-inline'",
        ]);
    });
});

describe('inlineHandlers', () => {
    it('finds handler attributes and javascript: URLs outside script bodies', () => {
        const html =
            '<img src="a.png" onerror="x()"><a href="javascript:void 0">a</a>' +
            '<script>var s="<b onclick=1>"</script><div data-onclick="no">';
        expect(inlineHandlers(html)).toEqual(['onerror', 'javascript:']);
    });
});

describe('cspGaps', () => {
    const html = '<script>one()</script><script>two()</script>';

    it('is clean when every inline script is listed by its hash', () => {
        const csp = policy(`'sha256-${sha256('one()')}'`, `'sha256-${sha256('two()')}'`);
        expect(cspGaps(html, csp, sha256)).toEqual({
            unsafeInline: false,
            unlisted: [],
            handlers: [],
        });
    });

    it("names a script whose hash is missing, and 'unsafe-inline' when it is there", () => {
        const csp = policy("'unsafe-inline'", `'sha256-${sha256('one()')}'`);
        expect(cspGaps(html, csp, sha256)).toEqual({
            unsafeInline: true,
            unlisted: ['two()'],
            handlers: [],
        });
    });
});
