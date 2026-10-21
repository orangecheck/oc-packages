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
 * - A markdown table fits a phone when its words do: an error-code table
 *   at 390 does not scroll, and no cell spills; one that cannot fit still
 *   scrolls, with the fade.
 * - A DataTable row with a link opens from any of its cells, and a control
 *   in another cell stays its own; a compact HashChip sits in a line under
 *   32px with a 44px target; six wrapping tabs fit a phone; AppShell's
 *   lockup and product word fit its sidebar.
 * - The family footer fits a phone in 600px, each link group a disclosure
 *   with a 44px summary, every link still there; a desk sees the columns.
 * - On a touch screen a 32px icon button (icon-sm, Copy, a Panel's full
 *   screen), a 36px small button and a 40px icon button are 44px targets; a
 *   mouse sees them unchanged.
 * - A tool site's Docs link is in its phone menu, a 44px target, when the
 *   tools are the tab bar.
 * - A ListRow with lines="all" wraps its title and line in full, stays
 *   44px at least, and keeps its picture and its end level with the title.
 * - A bare border, border-b or divide-y draws in the hairline, not in the
 *   text colour (Tailwind 4's default), in light and dark; a colour utility
 *   still wins.
 * - Every tool page's title starts at one x: ToolShell's wide and narrow
 *   columns, an app page's ToolColumn, and an ErrorPage inside the shell.
 * - On a phone the small controls are a thumb's 44px: the compact footer's
 *   lockup, an artifact's Download, Copy and view switch, filter chips, a
 *   menu's items, a row in a pane. A row's actions keep clear of its time.
 *
 * CI runners carry Chrome (CHROME_BIN); locally it uses Playwright's. Run
 * after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
            `@source '${join(dir, 'menu.js')}';\n` +
            `@source '${join(dir, 'toolmenu.js')}';\n` +
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
    // A row's menu, open: Radix draws it only on the client.
    writeFileSync(
        join(dir, 'menu.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '${join(pkg, 'src/primitives/overlay.tsx')}';\n` +
            `createRoot(document.getElementById('root')).render(\n` +
            `  <DropdownMenu defaultOpen modal={false}><DropdownMenuTrigger>Actions</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Rename</DropdownMenuItem><DropdownMenuItem destructive>Forget</DropdownMenuItem></DropdownMenuContent></DropdownMenu>\n` +
            `);\n`
    );
    // A tool site's phone menu, opened in the browser: the Sheet renders only on the client.
    writeFileSync(
        join(dir, 'toolmenu.jsx'),
        `import { createRoot } from 'react-dom/client';\n` +
            `import { ToolShell } from '${join(pkg, 'src/chrome/tool-shell.tsx')}';\n` +
            `const tools = ['Create', 'Verify', 'Playground'].map((label) => ({ href: '/' + label.toLowerCase(), label, icon: <i /> }));\n` +
            `createRoot(document.getElementById('root')).render(<ToolShell protocol="stamp" tools={tools}><p>page</p></ToolShell>);\n`
    );
    esbuild.buildSync({
        entryPoints: [join(dir, 'toolmenu.jsx')],
        outfile: join(dir, 'toolmenu.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        // next/link reads process.env outside its bundler.
        banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
        logLevel: 'error',
    });
    esbuild.buildSync({
        entryPoints: [join(dir, 'menu.jsx')],
        outfile: join(dir, 'menu.js'),
        bundle: true,
        format: 'iife',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'error',
    });
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
    // The fonts beside the CSS, as a site serves them: measured in Inter, not in whatever the machine falls back to.
    cpSync(join(pkg, 'src/styles/fonts'), join(dir, 'fonts'), { recursive: true });

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
    // Markdown tables as the docs write them: one that fits a phone, one that cannot.
    const { mdxComponents: M } = require(join(pkg, 'dist/mdx.js'));
    const mdTable = (head, rows) =>
        h(M.table, null, h('thead', null, h('tr', null, ...head.map((x) => h(M.th ?? 'th', { key: x }, x)))), h('tbody', null, ...rows.map((r, i) => h('tr', { key: i }, ...r.map((c, j) => h(M.td ?? 'td', { key: j }, c))))));
    const tables = page(
        'tables',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'p-4' },
                h('div', { 'data-t': 'fits' }, mdTable(['Code', 'Status', 'What it means'], [
                    [h(M.code, null, 'oc_session_expired_or_revoked'), '401', 'The session ended. Sign in again.'],
                    [h(M.code, null, 'oc.vault.entitlement_missing'), '402', 'No plan covers this. See /pricing.'],
                    [h(M.code, null, 'https://ochk.io/api/auth/revocations'), '200', 'The feed of ended sessions.'],
                ])),
                h('div', { 'data-t': 'wide' }, mdTable(['A', 'B', 'C', 'D', 'E', 'F'], [
                    ['first_column_value', 'second_column_value', 'third_column_value', 'fourth_column_value', 'fifth_column_value', 'sixth_column_value'].map((x) => h(M.code, null, x.replace(/_/g, ''))),
                ]))
            )
        )
    );
    // 1.9.0: a clickable table, a compact chip in a line, six wrapping tabs, a product word in the sidebar.
    const parts190 = page(
        'parts190',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-6 p-4' },
                h(C.DataTable, {
                    columns: [
                        { key: 'name', header: 'Name', cell: (r) => r.name, primary: true },
                        { key: 'id', header: 'Id', cell: (r) => h('button', { type: 'button', 'data-copy': '' }, r.id) },
                        { key: 'when', header: 'When', cell: () => '2 days ago' },
                    ],
                    rows: [{ name: 'Ada', id: 'a1' }],
                    rowKey: (r) => r.id,
                    rowHref: (r) => `/people/${r.id}`,
                }),
                h(P.DensityProvider, { density: 'compact' }, h('p', { 'data-line': '', className: 'text-[0.875rem]' }, 'Signed by ', h(C.HashChip, { value: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t' }))),
                h(P.Tabs, { defaultValue: 'nodes' }, h(P.TabsList, { wrap: true, 'data-wrap': '' }, ...['Nodes', 'Blocks', 'Mempool', 'Lightning', 'Mining', 'Fees'].map((t) => h(P.TabsTrigger, { key: t, value: t.toLowerCase() }, t))))
            )
        )
    );
    const productShell = page(
        'product-shell',
        renderToStaticMarkup(h(Ch.AppShell, { product: 'vault', family: 'vault', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }] }, h('p', null, 'page')))
    );
    const footer = page('footer', renderToStaticMarkup(h(Ch.OchkIoFooter)));
    const icons = page(
        'icons',
        renderToStaticMarkup(
            h(
                'div',
                // Apart, so each target is its own: two closer than 12px share the overlap.
                { className: 'flex items-center gap-4 p-6' },
                h(P.Button, { size: 'icon-sm', variant: 'ghost', 'aria-label': 'Generate another', 'data-t': 'icon-sm' }, 'G'),
                h(P.Button, { size: 'sm', 'data-t': 'sm' }, 'Get an account'),
                h(P.Button, { size: 'icon', variant: 'ghost', 'aria-label': 'Menu', 'data-t': 'icon' }, 'M'),
                h(C.CopyButton, { value: 'x', label: 'Copy passphrase' }),
                h(C.Panel, { title: 'Hash rate', expandable: true }, h('p', null, 'chart'))
            )
        )
    );
    const LONG = 'pledge.query(address="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t", status="open", window_blocks=4320) — every open pledge from this address in the last month, newest first';
    const wrapRows = page(
        'wrap-rows',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'flex w-[20rem] flex-col gap-1 p-2' },
                h(C.ListRow, { variant: 'pane', onSelect: () => {}, lines: 'all', leading: h(C.Avatar, { seed: 'a', name: 'Query', size: 'md' }), title: 'Open pledges from one address', meta: '3', description: LONG, trailing: h('span', { 'data-end': '', style: { display: 'inline-block', width: 16, height: 16, background: 'currentColor' } }) }),
                h(C.ListRow, { variant: 'pane', onSelect: () => {}, title: 'Open pledges from one address', description: LONG, 'data-one': '' })
            )
        )
    );
    const borders = page(
        'borders',
        '<div class="p-4 text-foreground"><div data-b="bare" class="border p-2">a</div><div data-b="bottom" class="border-b p-2">b</div>' +
            '<div class="divide-y"><p class="p-2">c</p><p data-b="divide" class="p-2">d</p></div><div data-b="utility" class="border border-foreground p-2">e</div></div>'
    );
    const menu = page('menu', '<div id="root" class="p-4"></div>', '<script src="menu.js"></script>');
    const toolMenu = page('toolmenu', '<div id="root"></div>', '<script src="toolmenu.js"></script>');
    // Rows in a pane, each with a picture, a time and a menu button.
    const paneRows = page(
        'pane-rows',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'flex w-[22rem] max-w-full flex-col gap-1 p-2' },
                // The third has no picture: a title alone must still be a thumb's height.
                ...['Ada Lovelace', 'Satoshi Fan Club with a long name', 'Notes'].map((name, i) =>
                    h(C.ListRow, {
                        key: name,
                        variant: 'pane',
                        onSelect: () => {},
                        current: i === 0,
                        leading: i < 2 ? h(C.Avatar, { seed: name, name, size: 'md' }) : undefined,
                        title: name,
                        meta: 'Yesterday',
                        actions: h('button', { type: 'button', 'data-act': '', className: 'size-11' }, '…'),
                    })
                )
            )
        )
    );

    // One column: a title in each kind of tool page.
    const title = h(C.PageHeader, { title: 'Verify a stamp', description: 'Drop a .stamp file.' });
    const shell = (props, child) => renderToStaticMarkup(h(Ch.ToolShell, { protocol: 'stamp', tools: [], ...props }, child));
    const columns = [
        ['wide', page('col-wide', shell({}, title))],
        ['narrow', page('col-narrow', shell({ measure: 'narrow' }, title))],
        ['app + ToolColumn', page('col-app', shell({ variant: 'app' }, h('div', { className: 'min-h-0 flex-1 overflow-y-auto' }, h(Ch.ToolColumn, null, title))))],
        ['ErrorPage', page('col-error', shell({}, h(C.ErrorPage, { code: 404 })))],
    ];
    // The small controls, on a phone.
    const targets = page(
        'targets',
        shell(
            {},
            h(
                'div',
                { className: 'flex flex-col gap-6' },
                h(C.FilterChips, { label: 'State', value: 'all', onChange: () => {}, options: [{ value: 'all', label: 'All' }, { value: 'kept', label: 'Kept', count: 3 }] }),
                h(C.ArtifactView, { content: '{"v":1,"kind":"stamp"}', title: 'Stamp envelope', filename: 'a.stamp' })
            )
        )
    );

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    try {
        for (const [width, height] of [
            [390, 844],
            [1440, 900],
        ]) {
            const p = await browser.newPage({ viewport: { width, height } });
            // Markdown tables: the one that fits does not scroll and no cell spills; the wide one scrolls.
            await p.goto(tables);
            const tb = await p.evaluate(() =>
                Object.fromEntries(
                    [...document.querySelectorAll('[data-t]')].map((w) => {
                        const scroller = w.querySelector('table').parentElement;
                        const spills = [...w.querySelectorAll('td, th')].filter((c) => c.scrollWidth > c.clientWidth + 1).length;
                        return [w.dataset.t, { scrolls: scroller.scrollWidth > scroller.clientWidth + 1, spills }];
                    })
                )
            );
            check(!tb.fits.scrolls && tb.fits.spills === 0, `[${width}] a three-column error table scrolls (${tb.fits.scrolls}) or spills from ${tb.fits.spills} cell(s)`);
            if (width < 768) check(tb.wide.scrolls, `[${width}] a table that cannot fit does not scroll`);
            // A tool site's phone menu holds Docs, a 44px target, beside About.
            if (width < 768) {
                await p.goto(toolMenu);
                await p.click('header button[aria-label="Open menu"]');
                await p.waitForSelector('[role="dialog"]');
                const docs = await p.evaluate(() => {
                    const a = [...document.querySelectorAll('[role="dialog"] a')].find((x) => x.textContent.trim().startsWith('Docs'));
                    return a ? { href: a.getAttribute('href'), h: a.getBoundingClientRect().height } : null;
                });
                check(docs?.href === 'https://ochk.io/docs/stamp' && docs.h >= 44, `[${width}] the tool site's phone menu has no 44px Docs link (${JSON.stringify(docs)})`);
            }
            // ListRow lines="all": wrapped in full, its picture and end level with the title.
            await p.goto(wrapRows);
            const wr = await p.evaluate(() => {
                const [all, one] = [...document.querySelectorAll('li')];
                const row = all.querySelector('button').getBoundingClientRect();
                const title = all.querySelector('button span.flex-col span span').getBoundingClientRect();
                const lineH = parseFloat(getComputedStyle(all.querySelector('button span.flex-col span span')).lineHeight) || 22.5;
                const end = all.querySelector('[data-end]').getBoundingClientRect();
                const pic = all.querySelector('[aria-hidden].rounded-full').getBoundingClientRect();
                const desc = all.querySelectorAll('button span.flex-col > span')[1];
                const oneDesc = one.querySelectorAll('button span.flex-col > span')[1];
                return {
                    h: row.height,
                    endOff: end.top + end.height / 2 - (title.top + lineH / 2),
                    picOff: pic.top - title.top,
                    wraps: desc.getBoundingClientRect().height > 40 && desc.scrollWidth <= desc.clientWidth + 1,
                    oneCut: oneDesc.scrollWidth > oneDesc.clientWidth + 1 && oneDesc.getBoundingClientRect().height < 30,
                };
            });
            check(wr.h >= 44 && wr.wraps, `[${width}] ListRow lines="all": ${Math.round(wr.h)}px tall, the line wraps in full ${wr.wraps}`);
            check(Math.abs(wr.endOff) <= 3 && wr.picOff <= 6 && wr.picOff >= -12, `[${width}] ListRow lines="all": the end is ${wr.endOff.toFixed(1)}px off the title's line, the picture ${wr.picOff.toFixed(1)}px`);
            check(wr.oneCut, `[${width}] ListRow: the default no longer cuts the line to one`);
            // 1.9.0 parts.
            await p.goto(parts190);
            const b190 = await p.evaluate((phone) => {
                const lands = (el, x, y) => el.contains(document.elementFromPoint(x, y));
                const out = {};
                if (phone) {
                    const li = [...document.querySelectorAll('ul > li')].find((x) => x.querySelector('a[href="/people/a1"]'));
                    if (!li) return { rowOpens: false, copyOwn: false, line: 99, chipTarget: false, tabsIn: false, over: 0 };
                    li.scrollIntoView({ block: 'center' });
                    const r = li.getBoundingClientRect();
                    out.rowOpens = lands(li.querySelector('a'), r.left + r.width - 20, r.bottom - 8);
                    const copy = li.querySelector('[data-copy]').getBoundingClientRect();
                    out.copyOwn = lands(li.querySelector('[data-copy]'), copy.left + copy.width / 2, copy.top + copy.height / 2);
                } else {
                    const tr = document.querySelector('tbody tr');
                    const when = tr.cells[2].getBoundingClientRect();
                    const link = tr.querySelector('a');
                    out.rowOpens = Boolean(link) && lands(link, when.left + when.width / 2, when.top + when.height / 2);
                    const copy = tr.querySelector('[data-copy]').getBoundingClientRect();
                    out.copyOwn = lands(tr.querySelector('[data-copy]'), copy.left + copy.width / 2, copy.top + copy.height / 2);
                }
                const line = document.querySelector('[data-line]');
                const btn = line.querySelector('button');
                line.scrollIntoView({ block: 'center' });
                const b = btn.getBoundingClientRect();
                out.line = line.getBoundingClientRect().height;
                out.chipTarget = lands(btn, b.left + b.width / 2, b.top + b.height / 2 - 21.5) && lands(btn, b.left + b.width / 2, b.top + b.height / 2 + 21.5);
                const list = document.querySelector('[data-wrap]');
                const tabs = [...list.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect());
                out.tabsIn = tabs.every((t) => t.right <= innerWidth && t.left >= 0);
                out.over = document.documentElement.scrollWidth - innerWidth;
                return out;
            }, width < 640);
            check(b190.rowOpens, `[${width}] DataTable: a press elsewhere in a linked row does not open it`);
            check(b190.copyOwn, `[${width}] DataTable: a control in a linked row lost its press to the row`);
            check(b190.line < 32 && b190.chipTarget, `[${width}] HashChip compact: the line is ${Math.round(b190.line)}px, or its copy is not a 44px target`);
            check(b190.tabsIn && b190.over <= 0, `[${width}] TabsList wrap: a tab sits off the screen (overflow ${b190.over})`);
            if (width >= 1024) {
                await p.goto(productShell);
                const side = await p.evaluate(() => {
                    const aside = document.querySelector('aside');
                    const home = aside.querySelector('a[aria-label="Home"]');
                    return { asideRight: aside.getBoundingClientRect().right, homeRight: home.getBoundingClientRect().right, scroll: aside.scrollWidth - aside.clientWidth };
                });
                check(side.homeRight <= side.asideRight && side.scroll <= 0, `[${width}] AppShell: the lockup and product word overflow the sidebar (${Math.round(side.homeRight)} > ${Math.round(side.asideRight)})`);
            }
            // The family footer: a phone gets folded groups in 600px; a desk the columns.
            await p.goto(footer);
            const ft = await p.evaluate(() => {
                const f = document.querySelector('footer');
                const groups = [...f.querySelectorAll('details')];
                const shown = (el) => el.getClientRects().length > 0;
                const deskLinks = [...f.querySelectorAll('details ~ div a, div.col-span-full ~ div.hidden a')].map((a) => a.getAttribute('href'));
                return {
                    h: f.getBoundingClientRect().height,
                    groups: groups.length,
                    groupsShown: groups.filter(shown).length,
                    closed: groups.every((g) => !g.open),
                    summaries: groups.filter(shown).map((g) => g.querySelector('summary').getBoundingClientRect().height),
                    phoneLinks: groups.flatMap((g) => [...g.querySelectorAll('a')].map((a) => a.getAttribute('href'))),
                    deskShown: [...f.querySelectorAll('a')].filter((a) => shown(a) && !a.closest('details') && !a.closest('[aria-label="Legal"]')).length,
                    deskLinks,
                };
            });
            if (width < 768) {
                const inter = await p.evaluate(async () => {
                    await document.fonts.ready;
                    return [...document.fonts].filter((f) => /OCA Inter/.test(f.family)).map((f) => f.status);
                });
                check(inter.includes('loaded'), `[${width}] the page measured without Inter loaded (${inter.join()})`);
                check(ft.h <= 600, `[${width}] the family footer runs ${Math.round(ft.h)}px, past 600`);
                check(ft.groupsShown > 0 && ft.closed && ft.summaries.every((x) => x >= 44), `[${width}] footer groups: ${ft.groupsShown} shown, closed ${ft.closed}, summaries ${ft.summaries.map(Math.round).join('/')}px`);
                if (ft.groupsShown > 0) await p.click('footer details summary');
                const opened = await p.evaluate(() => [...(document.querySelector('footer details')?.querySelectorAll('a') ?? [])].filter((a) => a.getClientRects().length > 0 && a.getBoundingClientRect().height >= 43.5).length);
                check(opened > 0, `[${width}] an opened footer group shows no 44px link`);
            } else {
                check(ft.groupsShown === 0 && ft.deskShown >= ft.phoneLinks.length, `[${width}] a desk sees ${ft.groupsShown} folded groups and ${ft.deskShown} of ${ft.phoneLinks.length} links`);
            }
            // Every link a desk shows, a phone reaches through its groups.
            check(ft.groups > 0 && ft.phoneLinks.length > 0 && ft.phoneLinks.join() === ft.deskLinks.join(), `[${width}] the phone's groups hold ${ft.phoneLinks.length} links, the desk's columns ${ft.deskLinks.length}`);
            // 32px icon buttons: 44px to a thumb, unchanged to a mouse.
            {
                const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768 });
                const t = await ctx.newPage();
                await t.goto(icons);
                const reach = await t.evaluate(() =>
                    ['[data-t="icon-sm"]', '[data-t="sm"]', '[data-t="icon"]', 'button[aria-label="Copy passphrase"]', 'button[aria-label="Open full screen"]'].map((sel) => {
                        const el = document.querySelector(sel);
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        // A wide button needs only the height; a square one both ways.
                        const wide = r.width > 44;
                        return { sel, size: Math.round(r.height), reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) && (wide || (lands(cx - 21.5, cy) && lands(cx + 21.5, cy))) };
                    })
                );
                const DRAWN = { '[data-t="sm"]': 36, '[data-t="icon"]': 40 };
                for (const r of reach) {
                    const drawn = DRAWN[r.sel] ?? 32;
                    if (width < 768) check(r.reach && r.size === drawn, `[${width} touch] ${r.sel}: drawn ${r.size}px, 44px target ${r.reach}`);
                    else check(!r.reach && r.size === drawn, `[${width} mouse] ${r.sel}: drawn ${r.size}px, or the target grew past the button (${r.reach})`);
                }
                await ctx.close();
            }
            // Bare borders take the hairline token, in both modes; a colour utility still wins.
            for (const dark of [false, true]) {
                await p.goto(borders);
                const seen = await p.evaluate((dark) => {
                    document.documentElement.classList.toggle('dark', dark);
                    const probe = document.createElement('i');
                    probe.style.color = 'var(--border)';
                    document.body.append(probe);
                    const token = getComputedStyle(probe).color;
                    const fg = getComputedStyle(document.body).color;
                    const side = { bare: 'borderTopColor', bottom: 'borderBottomColor', divide: 'borderTopColor', utility: 'borderTopColor' };
                    return { token, fg, ...Object.fromEntries(Object.entries(side).map(([k, s]) => [k, getComputedStyle(document.querySelector(`[data-b="${k}"]`))[s]])) };
                }, dark);
                const mode = dark ? 'dark' : 'light';
                for (const k of ['bare', 'bottom', 'divide']) check(seen[k] === seen.token, `[${width} ${mode}] a bare ${k === 'bare' ? 'border' : k === 'bottom' ? 'border-b' : 'divide-y'} is ${seen[k]}, not the hairline ${seen.token}`);
                check(seen.utility === seen.fg, `[${width} ${mode}] border-foreground lost to the base rule (${seen.utility})`);
            }
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
            // One column: every title at the gutter of one centred 72rem column.
            const gutter = width < 768 ? 16 : Math.max(32, (width - 1152) / 2);
            for (const [name, url] of columns) {
                await p.goto(url);
                const box = await p.evaluate(() => ({
                    left: document.querySelector('main h1').getBoundingClientRect().left,
                    width: document.querySelector('main header')?.getBoundingClientRect().width,
                    foot: document.querySelector('footer a[href="https://ochk.io"]')?.getBoundingClientRect().left,
                }));
                check(Math.abs(box.left - gutter) < 0.5, `[${width}] ${name}: the title starts at ${Math.round(box.left)}px, not the column's ${gutter}px`);
                if (box.foot !== undefined) check(Math.abs(box.foot - gutter) < 0.5, `[${width}] ${name}: the footer's lockup starts at ${Math.round(box.foot)}px, not the column's ${gutter}px`);
                if (name === 'narrow') check(box.width <= 768.5, `[${width}] narrow: the page runs ${Math.round(box.width)}px wide, past 48rem`);
            }
            // A menu's items and a pane's rows: 44px on a phone; the row's time clear of its actions.
            await p.goto(menu);
            await p.waitForSelector('[role="menuitem"]');
            const items = await p.$$eval('[role="menuitem"]', (els) => els.map((e) => e.getBoundingClientRect().height));
            check(items.length === 2 && items.every((x) => (width < 768 ? x >= 44 : x <= 40.5)), `[${width}] menu items are ${items.map(Math.round).join('/')}px tall`);
            await p.goto(paneRows);
            const rowBoxes = await p.$$eval('li', (lis) =>
                lis.map((li) => {
                    const row = li.querySelector('button:not([data-act])').getBoundingClientRect();
                    const meta = li.querySelector('.oca-tabular').getBoundingClientRect();
                    const act = li.querySelector('[data-act]').getBoundingClientRect();
                    const pic = li.querySelector('[aria-hidden].rounded-full')?.getBoundingClientRect();
                    return { h: row.height, gap: act.left - meta.right, pic: pic ? [pic.width, pic.height] : null };
                })
            );
            for (const [i, r] of rowBoxes.entries()) {
                check(r.h >= 44, `[${width}] pane row ${i + 1} is ${Math.round(r.h)}px tall`);
                check(r.gap >= 4, `[${width}] pane row ${i + 1}: the time runs under the actions (gap ${Math.round(r.gap)}px)`);
                if (r.pic) check(r.pic[0] === 44 && r.pic[1] === 44, `[${width}] pane row ${i + 1}: the avatar is ${r.pic.join('×')}, not 44×44`);
            }
            // Targets: a press anywhere in the 44px around the control's middle lands on it.
            await p.goto(targets);
            const reach = await p.evaluate(() => {
                const probe = (el) => {
                    el.scrollIntoView({ block: 'center' });
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                    return { tall: lands(cx, cy - 21.5) && lands(cx, cy + 21.5), wide: lands(cx - 21.5, cy) && lands(cx + 21.5, cy), height: r.height };
                };
                const footer = document.querySelector('footer a[href="https://ochk.io"]');
                return {
                    lockup: probe(footer),
                    lockupHeight: footer.querySelector('svg, span').getBoundingClientRect().height,
                    download: probe(document.querySelector('button[aria-label="Download a.stamp"]')),
                    copy: probe(document.querySelector('button[aria-label="Copy code"]')),
                    view: probe(document.querySelector('[aria-label="View"] button')),
                    chip: probe(document.querySelector('[role="group"][aria-label="State"] button')),
                };
            });
            if (width < 768) {
                for (const k of ['lockup', 'download', 'copy', 'view', 'chip']) check(reach[k].tall, `[${width}] ${k}: a press 22px above or below its middle misses it`);
                for (const k of ['download', 'copy']) check(reach[k].wide, `[${width}] ${k}: a press 22px beside its middle misses it`);
                check(reach.lockup.height < 40, `[${width}] lockup: the link grew to ${Math.round(reach.lockup.height)}px; its look should not change`);
            } else {
                // A desk keeps the compact sizes.
                check(reach.download.height <= 28.5 && reach.chip.height <= 36.5, `[${width}] the bar and chips grew on a desk (download ${reach.download.height}, chip ${reach.chip.height})`);
            }
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
console.log(`✓ layout: ${checks} checks in Chrome at 390 and 1440; panel actions, an expanded body, the app frames, one column, 44px targets, menus and rows, markdown tables, bare borders, 1.9.0's parts, the folded footer, touch targets, wrapped rows`);
