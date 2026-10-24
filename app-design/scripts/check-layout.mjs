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
 * - The family footer fits a phone in 600px, its meta line included, each
 *   link group a disclosure with a 44px summary, every link still there; a
 *   desk sees the columns. A product's footer with seven groups fits too.
 * - A block title keeps one button beside it on a phone, level with the
 *   title; a group of three wraps under it.
 * - A ListRow holds a line over its title and two under it; a text action
 *   sits beside them on a desk and under them on a phone, lined up with the
 *   text, never over it. A wide end, in trailing or actions, drops under the
 *   text on a phone rather than squeeze it. A large row (size="lg") has an
 *   18px title, a padded card's air and hairlines inset to its text; a list
 *   in a flush Card runs to the card's edges, lined up with its text.
 * - A docs heading that is one long identifier breaks rather than widen a
 *   phone; a link in prose, a list or a table cell is 24px to press. Each
 *   fallback stack sets text at its webfont's width (prose in four weights,
 *   display type, code), and no measure is in ch, which the fallback narrows.
 * - ListRow stackBelow="sm" gives a phone's long-token title (a bc1q
 *   address) the whole row, the badge under it; a desk's row is unchanged.
 * - On a touch screen a 32px icon button (icon-sm, Copy, a Panel's full
 *   screen), a 36px small button, a 40px icon button and the theme switch
 *   are 44px targets; a mouse sees them unchanged. A small field is drawn
 *   44px tall to a thumb and 36px to a mouse.
 * - SignInFrame holds still while its ceremony grows past the window: the
 *   title stays put, and the ink column is one screen tall with its art in
 *   place.
 * - A tool site's Docs link is in its phone menu, a 44px target, when the
 *   tools are the tab bar.
 * - A ListRow with lines="all" wraps its title and line in full, stays
 *   44px at least, and keeps its picture and its end level with the title.
 * - A bare border, border-b or divide-y draws in the hairline, not in the
 *   text colour (Tailwind 4's default), in light and dark; a colour utility
 *   still wins.
 * - Every tool page's title starts at one x: ToolShell's wide and narrow
 *   columns, an app page's ToolColumn, and an ErrorPage inside the shell.
 *   A short tool page's footer starts below the window, so content that
 *   arrives after the first paint moves no footer in view.
 * - On a phone the small controls are a thumb's 44px: the compact footer's
 *   lockup, an artifact's Download, Copy and view switch, filter chips, a
 *   menu's items, a row in a pane. A row's actions keep clear of its time.
 *
 * CI runners carry Chrome (CHROME_BIN); locally it uses Playwright's. Run
 * after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Docs prose, a display line and a code token, for the fallback faces' widths.
const FALLBACK_PROSE =
    'The content itself is NOT included in the envelope, only its hash. You ship the envelope alongside the content (archive, filesystem, HTTP, whatever). ' +
    'Hex is chosen so the signed message is legible in wallet UIs: a user signing through UniSat, Xverse, Leather, or Sparrow sees something they can read aloud. ' +
    'Envelopes can be published to Nostr kind-30083 for durable public discovery, but it is optional. A stamp is a self-contained JSON blob; email it, embed it in a git commit message, put it in S3.';
const FALLBACK_HEADLINE = 'Sign in with a Bitcoin wallet. Back it with coins you hold.';
const FALLBACK_CODE = 'application/vnd.orangecheck.stamp+json sha256(canonical(stamp)) 0x1f2e3d4c';

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

// A ch is the face's 0, which the Arial fallback draws 6-12% narrower than Inter's, so a measure in ch moves at the swap.
// Stories too: a story is what a site copies. max-w-prose is 65ch.
{
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    const inCh = walk(join(pkg, 'src'))
        .filter((f) => /\.(tsx?|css)$/.test(f))
        .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\[[\d.]+ch\]|:\s*['"]?[\d.]+ch\b|['"][\d.]+ch['"]|\bmax-w-prose\b/g)].map((m) => `${f.slice(pkg.length + 1)}: ${m[0]}`));
    check(inCh.length === 0, `a width in ch moves at the font swap; use em: ${inCh.join(', ')}`);
}

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
    // A product's footer as vault draws it: three columns of its own, the family's four, the legal row.
    const productFooter = page(
        'product-footer',
        renderToStaticMarkup(
            h(Ch.SiteFooter, {
                columns: ['Vault', 'Docs', 'Source'].map((heading) => ({ heading, links: [1, 2, 3].map((i) => ({ href: `/${heading.toLowerCase()}/${i}`, label: `${heading} ${i}` })) })),
                family: true,
                legal: ['Privacy', 'Terms', 'Security', 'Trademarks', 'Contact'].map((label) => ({ href: `/${label.toLowerCase()}`, label })),
                fineprint: 'A password manager, encrypted in your browser. We store only what we cannot read.',
            })
        )
    );
    // Block titles in a phone's column: a button stays beside its title; a wide group wraps under.
    const titles = page(
        'titles',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-10 px-4 py-6' },
                h('div', { 'data-t': 'one' }, h(C.SectionTitle, { title: 'Payout addresses', description: 'Where your earnings go, and when they last moved.', action: h(P.Button, { size: 'sm', variant: 'secondary' }, 'Add address') })),
                h('div', { 'data-t': 'many' }, h(C.SectionTitle, { title: 'Keys', action: h('div', { className: 'flex gap-2' }, ...['Import', 'Generate', 'Export all'].map((l) => h(P.Button, { key: l, size: 'sm', variant: 'secondary' }, l))) }))
            )
        )
    );
    // A sign-in whose ceremony grows as it mounts: from one line to taller than the window.
    const signinGrow = page('signin-grow', renderToStaticMarkup(h(Ch.SignInFrame, { title: 'Sign in', lead: 'One line under the title.' }, h('div', { 'data-ceremony': '', style: { height: '40px' } }, 'Checking your session'))));
    // Fields in a tool's compact density, a small one set by hand, and a default one.
    const fields = page(
        'fields',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'flex flex-col gap-4 p-6' },
                h(P.DensityProvider, { density: 'compact' }, h(P.Input, { 'data-f': 'compact', 'aria-label': 'Attestation id' }), h(P.Select, null, h(P.SelectTrigger, { 'data-f': 'select', 'aria-label': 'Network' }, h(P.SelectValue, { placeholder: 'Mainnet' })))),
                h(P.Input, { size: 'sm', 'data-f': 'sm', 'aria-label': 'Small' }),
                h(P.Input, { 'data-f': 'md', 'aria-label': 'Default' })
            )
        )
    );
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
                h(Ch.ThemeToggle, {}),
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
    // ListRow's slots: a line over the title, two under it, a text action (ochk.app's Signed inbox, a binding to remove).
    const rowSlots = page(
        'row-slots',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, {
                    leading: h(C.Avatar, { seed: 'notes', name: 'Lumen Notes', size: 'md' }),
                    eyebrow: h('span', { 'data-s': 'eyebrow' }, 'Signed · 21 Oct'),
                    title: h('span', { 'data-s': 'title' }, 'Lumen Notes'),
                    meta: '2 min ago',
                    description: h('span', { 'data-s': 'desc' }, 'Asked to read your identity'),
                    detail: h('span', { 'data-s': 'detail' }, 'From notes.example, key 86020d78'),
                    onSelect: () => {},
                    action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-s': 'action' }, 'Retry this guardian'),
                }),
                // A smaller picture: the action still lines up with the text, not with a guess at the picture.
                h(C.ListRow, {
                    leading: h(C.Avatar, { seed: 'g2', name: 'Guardian two', size: 'sm' }),
                    title: h('span', { 'data-s': 'title2' }, 'Guardian 2 of 4'),
                    description: 'Did not answer the last round',
                    href: '/guardians/2',
                    action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-s': 'action2' }, 'Remove'),
                })
            )
        )
    );
    // A wide end (a badge and two buttons, about 210px), in trailing and in actions: on a phone it drops under the text.
    const wideEnd = (tag) => h('span', { 'data-s': tag, style: { display: 'inline-flex', width: 210, height: 32, background: 'var(--muted)' } });
    const rowWide = page(
        'row-wide',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, { leading: h(C.Avatar, { seed: 'x', name: 'xaxis', size: 'md' }), title: h('span', { 'data-s': 't-a' }, 'xaxis'), description: 'Holds 0.5 BTC unspent since block 814,210, the reason in full', trailing: wideEnd('end-a') }),
                h(C.ListRow, { leading: h(C.Avatar, { seed: 'y', name: 'proof', size: 'md' }), title: h('span', { 'data-s': 't-b' }, 'Proof 86020d78'), description: 'Signed by bc1q9h7g…5e3w7t', href: '/proofs/1', actions: wideEnd('end-b') })
            )
        )
    );
    // ListRow size="lg": ochk.app's home steps, as they looked before they were rows.
    const lgRows = page(
        'lg-rows',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto max-w-[44rem] p-4' },
                h(
                    C.ListCard,
                    null,
                    ...[
                        ['Sign in', '1 · Bitcoin address', 'A second way in is also your way back.', 'Add a second way in'],
                        ['Back it', 'Not yet', null, 'Back your account'],
                        ['Own it', 'orangecheck holds what you earn, for now', null, 'Who holds it'],
                    ].map(([eyebrow, title, note, act], i) =>
                        h(C.ListRow, {
                            key: i,
                            size: 'lg',
                            lines: 'all',
                            eyebrow: h('span', { 'data-lg': `e${i}` }, eyebrow),
                            title: h('span', { 'data-lg': `t${i}` }, title),
                            description: note ?? undefined,
                            action: h(P.Button, { size: 'sm', variant: 'secondary', 'data-lg': `a${i}` }, act),
                        })
                    )
                )
            )
        )
    );
    // A list in a flush card: its rows run to the card's edges, lined up with the card's own text.
    const flushCards = page(
        'flush',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto flex max-w-[44rem] flex-col gap-6 p-4' },
                h(
                    P.Card,
                    { flush: true, className: 'flex flex-col gap-4', 'data-f': 'mid' },
                    h('h3', { 'data-f': 'head', className: 'oca-title-sm' }, 'System health'),
                    h(C.ListCard, null, ...['Relay', 'Executor', 'Mint'].map((t) => h(C.ListRow, { key: t, title: h('span', { 'data-f': 'row' }, t), description: 'Answering', trailing: h(P.Badge, null, 'up') }))),
                    h('p', { className: 'text-[0.8125rem]' }, 'Checked every minute.')
                ),
                h(P.Card, { flush: true, className: 'flex flex-col gap-4', 'data-f': 'end' }, h('h3', { className: 'oca-title-sm' }, 'Ledger'), h(C.ListCard, null, h(C.ListRow, { title: 'Settled', meta: '2 min ago' })))
            )
        )
    );
    // Docs headings that are one long identifier, and links a finger has to press: an SDK page at 390.
    const sdk = page(
        'sdk',
        renderToStaticMarkup(
            h(
                'div',
                { className: 'mx-auto max-w-[48rem] px-4 py-6', 'data-sdk': '' },
                h(C.Breadcrumbs, { items: [{ href: '/docs', label: 'Docs' }, { href: '/docs/sdk', label: 'SDKs' }, { label: 'agent-core' }] }),
                h(M.h1, { id: 'fn' }, 'Function: federationDescriptorCanonicalMessage()'),
                h(M.h2, { id: 'p' }, 'canonicalAbandonmentMessageBytes()'),
                h(M.h3, { id: 'r' }, 'resetFamilyRevocationCheckForTests'),
                h(M.p ?? 'p', null, 'Defined in: ', h(C.TextLink, { href: 'https://github.com/orangecheck/oc-packages/blob/main/agent-core/src/federation.ts#L42', 'data-link': 'prose' }, 'federation.ts:42')),
                h(M.ul ?? 'ul', null, h(M.li ?? 'li', null, h(C.TextLink, { href: '/sdk/agent-core/README', 'data-link': 'li' }, 'agent-core'))),
                // An ApiTable's 13px description text.
                h('p', { className: 'text-[0.8125rem]' }, 'See ', h(C.TextLink, { href: '/sdk/agent-core/interfaces/Delegation' }, 'Delegation')),
                mdTable(['Member', 'Type'], [[h(C.TextLink, { href: '/sdk/agent-core/functions/verify', 'data-link': 'cell' }, 'verify'), 'function']])
            )
        )
    );
    // A title that is one long token, a badge beside it: stackBelow="sm" gives a phone's title the whole row.
    const BC1Q = 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7tqzs2x9fhd5n6y8ue0cle';
    const badge = (k) => h('span', { 'data-st': k, style: { display: 'inline-flex', width: 110, height: 24, background: 'var(--muted)', borderRadius: 999 } });
    const stacked = page(
        'stacked',
        renderToStaticMarkup(
            h(
                'ul',
                { className: 'mx-auto max-w-[40rem] divide-y divide-border rounded-2xl border border-border bg-card' },
                h(C.ListRow, { lines: 'all', stackBelow: 'sm', title: h('span', { 'data-st': 'title' }, BC1Q), description: 'Eligible: 0.5 BTC held since block 814,210', trailing: badge('badge') }),
                h(C.ListRow, { lines: 'all', title: h('span', { 'data-st': 'title-plain' }, BC1Q), description: 'Eligible: 0.5 BTC held since block 814,210', trailing: badge('badge-plain') })
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
            // ListRow slots: the line over the title, two under it, a text action beside them or, on a phone, under them.
            await p.goto(rowSlots);
            const rs = await p.evaluate(() => {
                const box = (s) => document.querySelector(`[data-s="${s}"]`)?.getBoundingClientRect() ?? null;
                const [eyebrow, title, desc, detail, action] = ['eyebrow', 'title', 'desc', 'detail', 'action'].map(box);
                const li = document.querySelector('li').getBoundingClientRect();
                const hits = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                return {
                    shown: [eyebrow, title, desc, detail, action].every(Boolean),
                    order: eyebrow && title && desc && detail ? eyebrow.bottom <= title.top + 1 && title.bottom <= desc.top + 1 && desc.bottom <= detail.top + 1 : false,
                    clear: action ? ![eyebrow, title, desc, detail].some((t) => hits(t, action)) : false,
                    under: action && detail ? action.top >= detail.bottom : false,
                    indent: action && title ? Math.round(action.left - title.left) : null,
                    inside: action ? action.right <= li.right + 0.5 && action.left >= li.left : false,
                    indent2: Math.round(box('action2').left - box('title2').left),
                    // The row still opens from its line under the title, and the action stays its own.
                    opens: (() => {
                        const row2 = document.querySelectorAll('li')[1];
                        const link = row2.querySelector('a[href="/guardians/2"]');
                        const line = [...row2.querySelectorAll('span')].find((x) => x.textContent === 'Did not answer the last round').getBoundingClientRect();
                        const a2 = box('action2');
                        return Boolean(link) && link.contains(document.elementFromPoint(line.left + 10, line.top + line.height / 2)) && document.querySelector('[data-s="action2"]').contains(document.elementFromPoint(a2.left + a2.width / 2, a2.top + a2.height / 2));
                    })(),
                };
            });
            check(rs.shown && rs.order, `[${width}] ListRow: the line over the title, the title and the two lines under it are missing or out of order (${JSON.stringify(rs)})`);
            check(rs.clear && rs.inside, `[${width}] ListRow action: the text action covers the row's text or leaves the row (${JSON.stringify(rs)})`);
            check(rs.opens, `[${width}] ListRow action: the row no longer opens from its text, or the action lost its press (${JSON.stringify(rs)})`);
            if (width < 640) check(rs.under && Math.abs(rs.indent) <= 1 && Math.abs(rs.indent2) <= 1, `[${width}] ListRow action: on a phone it is not under the text, lined up with it (${JSON.stringify(rs)})`);
            else check(!rs.under, `[${width}] ListRow action: on a desk it falls under the text (${JSON.stringify(rs)})`);
            // A wide end beside the text on a desk; on a phone under it, lined up with it, the text kept whole.
            await p.goto(rowWide);
            const rw = await p.evaluate(() =>
                ['a', 'b'].map((k) => {
                    const t = document.querySelector(`[data-s="t-${k}"]`);
                    const text = t.closest('.flex-col').getBoundingClientRect();
                    const end = document.querySelector(`[data-s="end-${k}"]`).getBoundingClientRect();
                    const hit = end.left < text.right && text.left < end.right && end.top < text.bottom && text.top < end.bottom;
                    return { k, textW: Math.round(text.width), under: end.top >= text.bottom - 1, aligned: Math.abs(end.left - text.left) <= 1, hit };
                })
            );
            for (const r of rw) {
                check(!r.hit, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end covers the text (${JSON.stringify(r)})`);
                if (width < 640) check(r.under && r.aligned && r.textW >= 144, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end squeezes the text to ${r.textW}px rather than dropping under it (${JSON.stringify(r)})`);
                else check(!r.under, `[${width}] ListRow ${r.k === 'a' ? 'trailing' : 'actions'}: a wide end left the text's side on a desk (${JSON.stringify(r)})`);
            }
            // ListRow lg: the value at 1.125rem, the before's air, hairlines inset to the text.
            await p.goto(lgRows);
            const lgm = await p.evaluate(() => {
                const ulEl = document.querySelector('ul');
                // From the list's inner edge, past its 1px border.
                const ul = { left: ulEl.getBoundingClientRect().left + ulEl.clientLeft, top: ulEl.getBoundingClientRect().top + ulEl.clientTop };
                const lis = [...document.querySelectorAll('ul > li')];
                const r = (s) => document.querySelector(`[data-lg="${s}"]`).getBoundingClientRect();
                const title = document.querySelector('[data-lg="t0"]').parentElement;
                return {
                    size: parseFloat(getComputedStyle(title).fontSize),
                    weight: getComputedStyle(title).fontWeight,
                    inset: Math.round(lis[1].getBoundingClientRect().left - ul.left),
                    line: getComputedStyle(lis[0]).borderBottomWidth,
                    textAt: Math.round(r('e1').left - lis[1].getBoundingClientRect().left),
                    top: Math.round(document.querySelector('[data-lg="e0"]').parentElement.getBoundingClientRect().top - ul.top),
                    aUnder: r('a0').top >= r('t0').bottom,
                    gap: Math.round(r('a0').top - document.querySelector('[data-lg="t0"]').closest('.flex-col').getBoundingClientRect().bottom),
                    centred: Math.abs((r('a1').top + r('a1').bottom) / 2 - (r('e1').top + r('t1').bottom) / 2),
                };
            });
            const pad = width < 768 ? 24 : 32;
            check(lgm.size === 18 && lgm.weight === '400', `[${width}] ListRow lg: the title is ${lgm.size}px at ${lgm.weight}, not 18px regular`);
            check(lgm.inset === pad && lgm.line === '1px' && lgm.textAt === 0 && Math.abs(lgm.top - pad) <= 1, `[${width}] ListRow lg: hairlines inset ${lgm.inset}px (want ${pad}), text ${lgm.textAt}px from them, first row ${lgm.top}px down`);
            if (width < 640) check(lgm.aUnder && lgm.gap >= 16, `[${width}] ListRow lg: the action is not under the text with room (${JSON.stringify(lgm)})`);
            else check(!lgm.aUnder && lgm.centred <= 2, `[${width}] ListRow lg: the action is not beside the text, centred on it (${JSON.stringify(lgm)})`);
            // Card flush: the list spans the card, its rows lined up with the card's text; last, it takes the card's foot.
            await p.goto(flushCards);
            const fl = await p.evaluate(() => {
                const card = (k) => document.querySelector(`[data-f="${k}"]`);
                const mid = card('mid').getBoundingClientRect();
                const list = card('mid').querySelector('ul');
                const lr = list.getBoundingClientRect();
                const head = card('head').getBoundingClientRect();
                const row = card('mid').querySelector('[data-f="row"]').getBoundingClientRect();
                const end = card('end').getBoundingClientRect();
                const endList = card('end').querySelector('ul').getBoundingClientRect();
                return {
                    edges: [Math.round(lr.left - mid.left), Math.round(mid.right - lr.right)],
                    sides: getComputedStyle(list).borderLeftWidth,
                    rowAt: Math.round(row.left - head.left),
                    foot: Math.round(end.bottom - endList.bottom),
                };
            });
            check(fl.edges[0] === 1 && fl.edges[1] === 1 && fl.sides === '0px', `[${width}] Card flush: the list sits ${fl.edges.join('/')}px inside the card's edges with ${fl.sides} side borders, a card in a card`);
            check(fl.rowAt === 0 && fl.foot === 1, `[${width}] Card flush: rows start ${fl.rowAt}px off the card's text, and a last list stops ${fl.foot}px above its foot`);
            // Long identifiers in headings break; links are 24px to a finger in prose, a list and a table cell.
            await p.goto(sdk);
            const sd = await p.evaluate(() => ({
                over: document.documentElement.scrollWidth - innerWidth,
                wide: [...document.querySelectorAll('[data-sdk] h1, [data-sdk] h2, [data-sdk] h3')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.tagName + ' ' + x.scrollWidth + '/' + x.clientWidth),
                links: Object.fromEntries([...document.querySelectorAll('[data-sdk] a[href]:not([href^="#"])')].map((a, i) => [a.textContent + i, Math.round(a.getBoundingClientRect().height)])),
            }));
            check(sd.over <= 0 && sd.wide.length === 0, `[${width}] docs headings: a long identifier widens the page by ${sd.over}px (${sd.wide.join(', ')})`);
            check(Object.values(sd.links).length >= 3 && Object.values(sd.links).every((x) => x >= 24), `[${width}] TextLink: a link is shorter than 24px to press (${JSON.stringify(sd.links)})`);
            // A heading's "#" anchor and the breadcrumbs: 24px to press too, the anchor's line unchanged.
            const tg = await p.evaluate(() => {
                const anchors = [...document.querySelectorAll('[data-sdk] h2 a[href^="#"], [data-sdk] h3 a[href^="#"]')].map((a) => {
                    a.scrollIntoView({ block: 'center' });
                    const r = a.getBoundingClientRect();
                    const cx = r.left + r.width / 2;
                    const cy = r.top + r.height / 2;
                    const lands = (y) => a.contains(document.elementFromPoint(cx, y));
                    return lands(cy - 11.5) && lands(cy + 11.5);
                });
                const crumbs = [...document.querySelectorAll('[data-sdk] nav[aria-label="Breadcrumb"] a')].map((a) => Math.round(a.getBoundingClientRect().height));
                return { anchors, crumbs };
            });
            check(tg.anchors.length >= 2 && tg.anchors.every(Boolean), `[${width}] a docs heading's "#" anchor is not 24px to press (${JSON.stringify(tg.anchors)})`);
            check(tg.crumbs.length === 2 && tg.crumbs.every((x) => x >= 24), `[${width}] Breadcrumbs: a link is ${JSON.stringify(tg.crumbs)}px tall, under 24`);
            // The fallback faces set text at Inter's widths, so the swap does not move a line: docs prose
            // reflowed at 17px (CLS 0.1), and a code token ran a third wider. Each stack against itself without Inter.
            if (width >= 1024) {
                const fb = await p.evaluate(async ([prose, headline, code]) => {
                    const root = getComputedStyle(document.documentElement);
                    const stack = (name) => root.getPropertyValue(name).trim();
                    const probe = (font, family, text) => {
                        const s = document.createElement('span');
                        s.style.cssText = `font: ${font} ${family}; line-height: normal; white-space: nowrap; position: absolute`;
                        s.textContent = text;
                        document.body.append(s);
                        const r = s.getBoundingClientRect();
                        s.remove();
                        return { w: r.width, h: r.height };
                    };
                    const cases = [
                        ...['400 15px', '400 16px', '400 17px', '500 16px', '600 16px', '700 16px'].map((font) => [font, '--oc-font-sans', prose, 0.01]),
                        ...['400 32px', '400 48px', '400 76px'].map((font) => [font, '--oc-font-display', headline, 0.01]),
                        ['400 14px', '--oc-font-mono', code, 0.005],
                    ].map(([font, name, text, tol]) => {
                        const full = stack(name);
                        return { font, name, text, tol, full, without: full.slice(full.indexOf(',') + 1).trim() };
                    });
                    await Promise.all(cases.flatMap((c) => [document.fonts.load(`${c.font} ${c.full}`, c.text), document.fonts.load(`${c.font} ${c.without}`, c.text)]));
                    const mono = probe('400 16px', 'monospace', prose).w;
                    // Does this machine have Arial or one of its metric twins at all?
                    const twin = ['Arial', "'Liberation Sans'", 'Arimo'].some((f) => Math.abs(probe('400 16px', `${f}, monospace`, prose).w - mono) >= 0.5);
                    return {
                        twin,
                        cases: cases.map((c) => {
                            const a = probe(c.font, c.full, c.text);
                            const b = probe(c.font, c.without, c.text);
                            return { font: c.font, name: c.name, tol: c.tol, off: b.w / a.w - 1, dh: b.h - a.h, fallback: c.without.split(',')[0] };
                        }),
                    };
                }, [FALLBACK_PROSE, FALLBACK_HEADLINE, FALLBACK_CODE]);
                if (!fb.twin) console.log(`  · layout: no Arial or metric twin on this machine; the fallback faces' widths are not measured here`);
                else
                    for (const c of fb.cases)
                        check(
                            Math.abs(c.off) <= c.tol && Math.abs(c.dh) <= 1,
                            `[${width}] ${c.name} at ${c.font}: ${c.fallback} sets text ${(c.off * 100).toFixed(2)}% off the webfont's width (within ${c.tol * 100}%), its line ${c.dh.toFixed(1)}px off: the swap moves the line`
                        );
            }
            // SignInFrame holds still while its ceremony mounts: the title stays put and the ink column's art does not re-centre.
            await p.goto(signinGrow);
            const place = () =>
                p.evaluate(() => {
                    const aside = document.querySelector('main > aside');
                    const art = aside?.firstElementChild?.getBoundingClientRect();
                    return { title: document.querySelector('#signin h1').getBoundingClientRect().top, art: art && art.height ? art.top + art.height / 2 : null, aside: aside?.getBoundingClientRect().height ?? 0 };
                });
            const before = await place();
            await p.evaluate(() => (document.querySelector('[data-ceremony]').style.height = '1400px'));
            const after = await place();
            check(Math.abs(after.title - before.title) < 1, `[${width}] SignInFrame: the title moved ${Math.round(after.title - before.title)}px as the ceremony grew`);
            if (width >= 1024)
                check(
                    before.art !== null && Math.abs(after.art - before.art) < 1 && after.aside <= height + 0.5,
                    `[${width}] SignInFrame: the art moved ${Math.round((after.art ?? 0) - (before.art ?? 0))}px and the ink column is ${Math.round(after.aside)}px tall in a ${height}px window`
                );
            // stackBelow="sm": on a phone a long-token title takes the row and the badge goes under it; from sm, as without it.
            await p.goto(stacked);
            const st = await p.evaluate(() => {
                const r = (k) => document.querySelector(`[data-st="${k}"]`).getBoundingClientRect();
                const title = document.querySelector('[data-st="title"]');
                const lh = parseFloat(getComputedStyle(title.parentElement).lineHeight) || 22.5;
                const col = title.closest('.flex-col').getBoundingClientRect();
                const row = title.closest('li').getBoundingClientRect();
                return {
                    lines: Math.round(r('title').height / lh),
                    colW: Math.round(col.width),
                    rowW: Math.round(row.width - 40),
                    under: r('badge').top >= r('title').bottom,
                    aligned: Math.abs(r('badge').left - col.left) <= 1,
                    same: Math.abs(r('title').width - r('title-plain').width) <= 1 && Math.abs(r('badge').top - r('title').top - (r('badge-plain').top - r('title-plain').top)) <= 1,
                };
            });
            if (width < 640) check(st.lines <= 2 && st.colW >= st.rowW - 1 && st.under && st.aligned, `[${width}] ListRow stackBelow="sm": the long title keeps ${st.colW}px of ${st.rowW} and wraps to ${st.lines} lines, the badge ${st.under ? 'under' : 'beside'} it`);
            else check(st.same && !st.under, `[${width}] ListRow stackBelow="sm": a desk's row changed (${JSON.stringify(st)})`);
            // A product's footer with seven groups still fits a phone, every link kept.
            await p.goto(productFooter);
            const pf = await p.evaluate(async () => {
                await document.fonts.ready;
                const f = document.querySelector('footer');
                return {
                    h: f.getBoundingClientRect().height,
                    groups: f.querySelectorAll('details').length,
                    links: f.querySelectorAll('details a').length,
                    deskLinks: f.querySelectorAll('[class~="md:flex"] a').length,
                    summaries: [...f.querySelectorAll('details summary')].filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect().height),
                    legal: [...f.querySelectorAll('[aria-label="Legal"] a')].map((a) => a.getBoundingClientRect().height),
                };
            });
            if (width < 768) {
                check(pf.groups === 7 && pf.h <= 600, `[${width}] a product footer with ${pf.groups} groups runs ${Math.round(pf.h)}px, past 600`);
                check(pf.links > 9 && pf.links === pf.deskLinks && pf.summaries.every((x) => x >= 44) && pf.legal.every((x) => x >= 44), `[${width}] the product footer lost a link (${pf.links}) or a 44px target`);
            }
            // SectionTitle: one button beside its title; three wrap under it, inside the column.
            if (width < 640) {
                await p.goto(titles);
                const st = await p.evaluate(() =>
                    Object.fromEntries(
                        [...document.querySelectorAll('[data-t]')].map((el) => {
                            const heading = el.querySelector('h2').getBoundingClientRect();
                            const action = el.firstElementChild.lastElementChild.getBoundingClientRect();
                            return [el.dataset.t, { beside: action.top < heading.bottom && action.left > heading.left, top: Math.round(action.top - heading.top), under: action.top >= heading.bottom, right: action.right <= innerWidth - 16 + 0.5 }];
                        })
                    )
                );
                check(st.one.beside && Math.abs(st.one.top) <= 6, `[${width}] SectionTitle: one button left its title's row (${JSON.stringify(st.one)})`);
                check(st.many.under && st.many.right, `[${width}] SectionTitle: three buttons crowd the title or run off the column (${JSON.stringify(st.many)})`);
            }
            // Every link a desk shows, a phone reaches through its groups.
            check(ft.groups > 0 && ft.phoneLinks.length > 0 && ft.phoneLinks.join() === ft.deskLinks.join(), `[${width}] the phone's groups hold ${ft.phoneLinks.length} links, the desk's columns ${ft.deskLinks.length}`);
            // 32px icon buttons: 44px to a thumb, unchanged to a mouse.
            {
                const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768 });
                const t = await ctx.newPage();
                await t.goto(icons);
                const reach = await t.evaluate(() =>
                    ['[data-t="icon-sm"]', '[data-t="sm"]', '[data-t="icon"]', 'button[aria-label="Copy passphrase"]', 'button[aria-label="Open full screen"]', 'button[aria-label^="Theme:"]'].map((sel) => {
                        const el = document.querySelector(sel);
                        const r = el.getBoundingClientRect();
                        const cx = r.left + r.width / 2;
                        const cy = r.top + r.height / 2;
                        const lands = (x, y) => el.contains(document.elementFromPoint(x, y));
                        // A wide button needs only the height; a square one both ways.
                        const wide = r.width > 44;
                        return { sel, size: Math.round(r.height), w: Math.round(r.width), reach: lands(cx, cy - 21.5) && lands(cx, cy + 21.5) && (wide || (lands(cx - 21.5, cy) && lands(cx + 21.5, cy))) };
                    })
                );
                const DRAWN = { '[data-t="sm"]': 36, '[data-t="icon"]': 40, 'button[aria-label^="Theme:"]': 40 };
                for (const r of reach) {
                    const drawn = DRAWN[r.sel] ?? 32;
                    if (width < 768) check(r.reach && r.size === drawn, `[${width} touch] ${r.sel}: drawn ${r.w}×${r.size}px, 44px target ${r.reach}`);
                    else check(!r.reach && r.size === drawn, `[${width} mouse] ${r.sel}: drawn ${r.size}px, or the target grew past the button (${r.reach})`);
                }
                // A field has no box beyond its own: a small one is drawn 44px tall to a thumb, 36px to a mouse.
                await t.goto(fields);
                const fh = await t.$$eval('[data-f]', (els) => Object.fromEntries(els.map((el) => [el.dataset.f, el.getBoundingClientRect().height])));
                for (const [k, hgt] of Object.entries(fh)) {
                    const want = width < 768 || k === 'md' ? 44 : 36;
                    check(Math.abs(hgt - want) < 0.5, `[${width} ${width < 768 ? 'touch' : 'mouse'}] a ${k} field is ${Math.round(hgt)}px tall, not ${want}`);
                }
                check(Object.keys(fh).length === 4, `[${width}] the fields page drew ${Object.keys(fh).join(', ')}`);
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
                    footTop: document.querySelector('footer')?.getBoundingClientRect().top,
                }));
                if (box.footTop !== undefined) check(box.footTop >= height - 0.5, `[${width}] ${name}: the footer starts at ${Math.round(box.footTop)}px, inside a ${height}px window`);
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
                    const row = li.firstElementChild.getBoundingClientRect();
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
