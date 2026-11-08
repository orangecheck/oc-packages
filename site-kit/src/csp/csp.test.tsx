import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ThemeProvider } from '@orangecheck/app-design/chrome';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cspCheck, inlineHashes, scriptHash, themeScript, THEME_PROPS } from './index';

const scriptsOf = (html: string) => [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

describe('scriptHash', () => {
    it("is the quoted sha256 of the script's exact text, in base64", () => {
        const text = 'a()';
        expect(scriptHash(text)).toBe(`'sha256-${createHash('sha256').update(text).digest('base64')}'`);
        expect(scriptHash(' a()')).not.toBe(scriptHash(text));
    });
});

describe('inlineHashes', () => {
    it('hashes each script once and skips an empty one, a beacon that is off', () => {
        expect(inlineHashes(['a()', '', 'b()', 'a()'])).toEqual([scriptHash('a()'), scriptHash('b()')]);
    });
});

describe('themeScript', () => {
    it("is the script app-design's ThemeProvider writes, with no props given", () => {
        const html = renderToStaticMarkup(createElement(ThemeProvider, null, 'page'));
        expect(scriptsOf(html)).toEqual([themeScript()]);
    });

    it('follows the props a site gives ThemeProvider', () => {
        const html = renderToStaticMarkup(createElement(ThemeProvider, { forcedTheme: 'dark' }, 'page'));
        const forced = themeScript({ forcedTheme: 'dark' });
        expect(scriptsOf(html)).toEqual([forced]);
        expect(forced).not.toBe(themeScript());
    });

    it("passes next-themes app-design's defaults", () => {
        expect(THEME_PROPS).toEqual({ attribute: 'class', enableSystem: true, storageKey: 'theme', defaultTheme: 'system' });
    });

    it('is the minified ESM build next-themes ships, not a reprint of it', () => {
        expect(themeScript()).toMatch(/^\(\([a-z](,[a-z])*\)=>\{let /);
    });

    it('says where it failed when next-themes cannot render', () => {
        const empty = mkdtempSync(join(tmpdir(), 'site-kit-csp-'));
        try {
            writeFileSync(join(empty, 'package.json'), '{"private":true}\n');
            expect(() => themeScript({ root: empty })).toThrow(/next-themes did not render/);
        } finally {
            rmSync(empty, { recursive: true, force: true });
        }
    });
});

describe('cspCheck', () => {
    const good = '<script>a()</script><script type="application/json">{}</script>';
    const policy = (sources: string) => `default-src 'self'; script-src 'self' ${sources}`;
    // Each page's HTML and its policy; /api/x is never asked for.
    const pages: Record<string, { html: string; csp?: string; type?: string }> = {};
    let root: string;
    let server: Server;
    let base: string;

    beforeAll(async () => {
        root = mkdtempSync(join(tmpdir(), 'site-kit-csp-'));
        mkdirSync(join(root, '.next', 'server'), { recursive: true });
        writeFileSync(join(root, '.next', 'routes-manifest.json'), JSON.stringify({ basePath: '/docs' }));
        server = createServer((req, res) => {
            const page = pages[req.url ?? ''];
            if (!page) return void res.writeHead(404).end();
            res.writeHead(200, {
                'content-type': page.type ?? 'text/html; charset=utf-8',
                ...(page.csp ? { 'content-security-policy': page.csp } : {}),
            });
            res.end(page.html);
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        const address = server.address();
        base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(() => {
        server.close();
        rmSync(root, { recursive: true, force: true });
    });

    function site(routes: Record<string, { html: string; csp?: string; type?: string }>) {
        for (const k of Object.keys(pages)) delete pages[k];
        Object.assign(pages, routes);
        const manifest = Object.fromEntries(
            ['/_app', '/_document', '/_error', '/api/x', '/', '/a/[slug]', '/feed'].map((r) => [r, `pages${r}.js`])
        );
        writeFileSync(join(root, '.next', 'server', 'pages-manifest.json'), JSON.stringify(manifest));
    }

    const run = async () => {
        const lines: string[] = [];
        const result = await cspCheck({ root, base, minPages: 2, log: (l) => lines.push(l) });
        return { ...result, out: lines.join('\n') };
    };

    it('passes when every page lists the hash of each inline script it runs', async () => {
        const csp = policy(scriptHash('a()'));
        site({
            '/docs/': { html: good, csp },
            '/docs/a/csp-check': { html: good, csp },
            '/docs/feed': { html: '<rss/>', type: 'application/xml' },
        });
        expect(await run()).toMatchObject({ read: 2, failed: 0, code: 0 });
    });

    it("fails a page with an unlisted script, a handler, or 'unsafe-inline'", async () => {
        const csp = policy(scriptHash('a()'));
        site({
            '/docs/': { html: `${good}<script>b()</script>`, csp },
            '/docs/a/csp-check': { html: '<a onclick="x()">x</a>', csp },
            '/docs/feed': { html: good, csp: policy(`'unsafe-inline' ${scriptHash('a()')}`) },
        });
        const r = await run();
        expect(r).toMatchObject({ read: 3, failed: 3, code: 1 });
        expect(r.out).toContain(`inline script not in script-src: sha256-${scriptHash('b()').slice(8, -1)}`);
        expect(r.out).toContain('inline handler: onclick');
        expect(r.out).toContain("script-src allows 'unsafe-inline'");
    });

    it('cannot pass a page with no policy, or too few pages to prove anything', async () => {
        site({ '/docs/': { html: good }, '/docs/a/csp-check': { html: good, csp: policy(scriptHash('a()')) } });
        expect(await run()).toMatchObject({ read: 1, failed: 0, code: 2 });
    });
});
