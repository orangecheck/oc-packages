#!/usr/bin/env node
/*
 * The two logos and the switch (src/brand/logo.ts), in markup and in Chrome on SwiftShader:
 *
 * - every place the package draws the brand draws both logos, as many pixel as classic, the default
 *   marked: the header's lockup, the footer's lockup and signature, the compact footer, the tool and docs
 *   shells, an app's bars, the sign-in frame, the error page's check, the check as art, the icon lockup;
 * - the pixel wordmark is drawn in the text colour on every ground the brand sits on (paper, ink, burnt,
 *   brand, the footer), light and dark, at 4.5:1 at least, and only one logo shows: the default with no
 *   choice, the chosen one with data-oc-logo;
 * - the switch: `?logo=pixel` on one *.ochk.io host puts data-oc-logo on <html> before the body is parsed,
 *   shows the pixel logo before any script of the page runs, and sets a cookie every *.ochk.io host reads;
 *   a host outside .ochk.io (ochk.app) keeps its own; `?logo=classic` clears it everywhere. The server's HTML hydrates unchanged, with
 *   no recoverable error, either way;
 * - the pixel signature fills the footer's frame at 390 and 1440, every letter's cells square; it rises
 *   with the classic one, and stays still under reduced motion. Every pixel lockup, flat and icon, at
 *   every size, draws whole square pixels a cell; the header's wordmark 2px, at 390 too.
 *
 * Run after `yarn build` (the markup half reads dist; the browser half bundles the sources).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

import { bundle, COLOUR_KIT, compileCss, findChrome, pkg } from './browser.mjs';

process.env.NODE_ENV = 'production';
const require = createRequire(import.meta.url);

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ logo: ${msg}`);
        failures++;
    }
};

for (const f of ['chrome', 'components', 'brand']) {
    if (!existsSync(join(pkg, `dist/${f}.js`))) {
        console.error(`✗ logo: dist/${f}.js is missing; run yarn build first`);
        process.exit(1);
    }
}

// ── Markup: both logos wherever the brand is drawn ─────────────────────────────────────────────────
let logoScript;
{
    const { createElement: h } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const B = require(join(pkg, 'dist/brand.js'));
    const C = require(join(pkg, 'dist/components.js'));
    const Ch = require(join(pkg, 'dist/chrome.js'));
    const nav = [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }] }];
    // Each place, and how many brand drawings it holds: a lockup is one, the footer's signature one more.
    const places = {
        'SiteHeader': [h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }] }), 1],
        'SiteHeader with a product': [h(Ch.SiteHeader, { variant: 'tool', product: 'stamp', nav: [] }), 1],
        'SiteFooter': [h(Ch.SiteFooter, { family: true, legal: true }), 2],
        'SiteFooter without its signature': [h(Ch.SiteFooter, { family: true, signature: false }), 1],
        'SiteFooter compact': [h(Ch.SiteFooter, { compact: true, family: true, legal: true }), 1],
        'OchkIoFooter': [h(Ch.OchkIoFooter), 2],
        // The tool shell's header and compact footer.
        'ToolShell': [h(Ch.ToolShell, { protocol: 'stamp', tools: [] }, h('p', null, 'page')), 2],
        // The docs header and ochk.io's footer.
        'DocsShell': [h(Ch.DocsShell, { nav, current: '/docs' }, h('p', null, 'page')), 3],
        'SignInFrame': [h(Ch.SignInFrame, { title: 'Sign in', protocol: 'stamp' }, h('p', null, 'form')), 2],
        // Its bar and its sidebar.
        'AppShell': [h(Ch.AppShell, { product: 'vault', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }] }, h('p', null, 'page')), 2],
        'ErrorPage': [h(C.ErrorPage, { code: 404 }), 1],
        'IsoCheck': [h(B.IsoCheck, { size: 340 }), 1],
        'Lockup (icon)': [h(B.Lockup, { size: 30 }), 1],
    };
    const count = (out, re) => (out.match(re) ?? []).length;
    for (const [name, [el, n]] of Object.entries(places)) {
        const out = renderToStaticMarkup(el);
        const classic = count(out, /\sdata-oca-logo="classic"/g);
        const pixel = count(out, /\sdata-oca-logo="pixel"/g);
        const marked = count(out, new RegExp(`\\sdata-oca-logo="${B.LOGO_DEFAULT}"\\sdata-oca-logo-default=""`, 'g'));
        check(classic === n && pixel === n, `${name}: draws ${classic} classic and ${pixel} pixel brand drawings, not ${n} of each`);
        check(marked === n && count(out, /\sdata-oca-logo-default=""/g) === n, `${name}: the default (${B.LOGO_DEFAULT}) is marked ${marked} times of ${n}`);
    }
    // Every lockup, flat and icon, at every size the chrome and the sites draw: its cells whole pixels and square.
    for (const size of [20, 22, 24, 26, 28, 30, 36, 44])
        for (const variant of ['flat', 'icon']) {
            const out = renderToStaticMarkup(h(B.Lockup, { size, variant, logo: 'pixel' }));
            const svgs = [...out.matchAll(/<svg[^>]*?viewBox="([^"]+)"[^>]*?width="([\d.]+)" height="([\d.]+)"/g)].map(([, vb, w, ht]) => {
                const [, , vw, vh] = vb.split(' ').map(Number);
                return { cellX: Number(w) / vw, cellY: Number(ht) / vh };
            });
            // The icon's tile is drawn in pixels; its check is placed at whole pixels and scaled by a whole cell.
            const g = /<g transform="translate\(([\d.-]+) ([\d.-]+)\) scale\(([\d.]+)\)"/.exec(out);
            const cells = [...svgs.map((v) => v.cellX), ...svgs.map((v) => v.cellY), ...(g ? g.slice(1).map(Number) : [])];
            check(
                svgs.length === 2 && cells.every(Number.isInteger) && svgs.every((v) => v.cellX === v.cellY) && (variant === 'flat' || g),
                `Lockup ${variant} ${size}: cells not whole square pixels (${JSON.stringify({ svgs, g: g?.slice(1) })})`
            );
        }
    // The small wordmark's strokes are one cell: at 1px a cell it is never drawn, at any lockup size.
    const small = /viewBox="0 -?\d+ (\d+) /.exec(renderToStaticMarkup(h(B.PixelWordmark, { grid: 'small', cell: 1 })))[1];
    for (let size = 12; size <= 48; size++)
        for (const variant of ['flat', 'icon']) {
            const word = /<svg[^>]*?viewBox="0 -?\d+ (\d+) [^"]*"[^>]*?width="([\d.]+)"[^>]*?aria-label="orangecheck"/.exec(renderToStaticMarkup(h(B.Lockup, { size, variant, logo: 'pixel' })));
            check(word && !(word[1] === small && Number(word[2]) === Number(small)), `Lockup ${variant} ${size}: the small wordmark at 1px a cell (${word?.slice(1)})`);
        }
    // A fixed logo draws that one alone, unmarked: what an OG card or a story asks for.
    const fixed = renderToStaticMarkup(h(B.Lockup, { size: 30, variant: 'flat', logo: 'pixel' }));
    check(!/data-oca-logo/.test(fixed) && /aria-label="orangecheck"/.test(fixed), 'Lockup logo="pixel": not the pixel lockup alone');
    // The script: it reads the URL and the cookie, sets the root's attribute, and names .ochk.io for the cookie.
    logoScript = B.logoScript;
    const script = logoScript();
    check(/data-oc-logo/.test(script) && /domain=\.ochk\.io/.test(script) && script.includes(B.LOGO_COOKIE), 'logoScript: not the switch');
    check(/<script>/.test(renderToStaticMarkup(h(require(join(pkg, 'dist/fonts.js')).FontPreloads))), "FontPreloads: no longer renders the switch's script");
}

// ── Chrome ─────────────────────────────────────────────────────────────────────────────────────────
const chrome = findChrome();
if (!chrome) {
    console.error('✗ logo: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}
const src = (f) => join(pkg, 'src', f);
const dir = mkdtempSync(join(tmpdir(), 'app-design-logo-'));

// The page a site serves: header, a long main, footer, as a server renders it and the browser hydrates it.
writeFileSync(
    join(dir, 'tree.jsx'),
    `import { SiteFooter, SiteHeader } from '${src('chrome/site.tsx')}';\n` +
        `export const Tree = () => <><SiteHeader family="stamp" nav={[{ href: '/create', label: 'Create' }]} /><main style={{ height: 1600 }}><p>page</p></main><SiteFooter family legal /></>;\n`
);
// Each ground the brand sits on, light and dark: a lockup and the bare wordmark on it.
const GROUNDS = { paper: 'bg-background text-foreground', ink: 'oca-band-ink', burnt: 'oca-band-burnt', brand: 'oca-band-brand', footer: 'oca-band-footer' };
const groundsPage =
    `import { createRoot } from 'react-dom/client';\n` +
    `import { Lockup } from '${src('brand/mark.tsx')}';\n` +
    `import { PixelWordmark } from '${src('brand/pixel.tsx')}';\n` +
    `const GROUNDS = ${JSON.stringify(GROUNDS)};\n` +
    `const row = (mode) => Object.entries(GROUNDS).map(([g, cls]) => <div key={mode + g} data-ground={mode + ' ' + g} className={'flex items-center gap-6 p-4 ' + cls}><Lockup size={30} variant="flat" /><PixelWordmark data-bare="" /></div>);\n` +
    `createRoot(document.getElementById('root')).render(<><div>{row('light')}</div><div className="dark" data-oc-app="ochk">{row('dark')}</div></>);\n`;

bundle(dir, {
    grounds: groundsPage,
    hydrate:
        `import { hydrateRoot } from 'react-dom/client';\nimport { Tree } from './tree.jsx';\n` +
        `window.__recoverable = [];\n` +
        `hydrateRoot(document.getElementById('root'), <Tree />, { onRecoverableError: (e) => window.__recoverable.push(String(e && e.message || e)) });\n` +
        // The logos' markup once hydrated (Reveal's effect marks the footer's block after, outside them).\n` +
        `requestAnimationFrame(() => requestAnimationFrame(() => { window.__hydrated = [...document.querySelectorAll('[data-oca-logo]')].map((e) => e.outerHTML); }));\n`,
});
compileCss(dir, ['grounds', 'hydrate']);

// The server's HTML, rendered in Node with no window.
writeFileSync(join(dir, 'server.jsx'), `import { renderToString } from 'react-dom/server';\nimport { Tree } from './tree.jsx';\nprocess.stdout.write(renderToString(<Tree />));\n`);
require('esbuild').buildSync({
    entryPoints: [join(dir, 'server.jsx')],
    outfile: join(dir, 'server.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [join(pkg, 'node_modules')],
    alias: { 'next/link': join(pkg, 'node_modules/next/link.js') },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
});
const served = spawnSync(process.execPath, [join(dir, 'server.cjs')], { encoding: 'utf8' });
if (served.status !== 0) throw new Error(`logo: the server render failed\n${served.stderr}`);
// The head as a site's _document has it: the switch first. A probe at the top of the body reads the root's
// attribute before anything under it is parsed; one after the page's HTML reads which logo shows before the
// page's script runs (what the first paint shows). The empty icon keeps Chrome from asking each host for
// /favicon.ico, so every console error a visit counts is the page's own. `nested` puts the scope on a
// wrapper, not the root, for the rules that read it on an ancestor.
const doc = (body, script = '', nested = false) =>
    `<!doctype html><html lang="en"${nested ? '' : ' data-oc-app="ochk"'}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><script>${logoScript()}</script><link rel="stylesheet" href="out.css"></head><body>${nested ? '<div data-oc-app="ochk">' : ''}${body}${nested ? '</div>' : ''}${script}</body></html>`;
const shown = `(el) => Boolean(el && el.getClientRects().length)`;
writeFileSync(
    join(dir, 'page.html'),
    doc(
        `<script>window.__early = document.documentElement.getAttribute('data-oc-logo');</script><div id="root">${served.stdout}</div>` +
            `<script>(() => { const s = ${shown}; const q = (v) => document.querySelector('header [data-oca-logo="' + v + '"]'); window.__first = { classic: s(q('classic')), pixel: s(q('pixel')), logos: [...document.querySelectorAll('[data-oca-logo]')].map((e) => e.outerHTML) }; })();</script>`,
        '<script src="hydrate.js"></script>'
    )
);
writeFileSync(join(dir, 'grounds.html'), doc('<div id="root"></div>', `<script>${COLOUR_KIT}</script><script src="grounds.js"></script>`));
writeFileSync(join(dir, 'grounds-nested.html'), doc('<div id="root"></div>', `<script>${COLOUR_KIT}</script><script src="grounds.js"></script>`, true));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
    const path = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(dir) || !existsSync(path)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const at = (host, path) => `http://${host}:${port}/${path}`;

const { chromium } = require('playwright-core');
// Two of the family's hosts and one outside it, all served here: one browser, one cookie jar. The outside
// host stands for ochk.app, which Chrome only opens over https (.app is on the HSTS preload list).
const OUTSIDE = 'ochk.example';
const browser = await chromium.launch({
    executablePath: chrome,
    args: ['--use-angle=swiftshader', '--font-render-hinting=none', `--host-resolver-rules=MAP stamp.ochk.io 127.0.0.1, MAP docs.ochk.io 127.0.0.1, MAP ${OUTSIDE} 127.0.0.1`],
});
try {
    // ── Grounds ──
    {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
        const p = await ctx.newPage();
        for (const [page, scope] of [['grounds.html', ''], ['grounds-nested.html', ', the scope nested']])
        for (const choice of [null, 'pixel', 'classic']) {
            await p.goto(at('stamp.ochk.io', `${page}${choice ? `?logo=${choice}` : ''}`));
            await p.waitForSelector('[data-ground]');
            await p.evaluate(() => document.fonts.ready);
            const rows = await p.evaluate((s) => {
                const shown = eval(s);
                return [...document.querySelectorAll('[data-ground]')].map((g) => {
                    const pick = (v) => g.querySelector(`[data-oca-logo="${v}"]`);
                    const word = g.querySelector('[data-bare]');
                    const cs = getComputedStyle(g);
                    const ink = window.__rgb(getComputedStyle(word).color, cs.backgroundColor);
                    const ground = window.__rgb(cs.backgroundColor);
                    const pathFill = getComputedStyle(word.querySelector('path')).fill;
                    return {
                        ground: g.dataset.ground,
                        classic: shown(pick('classic')),
                        pixel: shown(pick('pixel')),
                        sameInk: getComputedStyle(word).color === cs.color && pathFill === cs.color,
                        contrast: window.__contrast(ink, ground),
                    };
                });
            }, shown);
            const want = choice ?? 'classic';
            for (const r of rows) {
                const where = `${r.ground}${choice ? ` (?logo=${choice})` : ''}${scope}`;
                check(r.classic === (want === 'classic') && r.pixel === (want === 'pixel'), `${where}: shows ${r.classic ? 'classic' : ''}${r.pixel ? ' pixel' : ''}, not ${want} alone`);
                if (!choice) {
                    check(r.sameInk, `${where}: the pixel wordmark is not drawn in the ground's text colour`);
                    check(r.contrast >= 4.5, `${where}: the pixel wordmark is ${r.contrast.toFixed(2)}:1 on its ground`);
                }
            }
            check(rows.length === 10, `${page}: ${rows.length} grounds, not 10`);
        }
        await ctx.close();
    }

    // ── The switch, across hosts, and hydration ──
    {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        const visit = async (host, query, want, why) => {
            errors.length = 0;
            await p.goto(at(host, `page.html${query}`));
            await p.waitForFunction(() => window.__hydrated !== undefined);
            const r = await p.evaluate(() => ({
                early: window.__early,
                first: window.__first,
                recoverable: window.__recoverable,
                same: window.__hydrated.length > 0 && window.__hydrated.join('') === window.__first.logos.join(''),
                cookie: document.cookie,
                classic: Boolean(document.querySelector('header [data-oca-logo="classic"]').getClientRects().length),
                pixel: Boolean(document.querySelector('header [data-oca-logo="pixel"]').getClientRects().length),
                footer: [...document.querySelectorAll('footer [data-oca-logo]')].filter((e) => e.getClientRects().length).map((e) => e.dataset.ocaLogo),
            }));
            const tag = `${host}${query} (${why})`;
            const choice = want === 'classic' && !/logo=classic/.test(query) ? null : want;
            check(r.early === choice, `${tag}: <html> carries data-oc-logo=${r.early} before the body, not ${choice}`);
            check(r.first.classic === (want === 'classic') && r.first.pixel === (want === 'pixel'), `${tag}: before the page's script the header shows ${JSON.stringify(r.first)}`);
            check(r.classic === (want === 'classic') && r.pixel === (want === 'pixel'), `${tag}: after hydration the header shows classic ${r.classic}, pixel ${r.pixel}`);
            check(r.footer.length === 2 && r.footer.every((v) => v === want), `${tag}: the footer shows ${r.footer.join(', ')}`);
            check(r.same, `${tag}: hydration changed the logos' server HTML`);
            check(r.recoverable.length === 0 && errors.length === 0, `${tag}: hydration reported ${[...r.recoverable, ...errors].join('; ')}`);
            return r;
        };
        await visit('stamp.ochk.io', '', 'classic', 'no choice: the default');
        const set = await visit('stamp.ochk.io', '?logo=pixel', 'pixel', 'chosen');
        check(/(^|; )oc_logo=pixel/.test(set.cookie), `?logo=pixel set no cookie (${set.cookie})`);
        await visit('stamp.ochk.io', '', 'pixel', 'the cookie, on the same host');
        await visit('docs.ochk.io', '', 'pixel', 'the cookie, on another *.ochk.io host');
        await visit(OUTSIDE, '', 'classic', 'a host outside .ochk.io reads none of its cookie');
        await visit(OUTSIDE, '?logo=pixel', 'pixel', 'chosen outside .ochk.io');
        await visit(OUTSIDE, '', 'pixel', 'its own cookie');
        const cleared = await visit('docs.ochk.io', '?logo=classic', 'classic', 'cleared');
        check(!/oc_logo=/.test(cleared.cookie), `?logo=classic left the cookie (${cleared.cookie})`);
        await visit('stamp.ochk.io', '', 'classic', 'cleared on every *.ochk.io host');
        await visit(OUTSIDE, '?logo=classic', 'classic', 'its own cleared');
        // A value that is not a logo is ignored, in the URL and in the cookie.
        await visit('stamp.ochk.io', '?logo=neon', 'classic', 'an unknown value');
        await ctx.addCookies([{ name: 'oc_logo', value: 'neon', domain: '.ochk.io', path: '/' }]);
        await visit('docs.ochk.io', '', 'classic', 'an unknown value in the cookie');
        await ctx.close();
    }

    // ── Geometry and motion: the footer's signature, the header's wordmark ──
    for (const width of [390, 1440]) {
        for (const reduce of [false, true]) {
            const phone = width < 768;
            const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, reducedMotion: reduce ? 'reduce' : 'no-preference' });
            const p = await ctx.newPage();
            await p.goto(at('stamp.ochk.io', 'page.html?logo=pixel'));
            await p.waitForFunction(() => window.__hydrated !== undefined);
            await p.evaluate(() => document.fonts.ready);
            const tag = `[${width}${reduce ? ', reduced motion' : ''}]`;
            const before = await p.evaluate(() => {
                const sig = document.querySelector('footer [data-oca-wordmark][data-oca-logo="pixel"]');
                return { pending: sig.parentElement.dataset.reveal ?? null, moved: [...sig.children].some((s) => getComputedStyle(s).transform !== 'none') };
            });
            check(reduce ? before.pending === null && !before.moved : before.pending === 'pending' && before.moved, `${tag}: below the fold the pixel signature is ${JSON.stringify(before)}`);
            await p.evaluate(() => document.querySelector('footer').scrollIntoView({ block: 'end' }));
            await p.waitForTimeout(2000);
            const m = await p.evaluate(() => {
                const sig = document.querySelector('footer [data-oca-wordmark][data-oca-logo="pixel"]');
                const reveal = sig.parentElement.getBoundingClientRect();
                const frame = getComputedStyle(sig.parentElement.parentElement);
                const box = sig.parentElement.parentElement.getBoundingClientRect();
                const content = { left: box.left + parseFloat(frame.paddingLeft), right: box.right - parseFloat(frame.paddingRight) };
                const letters = [...sig.querySelectorAll('svg')].map((s) => {
                    const r = s.getBoundingClientRect();
                    const vb = s.viewBox.baseVal;
                    return { left: r.left, right: r.right, bottom: r.bottom, ratio: r.width / r.height, want: vb.width / vb.height, cell: r.height / vb.height };
                });
                const word = document.querySelector('header [data-oca-logo="pixel"] svg[aria-label]');
                const wr = word.getBoundingClientRect();
                const wv = word.viewBox.baseVal;
                return {
                    letters,
                    content,
                    clipBottom: reveal.bottom,
                    still: [...sig.children].every((s) => getComputedStyle(s).transform === 'none'),
                    header: { w: wr.width, h: wr.height, cellX: wr.width / wv.width, cellY: wr.height / wv.height },
                };
            });
            const first = m.letters[0];
            const last = m.letters.at(-1);
            const span = last.right - first.left;
            const widthOf = m.content.right - m.content.left;
            check(m.letters.length === 11, `${tag}: the pixel signature has ${m.letters.length} letters`);
            check(span >= 0.95 * widthOf && first.left >= m.content.left - 0.5 && last.right <= m.content.right + 0.5, `${tag}: the pixel signature spans ${span.toFixed(1)} of the frame's ${widthOf.toFixed(1)}px`);
            const squashed = m.letters.filter((l) => Math.abs(l.ratio / l.want - 1) > 0.01);
            check(squashed.length === 0, `${tag}: ${squashed.length} pixel letters are not square-celled`);
            check(new Set(m.letters.map((l) => l.cell.toFixed(2))).size === 1, `${tag}: the pixel letters' cells differ in size`);
            check(m.letters.every((l) => l.bottom <= m.clipBottom + 0.5), `${tag}: the signature's clip cuts a letter`);
            check(m.still, `${tag}: once shown the pixel letters have not settled`);
            check(m.header.cellX === 2 && m.header.cellY === 2, `${tag}: the header's pixel wordmark is ${m.header.w}×${m.header.h}, cells ${m.header.cellX}×${m.header.cellY}, not 2px squares`);
            await ctx.close();
        }
    }
} finally {
    await browser.close();
    server.close();
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`✗ logo: ${failures} of ${checks} checks failed`);
    process.exit(1);
}
console.log(`✓ logo: ${checks} checks; both logos wherever the brand is drawn, the pixel one inked on every ground, the switch before paint across hosts, hydration unchanged, the signature square and filling its frame`);
