#!/usr/bin/env node
/*
 * What only a real layout shows, measured in Chrome at a phone's width and a
 * desk's: the package's CSS compiled by Tailwind as a site compiles it, the
 * shells rendered by the server, a panel opened in the browser.
 *
 * - A Panel's actions stay top right beside a two-line description, on a
 *   phone and in a half-width panel, rather than wrapping under the text.
 * - An expanded Panel's body scrolls inside itself: a tall body never runs
 *   under the source at the foot.
 * - The app frames (ToolShell variant="app", AppShell variant="rail") clip
 *   what is positioned inside them: an sr-only line deep in a page's own
 *   scroller does not stretch the document past the window. Nor does one in
 *   the last column of a wide table in a ScrollFade widen a phone.
 *
 * CI runners carry Chrome (CHROME_BIN); locally it uses Playwright's. Run
 * after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'production';
const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/chrome.js'))) {
    console.error('✗ layout: dist is missing; run yarn build first');
    process.exit(1);
}

function findChrome() {
    const found = [process.env.OCA_CHROME, process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const cache = join(homedir(), '.cache/ms-playwright');
    if (existsSync(cache)) {
        for (const d of readdirSync(cache).sort().reverse()) {
            found.push(join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell'), join(cache, d, 'chrome-linux64/chrome'));
        }
    }
    return found.find((p) => p && existsSync(p));
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ layout: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'app-design-layout-'));
let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ layout: ${msg}`);
        failures++;
    }
};

try {
    // The package's CSS, compiled the way a site compiles it.
    writeFileSync(
        join(dir, 'input.css'),
        `@import '${join(pkg, 'node_modules/tailwindcss/index.css')}';\n` +
            `@custom-variant dark (&:is(.dark *));\n` +
            `@source '${join(pkg, 'dist')}';\n` +
            `@source '${join(dir, 'client.js')}';\n` +
            `@import '${join(pkg, 'src/styles.css')}';\n`
    );

    // The panel, opened in the browser: its dialog renders only on the client.
    const esbuild = require('esbuild');
    writeFileSync(
        join(dir, 'client.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { Panel } from '${join(pkg, 'src/components/figures.tsx')}';\n` +
            `const tall = <div data-tall="" style={{ height: 1600 }}>A body taller than the window</div>;\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <div className="p-4"><Panel title="Hash rate" description="Seven-day average." expandable source={<p data-source="">Source: mempool.space · Updated 2 min ago</p>}>{() => tall}</Panel></div>\n` +
            `);\n`
    );
    esbuild.buildSync({
        entryPoints: [join(dir, 'client.jsx')],
        outfile: join(dir, 'client.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });

    const tw = spawnSync(process.execPath, [join(pkg, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(dir, 'input.css'), '-o', join(dir, 'out.css')], { encoding: 'utf8' });
    if (tw.status !== 0) throw new Error(`tailwind: ${tw.stderr}`);

    // The server's markup for the shells and a panel's header.
    const { createElement: h } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const C = require(join(pkg, 'dist/components.js'));
    const Ch = require(join(pkg, 'dist/chrome.js'));
    const page = (name, body, script = '') => {
        writeFileSync(
            join(dir, `${name}.html`),
            `<!doctype html><html data-oc-app="ochk"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head><body>${body}${script}</body></html>`
        );
        return pathToFileURL(join(dir, `${name}.html`)).href;
    };
    const describe = 'The network’s total hashing power, a seven-day average, and how it moved over the window you picked.';
    const panel = (title) =>
        h(C.Panel, { title, description: describe, expandable: true, actions: h('button', { type: 'button', 'data-range': '' }, '1Y') }, h('p', null, 'chart'));
    const header = page('header', renderToStaticMarkup(h('div', { className: 'oca-container py-6' }, h('div', { className: 'grid gap-6 md:grid-cols-2' }, panel('Hash rate'), panel('Difficulty')))));
    // A page's own scroller, as agent's compose page has: numbered sections whose
    // titles read "Step N:" and an outside link, both sr-only text, deep inside it.
    const deep = h(
        'div',
        { className: 'min-h-0 flex-1 overflow-y-auto' },
        h(
            'div',
            { className: 'mx-auto flex w-full max-w-[72rem] flex-col gap-6 px-4 py-6' },
            ...Array.from({ length: 6 }, (_, i) =>
                h(
                    C.FormSection,
                    { key: i, n: i + 1, title: `Section ${i + 1}`, hint: 'What goes here.' },
                    h('div', { style: { height: 260 } }, h(C.TextLink, { href: 'https://ochk.io/docs/agent' }, 'Read the spec'))
                )
            )
        )
    );
    const tool = page('tool-app', renderToStaticMarkup(h(Ch.ToolShell, { protocol: 'agent', tools: [], variant: 'app' }, deep)));
    const rail = page(
        'rail',
        renderToStaticMarkup(
            h(Ch.AppShell, { variant: 'rail', header: h('header', { className: 'h-14 border-b' }, 'chat'), nav: [{ items: [{ href: '/a', label: 'A', icon: h('i') }, { href: '/b', label: 'B', icon: h('i') }] }] }, deep)
        )
    );
    // A wide table in a ScrollFade, an outside link in its last column: a phone must not widen.
    const P = require(join(pkg, 'dist/primitives.js'));
    const wide = page(
        'wide',
        renderToStaticMarkup(
            h('div', { className: 'p-4' }, h(P.ScrollFade, null, h('table', { style: { width: 1800 } }, h('tbody', null, h('tr', null, h('td', { style: { width: 1700 } }, 'Name'), h('td', null, h(C.TextLink, { href: 'https://mempool.space' }, 'Source')))))))
        )
    );
    const expanded = page('expanded', '<div id="root"></div>', '<script src="client.js"></script>');

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    try {
        for (const [width, height] of [
            [390, 844],
            [1440, 900],
        ]) {
            const p = await browser.newPage({ viewport: { width, height } });
            // Panel header: the actions on the first row, at the right, beside two lines of description.
            await p.goto(header);
            const rows = await p.$$eval('section', (secs) =>
                secs.map((s) => {
                    const title = s.querySelector('h3').getBoundingClientRect();
                    const desc = s.querySelector('header p').getBoundingClientRect();
                    const btn = s.querySelector('button[aria-label="Open full screen"]').getBoundingClientRect();
                    const head = s.querySelector('header').getBoundingClientRect();
                    return { lines: Math.round(desc.height / 18), btnTop: btn.top, titleTop: title.top, descBottom: desc.bottom, btnRight: btn.right, headRight: head.right };
                })
            );
            for (const [i, r] of rows.entries()) {
                check(r.lines >= 2, `[${width}] panel ${i + 1}: the description should run to two lines for this check (got ${r.lines})`);
                check(r.btnTop < r.titleTop + 12 && r.headRight - r.btnRight < 2, `[${width}] panel ${i + 1}: the actions wrapped under the text (button top ${Math.round(r.btnTop)}, title top ${Math.round(r.titleTop)})`);
            }
            // Expanded: the body scrolls inside itself, above the source.
            await p.goto(expanded);
            await p.click('button[aria-label="Open full screen"]');
            await p.waitForSelector('[role="dialog"] [data-tall]');
            const ex = await p.evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]');
                const tall = dialog.querySelector('[data-tall]');
                const foot = dialog.querySelector('[data-source]').getBoundingClientRect();
                let el = tall.parentElement;
                while (el && el !== dialog && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
                const box = el.getBoundingClientRect();
                return { scroller: el === dialog ? 'dialog' : 'body', bottom: box.bottom, footTop: foot.top, footVisible: foot.bottom <= innerHeight + 1 };
            });
            check(ex.scroller === 'body' && ex.bottom <= ex.footTop + 0.5 && ex.footVisible, `[${width}] expanded panel: a tall body runs under the source (scroller ${ex.scroller}, its bottom ${Math.round(ex.bottom)}, the source at ${Math.round(ex.footTop)})`);
            // The app frames clip what is positioned inside them.
            for (const [name, url] of [
                ['ToolShell app', tool],
                ['AppShell rail', rail],
            ]) {
                await p.goto(url);
                const doc = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, view: innerHeight }));
                check(doc.scroll <= doc.view, `[${width}] ${name}: sr-only text in the page's scroller stretches the document to ${doc.scroll}px in a ${doc.view}px window`);
            }
            await p.goto(wide);
            const across = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: innerWidth }));
            check(across.scroll <= across.view, `[${width}] ScrollFade: sr-only text in a wide table widens the page to ${across.scroll}px in a ${across.view}px window`);
            await p.close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} layout failure(s)`);
    process.exit(1);
}
console.log(`✓ layout: ${checks} checks in Chrome at 390 and 1440; panel actions, an expanded body, the app frames`);
