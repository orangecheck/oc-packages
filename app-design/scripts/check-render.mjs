#!/usr/bin/env node
/*
 * The docs and tool components, rendered from the build to markup, doing
 * what they promise: code arrives highlighted in the server's HTML, the
 * tool shell holds the tools and the protocol's links, density reaches the
 * fields, the account control holds its place while it checks. Run after
 * `yarn build`.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
for (const f of ['components', 'chrome', 'primitives', 'mdx']) {
    if (!existsSync(join(here, `../dist/${f}.js`))) {
        console.error(`✗ render: dist/${f}.js is missing; run yarn build first`);
        process.exit(1);
    }
}
const { createElement: h } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { CheckCircle, Plus, Terminal } = require('lucide-react');
const C = require(join(here, '../dist/components.js'));
const Ch = require(join(here, '../dist/chrome.js'));
const P = require(join(here, '../dist/primitives.js'));
const { mdxComponents } = require(join(here, '../dist/mdx.js'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ render: ${msg}`);
        failures++;
    }
};
const html = (el) => renderToStaticMarkup(el);

// 2.0 is square: every rounded- class in the source is square (rounded-none), a depiction's
// (rounded-depict), a tile's (rounded-tile) or its parent's (rounded-[inherit]). Round by meaning
// only: a dot (rounded-full on a size-* box or the inset-0 halo filling one, with no padding), and
// in the brand art, an app's monogram, an avatar, a depicted device, and the made-up app the sign-in
// demo draws inside its window (a product keeps its own corners; it has a file of its own, so the
// demo's step list, Try again and cursor are still held square). The stylesheets' own
// border-radius is a radius token or nothing.
{
    const { readdirSync, readFileSync, statSync } = require('node:fs');
    const src = join(here, '../src');
    const walk = (d, ext) =>
        readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f), ext) : ext.test(f) && !/\.(stories|test)\.tsx?$/.test(f) ? [join(d, f)] : []));
    const ROUND_BY_MEANING = /(brand\/(sphere|iso-check)|components\/(monogram|avatar|frames)|blocks\/sign-in-demo-app)\.tsx$/;
    const ALLOWED = /^(none|depict|tile|\[inherit\])$/;
    const rounded = [];
    for (const f of walk(src, /\.tsx?$/)) {
        // ./vitest is a site's test helper: it names radius classes to find them, and draws none.
        if (ROUND_BY_MEANING.test(f) || /[\\/]vitest[\\/]/.test(f)) continue;
        readFileSync(f, 'utf8')
            .split('\n')
            .forEach((line, i) => {
                if (/^\s*(\/\/|\/?\*)/.test(line)) return;
                for (const m of line.matchAll(/(?<![\w-])rounded(?:-(?:tl|tr|br|bl|ss|se|es|ee|t|r|b|l|s|e))?(?:-([a-z0-9]+|\[[^\]\s'"`]+\]))?(?![\w-])/g)) {
                    const value = m[1] ?? '';
                    if (ALLOWED.test(value)) continue;
                    // A dot is judged on its own class string, the quoted string the match sits in, not the line.
                    const open = Math.max(...['"', "'", '`'].map((q) => line.lastIndexOf(q, m.index)));
                    const close = open < 0 ? -1 : line.indexOf(line[open], m.index);
                    const classes = open < 0 || close < 0 ? line : line.slice(open + 1, close);
                    const dot = m[0] === 'rounded-full' && /(?<![\w-])(size-|inset-0(?![\w-]))/.test(classes) && !/(?<![\w-])p[xytrblse]?-/.test(classes);
                    if (!dot) rounded.push(`${f.slice(src.length + 1)}:${i + 1} ${m[0]}`);
                }
            });
    }
    for (const f of walk(join(src, 'styles'), /\.css$/)) {
        readFileSync(f, 'utf8')
            .split('\n')
            .forEach((line, i) => {
                const r = line.match(/border(?:-[a-z]+)*-radius:\s*([^;]+);/);
                if (r && !/^(0|inherit|var\(--(radius|oca-radius)[a-z0-9-]*\))$/.test(r[1].trim())) rounded.push(`${f.slice(src.length + 1)}:${i + 1} border-radius: ${r[1].trim()}`);
            });
    }
    check(rounded.length === 0, `2.0 is square, but these are rounded: ${rounded.join(', ')}`);
    check(/rounded-depict/.test(readFileSync(join(src, 'components/frames.tsx'), 'utf8')), 'BrowserFrame is not on the depiction radius');

    // No text under 12px: a size in rem or px is 0.75rem (12px) or more, and one in em, which follows a
    // smaller parent down (0.875em of a 13px table head was 11.375px), is floored: max(…em, 0.75rem).
    const small = [];
    const tooSmall = (v) => {
        const n = parseFloat(v);
        if (/^[\d.]+rem$/.test(v)) return n < 0.75;
        if (/^[\d.]+px$/.test(v)) return n < 12;
        if (/^[\d.]+em$/.test(v)) return n < 1;
        return false;
    };
    for (const f of walk(src, /\.tsx?$/)) {
        readFileSync(f, 'utf8')
            .split('\n')
            .forEach((line, i) => {
                for (const m of line.matchAll(/(?<![\w-])text-\[([\d.]+(?:rem|px|em))\]/g)) if (tooSmall(m[1])) small.push(`${f.slice(src.length + 1)}:${i + 1} text-[${m[1]}]`);
            });
    }
    for (const f of walk(join(src, 'styles'), /\.css$/)) {
        readFileSync(f, 'utf8')
            .split('\n')
            .forEach((line, i) => {
                const m = line.match(/(?<![\w-])font-size:\s*([\d.]+(?:rem|px|em))\s*;/);
                if (m && tooSmall(m[1])) small.push(`${f.slice(src.length + 1)}:${i + 1} font-size: ${m[1]}`);
            });
    }
    check(small.length === 0, `text under 12px in the source: ${small.join(', ')}`);

    // One label: a class string set uppercase and tracked 0.08em is oca-label (or oca-eyebrow), with any
    // override after it, never the label's type set by hand.
    const handLabels = [];
    for (const f of walk(src, /\.tsx?$/)) {
        readFileSync(f, 'utf8')
            .split('\n')
            .forEach((line, i) => {
                if (/^\s*(\/\/|\/?\*)/.test(line)) return;
                for (const m of line.matchAll(/(["'`])([^"'`]*?)\1/g)) {
                    const cls = m[2];
                    if (/(?<![\w-])uppercase(?![\w-])/.test(cls) && /(?<![\w-])tracking-\[0?\.08em\]/.test(cls) && !/(?<![\w-])oca-(label|eyebrow)(?![\w-])/.test(cls)) handLabels.push(`${f.slice(src.length + 1)}:${i + 1}`);
                }
            });
    }
    check(handLabels.length === 0, `a label set by hand, not oca-label: ${handLabels.join(', ')}`);
}

// One lockup in all chrome: the swoosh and the wordmark (Mark, viewBox 0 0 16 8), never the square
// app icon (AppIcon, its 24-unit tile with rounded corners), which stays the favicon, app icon and OG mark.
{
    const nav = [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }] }];
    const chrome = {
        'SiteHeader': h(Ch.SiteHeader, { nav: [{ href: '/how', label: 'How it works' }] }),
        'SiteHeader (tool)': h(Ch.SiteHeader, { variant: 'tool', product: 'stamp', nav: [] }),
        'ToolShell': h(Ch.ToolShell, { protocol: 'stamp', tools: [] }, h('p', null, 'page')),
        'SiteFooter': h(Ch.SiteFooter, { family: true, legal: true }),
        'SiteFooter compact': h(Ch.SiteFooter, { compact: true, family: true, legal: true }),
        'SignInFrame': h(Ch.SignInFrame, { title: 'Sign in', protocol: 'stamp' }, h('p', null, 'form')),
        'AppShell': h(Ch.AppShell, { product: 'vault', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }] }, h('p', null, 'page')),
        'AppShell rail': h(Ch.AppShell, { variant: 'rail', product: 'vault', nav: [{ items: [{ href: '/a', label: 'Entries', active: true }] }] }, h('p', null, 'page')),
        'DocsShell': h(Ch.DocsShell, { nav, current: '/docs' }, h('p', null, 'page')),
    };
    const icon = /<svg[^>]*viewBox="0 0 24 24"[^>]*>(?:<title>[^<]*<\/title>)?<rect width="24" height="24" rx="/;
    const iconIn = Object.entries(chrome)
        .map(([name, el]) => [name, html(el)])
        // The rail (the messenger's frame) draws no lockup of its own; the rest each draw one.
        .filter(([name, out]) => icon.test(out) || (name !== 'AppShell rail' && !/viewBox="0 0 16 8"/.test(out)))
        .map(([name]) => name);
    check(iconIn.length === 0, `chrome draws the square app icon, or no swoosh lockup: ${iconIn.join(', ')}`);
}

// Under a tool's compact density a default Button is `sm`, the height of the field beside it; an explicit size stays.
{
    const compact = (el) => html(h(P.DensityProvider, { density: 'compact' }, el));
    check(/\bh-9\b/.test(compact(h(P.Button, null, 'Open'))), 'Button: under compact density a default button is not sm (36px), so it stands taller than its field');
    check(/\bh-11\b/.test(compact(h(P.Button, { size: 'md' }, 'Open'))), 'Button: an explicit size is overridden by density');
    check(/\bh-11\b/.test(html(h(P.Button, null, 'Open'))), 'Button: the default size changed outside compact density');
}
// Button's trailing "+" survives asChild: the link it renders carries the "+" after its text.
{
    const link = html(h(P.Button, { asChild: true, plus: true }, h('a', { href: '/start' }, 'Get started')));
    check(/^<a [^>]*href="\/start"[^>]*>Get started<span[^>]*data-oca-plus=""/.test(link), `Button asChild plus: the "+" is dropped or the link is not the root: ${link.slice(0, 160)}`);
    check(!/data-oca-plus/.test(html(h(P.Button, { asChild: true }, h('a', { href: '/start' }, 'Get started')))), 'Button asChild: a "+" appears without plus');
}

// CodeBlock: highlighted on the server, marks and diff drawn, the sign not in the text.
{
    const out = html(h(C.CodeBlock, { code: 'const a = 1;\nverify(a);', lang: 'ts', highlight: '2' }));
    check(out.includes('class="oca-k">const<'), 'CodeBlock: code is not highlighted in the server markup');
    check(/data-mark="">[^\n]*verify/.test(out) && !/data-mark="">const/.test(out), 'CodeBlock: the wrong line is marked');
    check(out.includes('>TypeScript<'), 'CodeBlock: the caption does not default to the language');
    check(/<span class="oca-label[^"]*text-oca-ink-subtle[^"]*">TypeScript<\/span>/.test(out), 'CodeBlock: the caption is not oca-label, in the code surface\'s ink');
    const diff = html(h(C.CodeBlock, { code: '-old();\n+next();', lang: 'ts', diff: true }));
    check(diff.includes('data-diff="remove"') && diff.includes('data-diff="add"'), 'CodeBlock: diff lines are not marked');
    check(!diff.includes('>+') && !diff.includes('>-old'), 'CodeBlock: the diff sign is in the text');
    const pre = html(h(mdxComponents.pre, { 'data-oca-code': '', 'data-html': '<span data-line="">x</span>', 'data-lang': 'json', 'data-title': 'stamp.json' }));
    check(pre.includes('stamp.json') && pre.includes('<span data-line="">x</span>'), 'mdx pre: build-time markup is not used');
    const fence = html(h(mdxComponents.pre, null, h('code', { className: 'language-bash' }, 'npm install x\n')));
    check(fence.includes('class="oca-f">npm<'), 'mdx pre: an unprocessed fence is not highlighted at render');
}

// CodeTabs: one well, a tab per version, the first shown.
{
    const out = html(h(C.InstallTabs, { pkg: '@orangecheck/stamp-core' }));
    check((out.match(/role="tab"/g) ?? []).length === 3, 'InstallTabs: not three tabs');
    check(out.includes('npm') && out.includes('aria-selected="true"'), 'InstallTabs: no tab is selected');
}

// SearchButton: its name is its visible word.
{
    const search = html(h(C.SearchButton, {}));
    check(!search.includes('aria-label=') && /class="sr-only[^"]*">Search</.test(search), 'SearchButton: its name is not its visible word');
}

// SearchButton says what it is to a test or a census (data-ui), as the dialog's input says "search".
{
    const search = html(h(C.SearchButton, {}));
    check(/^<button[^>]* data-ui="search-button"/.test(search), `SearchButton: no data-ui="search-button" on its button: ${search.slice(0, 120)}`);
}

// Docs: the current page marked, other sections folded, the header marks Docs.
{
    const nav = [
        { label: 'Getting started', items: [{ href: '/', label: 'Overview' }] },
        { label: 'OC Stamp', items: [{ href: '/stamp', label: 'Overview' }, { href: '/stamp/verify', label: 'Verify', badge: 'testing' }] },
    ];
    const out = html(h(Ch.DocsNav, { sections: nav, current: '/stamp/verify/' }));
    check(/aria-current="page"[^>]*>.*Verify/.test(out), 'DocsNav: the current page is not marked');
    check(out.includes('In testing'), 'DocsNav: a status badge is not shown in the words');
    check((out.match(/hidden=""/g) ?? []).length === 1, 'DocsNav: the other section is not folded');
    const shell = html(h(Ch.DocsShell, { nav, current: '/stamp' }, h('p', null, 'page')));
    check(/href="https:\/\/ochk.io\/docs"[^>]*aria-current="page"|aria-current="page"[^>]*href="https:\/\/ochk.io\/docs"/.test(shell), 'DocsShell: the header does not mark Docs');
    check(shell.includes('id="docs-content"') && shell.includes('id="main-content"'), 'DocsShell: the page has no content landmark');
    // ochk.io/docs draws ochk.io's header: Sign in and the account CTA, as SiteHeader takes them.
    {
        const signedOut = html(h(Ch.DocsShell, { nav, current: '/stamp', signIn: true, cta: true }, h('p', null, 'page')));
        const header = signedOut.slice(0, signedOut.indexOf('</header>'));
        check(/>Sign in</.test(header) && /data-oca-cta/.test(header), 'DocsShell: signIn and cta do not reach its header');
    }
}

// ToolShell: the protocol's word and page, tools in a tab bar on a phone, compact fields, the footer.
{
    const tools = [
        { href: '/create', label: 'Create', icon: h(Plus), active: true },
        { href: '/verify', label: 'Verify', icon: h(CheckCircle) },
        { href: '/playground', label: 'Playground', icon: h(Terminal) },
    ];
    const out = html(h(Ch.ToolShell, { protocol: 'stamp', tools }, h(P.Input, { 'aria-label': 'Hash' })));
    check(out.includes('>stamp<'), 'ToolShell: the protocol word is missing');
    // The lockup goes to the protocol's page: a tool site's own / sends people off-site.
    const home = (o) => o.match(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*<span class="sr-only"> home<\/span>/)?.[1];
    check(home(out) === 'https://ochk.io/stamp', `ToolShell: home is ${home(out)}, not the protocol's page`);
    check(home(html(h(Ch.ToolShell, { protocol: 'stamp', tools, home: '/dashboard' }, null))) === '/dashboard', 'ToolShell: home cannot be overridden');
    check(out.includes('href="https://ochk.io/stamp"') && out.includes('About stamp'), 'ToolShell: no way to the protocol page');
    check(out.includes('data-oca-tabbar'), 'ToolShell: three tools with icons get no tab bar');
    check(out.includes('data-size="sm"'), 'ToolShell: fields are not compact inside it');
    check(out.includes('aria-label="Legal"'), 'ToolShell: the footer has no legal row');
    const app = html(h(Ch.ToolShell, { protocol: 'lock', tools, variant: 'app' }, h('p', null, 'inbox')));
    check(!app.includes('<footer') && !app.includes('data-oca-tabbar'), 'ToolShell app: a footer or tab bar is drawn');
    check(html(h(P.Input, { 'aria-label': 'x' })).includes('data-size="md"'), 'Input: default size is not md outside a tool');
}

// Docs, 1.4: an anchor per row, empty columns left out, the source column named once.
{
    const rows = [
        { name: 'hash', id: 'property-hash', type: 'string', description: 'SHA-256 of the file.', source: h('a', { href: 'https://github.com/x/types.ts#L4' }, 'types.ts:4') },
        { name: 'length', id: 'property-length', type: 'number', source: h('a', { href: 'https://github.com/x/types.ts#L6' }, 'types.ts:6') },
    ];
    const out = html(h(C.ApiTable, { rows }));
    check((out.match(/id="property-hash"/g) ?? []).length === 1 && /<tr[^>]*id="property-hash"/.test(out), 'ApiTable: a row id is not one anchor on its row');
    check((out.match(/>Defined in</g) ?? []).length === 1 && out.includes('types.ts:6'), 'ApiTable: the source column is not named once');
    const bare = html(h(C.ApiTable, { rows: [{ name: 'a', type: 'string' }] }));
    check(!bare.includes('>Description<') && !bare.includes('>Defined in<'), 'ApiTable: an empty column is drawn');
    check(out.includes('>Description<'), 'ApiTable: a description column is dropped');
}

// SpecCard for one file in any spec repo: the normative copy, named.
{
    const out = html(h(C.SpecCard, { repo: 'oc-chat-protocol', kind: 'security', version: 'v1' }));
    check(out.includes('href="https://github.com/orangecheck/oc-chat-protocol/blob/main/SECURITY.md"') && out.includes('Normative threat model · v1'), 'SpecCard repo: the file is not named');
    check(html(h(C.SpecCard, { protocol: 'stamp', version: '1.0.0' })).includes('oc-stamp-protocol'), 'SpecCard protocol: broken');
}

// Inside the docs, a docs link is a page of this site; elsewhere, ochk.io/docs.
{
    const inDocs = html(h(Ch.DocsShell, { nav: [], current: '/' }, h(C.ProtocolGrid, { link: 'docs', protocols: ['attest'] })));
    check(inDocs.includes('href="/attest"'), 'ProtocolGrid in DocsShell: docs links do not go through the router');
    check(html(h(C.ProtocolGrid, { link: 'docs', protocols: ['attest'] })).includes('href="https://ochk.io/docs/attest"'), 'ProtocolGrid: docs link outside the docs is not absolute');
}

// DocsShell marks the nav item it is given, not only the page.
{
    const nav = [
        { label: 'Start', items: [{ href: '/', label: 'Overview' }] },
        { label: 'SDKs', items: [{ href: '/sdk', label: 'All' }, { href: '/sdk/stamp-core', label: 'stamp-core' }] },
    ];
    const out = html(h(Ch.DocsShell, { nav, current: '/sdk/stamp-core/interfaces/Stamp', navCurrent: '/sdk/stamp-core' }, h('p', null, 'x')));
    check(/aria-current="page"[^>]*>(?:(?!<\/a>)[\s\S])*stamp-core/.test(out), 'DocsShell navCurrent: the SDK item is not marked');
}

// ochk.io's footer, one export: fine print, OpenSats, the theme, legal.
{
    const out = html(h(Ch.OchkIoFooter, {}));
    check(out.includes('Open protocols on Bitcoin.') && out.includes('supported by OpenSats.') && out.includes('aria-label="Theme: ') && out.includes('aria-label="Legal"'), 'OchkIoFooter: a part is missing');
}

// AppShell carries the family menu beside the lockup when asked.
{
    const sections = [{ id: 'you', label: 'You', href: '/me', groups: [{ items: [{ href: '/me', label: 'Home', active: true }] }] }];
    check(html(h(Ch.AppShell, { sections, family: 'me' }, null)).includes('aria-label="All orangecheck sites"'), 'AppShell: no family menu');
    check(!html(h(Ch.AppShell, { sections }, null)).includes('aria-label="All orangecheck sites"'), 'AppShell: a family menu nobody asked for');
}

// What sites kept local copies of (1.9.0).
{
    const sections = [{ id: 'you', label: 'You', href: '/me', groups: [{ items: [{ href: '/me', label: 'Home', active: true }] }] }];
    check((html(h(Ch.AppShell, { sections, product: 'vault' }, null)).match(/h-5 w-px[^>]*><\/span><span[^>]*>vault<\/span>/g) ?? []).length === 2, 'AppShell: the product word is not beside both lockups');
    // Tabs: a list that wraps rather than scrolls; a panel that stays mounted, hidden.
    const tabs = (listProps, contentProps) =>
        html(
            h(P.Tabs, { defaultValue: 'a' }, h(P.TabsList, listProps, h(P.TabsTrigger, { value: 'a' }, 'A'), h(P.TabsTrigger, { value: 'b' }, 'B')),
                h(P.TabsContent, { value: 'a' }, 'first'), h(P.TabsContent, { value: 'b', ...contentProps }, h('canvas', { 'data-kept': '' })))
        );
    const wrapped = tabs({ wrap: true }, {});
    check(/role="tablist"[^>]*class="[^"]*flex-wrap/.test(wrapped) && !wrapped.includes('overflow-x-auto'), 'TabsList wrap: the list scrolls rather than wraps');
    check(tabs({}, {}).includes('overflow-x-auto'), 'TabsList: the default stopped scrolling');
    const kept = tabs({}, { keepMounted: true });
    check(/data-state="inactive"[^>]*class="[^"]*data-\[state=inactive\]:hidden[^"]*"[^>]*><canvas data-kept="">/.test(kept) || /class="[^"]*data-\[state=inactive\]:hidden[^"]*"[^>]*data-state="inactive"[^>]*><canvas data-kept="">/.test(kept), 'TabsContent keepMounted: the inactive panel is not mounted and hidden');
    check(!tabs({}, {}).includes('data-kept'), 'TabsContent: an inactive panel mounted without keepMounted');
    // DataTable: a row that opens a page is one link, its target stretched over the row.
    const cols = [{ key: 'name', header: 'Name', cell: (r) => r.name, primary: true }, { key: 'id', header: 'Id', cell: (r) => h('button', { type: 'button' }, r.id) }];
    const linked = html(h(C.DataTable, { columns: cols, rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id, rowHref: (r) => `/people/${r.id}` }));
    check(/<tr class="[^"]*relative[^"]*"><td[^>]*><a (?=[^>]*class="[^"]*after:absolute after:inset-0)(?=[^>]*href="\/people\/a1")[^>]*>Ada<\/a><\/td>/.test(linked), 'DataTable rowHref: the primary cell is not the row\'s link');
    check(/<td class="[^"]*\[&amp;_button\]:z-10[^"]*"><button/.test(linked), 'DataTable rowHref: a control in another cell would sit under the row link');
    check((linked.match(/href="\/people\/a1"/g) ?? []).length === 2, 'DataTable rowHref: the phone card has no link');
    check(/<button type="button"(?=[^>]*class="[^"]*after:inset-0)[^>]*>Ada<\/button>/.test(html(h(C.DataTable, { columns: cols, rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id, onRowSelect: () => {} }))), 'DataTable onRowSelect: no row button');
    check(!html(h(C.DataTable, { columns: cols, rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id })).includes('after:inset-0'), 'DataTable: a plain table grew row links');
    // A column that grows sits at the top of its row; the rest stay in the middle.
    const grows = html(h(C.DataTable, { columns: [cols[0], { ...cols[1], valign: 'top' }], rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id, phone: 'scroll' }));
    const tds = [...grows.matchAll(/<td[^>]*class="([^"]*)"/g)].map((m) => m[1].split(' '));
    check(tds.length === 2 && tds[0].includes('align-middle') && tds[1].includes('align-top') && !tds[1].includes('align-middle'), `DataTable valign: the cells' alignments are ${JSON.stringify(tds.map((t) => t.filter((x) => x.startsWith('align-'))))}`);
    // Its heads, in the table and the phone card, are the one label.
    check(/<th scope="col" class="oca-label[^"]*">Name<\/th>/.test(linked) && /<dt class="oca-label[^"]*">Id<\/dt>/.test(linked), 'DataTable: a column head or the phone card\'s term is not oca-label');
    // ComparisonTable: a last row of actions; Closing: small print.
    const cmp = html(h(C.ComparisonTable, { label: 'x', columns: [{ key: 'oc', label: 'OC Stamp', highlight: true, action: h('a', { href: '/stamp' }, 'Use OC Stamp') }, { key: 'pgp', label: 'PGP' }], rows: [{ label: 'Anchored', values: { oc: 'Yes', pgp: 'No' } }] }));
    check(cmp.includes('>Use OC Stamp</a>') && (cmp.match(/<li/g) ?? []).length === 3, 'ComparisonTable: no action row');
    check(html(h(C.Closing, { title: 't', fineprint: h('span', { 'data-fine': '' }, 'credit') })).includes('data-fine'), 'Closing: no fineprint');
    // Closing on a band: its tone reaches the section, which leaves the canvas; with none it stays there.
    check(/^<section class="(?=[^"]*\boca-band-brand\b)(?![^"]*\bbg-background\b)/.test(html(h(C.Closing, { tone: 'brand', title: 't', art: null }))), 'Closing tone="brand": its section is not on the brand band');
    check(/^<section class="[^"]*\bbg-background\b/.test(html(h(C.Closing, { title: 't', art: null }))), 'Closing with no tone: its section is not on the canvas');
    // Closing art="dither": on burnt unless told ink, isolated for the field under it; the field first in the band, a baked
    // PNG at its foot and its 2x in srcset, lazy, decoration; the check its baked still, lazy, in an aria-hidden cell with
    // no room under it on a phone. The server draws no live dither: no canvas, nothing from ./motion.
    {
        const out = html(h(C.Closing, { art: 'dither', title: 't', actions: h('a', { href: '/go' }, 'Go') }));
        check(/^<section class="(?=[^"]*\boca-band-burnt\b)(?=[^"]*\bisolate\b)/.test(out), 'Closing art="dither": its section is not on the burnt band, isolated');
        check(/^<section class="[^"]*\boca-band-ink\b/.test(html(h(C.Closing, { art: 'dither', tone: 'ink', title: 't' }))), 'Closing art="dither" tone="ink": its section is not on the ink band');
        const field = out.match(/<div data-oca-frame=""[^>]*>(<img [^>]*data-oca-field=""[^>]*>)<div class="grid /)?.[1] ?? '';
        check(
            /src="data:image\/png;base64,/.test(field) &&
                /srcSet="data:image\/png;base64,[^"]+ 2x"/.test(field) &&
                /alt=""/.test(field) &&
                /loading="lazy"/.test(field) &&
                /class="(?=[^"]*\babsolute\b)(?=[^"]*\bbottom-0\b)(?=[^"]*\bright-0\b)(?=[^"]*\s-z-10\b)/.test(field),
            `Closing art="dither": the field is not the band's first child, a lazy baked PNG at its foot under everything: ${field.slice(0, 120) || 'none'}`
        );
        const cell = out.match(/<div aria-hidden="true" data-oca-art="dither" class="([^"]*)"><span data-oca-still=""[^>]*><img ([^>]*)><\/span><\/div>/);
        check(cell && !/\bpb-|max-md:pb/.test(cell[1]) && /width="480" height="240"/.test(cell[2]) && /loading="lazy"/.test(cell[2]) && /srcSet="data:image\/png;base64,[^"]+ 2x"/.test(cell[2]), `Closing art="dither": the check is not its lazy baked still, 480 by 240 with its 2x, in an aria-hidden cell with no room under it: ${cell ? cell[0].slice(0, 160) : 'none'}`);
        check(!/<canvas|oca-dither/.test(out), 'Closing art="dither": the server drew the live dither');
        // Without it, none of this: no field, no isolate, the cell as it was.
        const plain = html(h(C.Closing, { title: 't' }));
        check(!/data-oca-field|data-oca-art|\bisolate\b/.test(plain) && /<div aria-hidden="true" class="flex justify-center max-md:pb-16 md:col-span-5">/.test(plain), 'Closing without art="dither" grew its field, isolate or a new art cell');
    }
    // Every block that draws a CTA pair draws it in HERO_ACTIONS, the row sites import for their own pairs: a block
    // with a row of its own, or one that drops or overrides a class of it, parts from the sites' rows.
    {
        const act = () => h('a', { href: '/go', 'data-act': '' }, 'Go');
        const rows = {
            PageHero: html(h(C.PageHero, { title: 't', actions: act() })),
            'PageHero layout="s10"': html(h(C.PageHero, { layout: 's10', title: 't', actions: act() })),
            'PageHero variant="document"': html(h(C.PageHero, { variant: 'document', title: 't', actions: act() })),
            DocHeader: html(h(C.DocHeader, { title: 't', actions: act() })),
            ErrorPage: html(h(C.ErrorPage, { code: 404, art: null, actions: act() })),
            Closing: html(h(C.Closing, { title: 't', art: null, actions: act() })),
        };
        const row = typeof C.HERO_ACTIONS === 'string' ? C.HERO_ACTIONS.split(' ') : [];
        check(row.length > 0, 'HERO_ACTIONS is not exported from ./components');
        for (const [name, out] of Object.entries(rows)) {
            const cls = out.match(/<div class="([^"]*)"><a href="\/go" data-act="">/)?.[1].split(' ');
            const missing = row.filter((c) => !cls?.includes(c));
            check(cls && missing.length === 0, `${name}: its actions are not drawn in HERO_ACTIONS (${cls ? `missing ${missing.join(' ')}` : 'no row around them'})`);
        }
    }
    // A product without a page of its own links ochk.io's, and keeps all five.
    const F = require(join(here, '../dist/family.js'));
    const vault = F.selfHostedLegalLinks({ contact: false });
    check(vault.length === 5 && vault.find((l) => l.label === 'Contact')?.href === 'https://ochk.io/contact' && vault.find((l) => l.label === 'Privacy')?.href === '/privacy', `selfHostedLegalLinks: ${JSON.stringify(vault.map((l) => l.href))}`);
    // HashChip in a compact line: smaller type, a 24px copy whose target stays 44.
    const chip = html(h(P.DensityProvider, { density: 'compact' }, h(C.HashChip, { value: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t' })));
    check(chip.includes('text-[0.8125rem]') && /class="[^"]*size-6[^"]*before:-inset-2\.5/.test(chip), 'HashChip: compact does not shrink to a line');
    // The credit lives in its own entry.
    const A = require(join(here, '../dist/acknowledgement.js'));
    check(/href="https:\/\/bramk\.substack\.com\/"/.test(html(h(A.Acknowledgement))), 'Acknowledgement: no link to the credit');
}

// Every titled part takes its heading level from the page: rendered with as="h2" (h3 where h2 is the
// default), its title comes back at that level. LockedPreview's title is a heading, h2 by default.
{
    const level = (out, text) => out.match(new RegExp(`<(h[1-6])\\b[^>]*>(?:<[^>]+>)*${text}`))?.[1] ?? null;
    const parts = [
        ['CardTitle', () => html(h(P.CardTitle, { as: 'h2' }, 'Plan')), 'Plan', 'h2'],
        ['PackageCard', () => html(h(C.PackageCard, { as: 'h2', items: [{ title: 'Verify', code: 'x' }] })), 'Verify', 'h2'],
        ['ProtocolGrid', () => html(h(C.ProtocolGrid, { as: 'h2', protocols: ['stamp'] })), 'stamp', 'h2'],
        ['AppCard', () => html(h(C.AppCard, { as: 'h2', name: 'Vault', line: 'x', href: '/' })), 'Vault', 'h2'],
        ['AppGrid', () => html(h(C.AppGrid, { as: 'h2', sites: ['vault'] })), 'vault', 'h2'],
        ['PlanCard', () => html(h(C.PlanCard, { as: 'h2', name: 'Annual', price: '1' })), 'Annual', 'h2'],
        ['LockedPreview', () => html(h(C.LockedPreview, { title: 'Your watchlist', action: 'x' })), 'Your watchlist', 'h2'],
        ['LockedPreview as', () => html(h(C.LockedPreview, { as: 'h3', title: 'Your watchlist', action: 'x' })), 'Your watchlist', 'h3'],
        ['EmptyState', () => html(h(C.EmptyState, { as: 'h2', title: 'No pledges yet' })), 'No pledges yet', 'h2'],
        ['Step', () => html(h(C.Steps, null, h(C.Step, { as: 'h2', title: 'Install' }))), 'Install', 'h2'],
        ['FactBlock', () => html(h(C.FactBlock, { as: 'h3', title: 'Reserves' })), 'Reserves', 'h3'],
        ['FactRows', () => html(h(C.FactRows, { as: 'h2', label: 'x', rows: [{ key: 'a', title: 'Fees', fields: [] }] })), 'Fees', 'h2'],
        ['Closing', () => html(h(C.Closing, { as: 'h3', title: 'Stamp a file', art: null })), 'Stamp a file', 'h3'],
        ['SpecCard', () => html(h(C.SpecCard, { as: 'h2', protocol: 'stamp', version: '1.0' })), 'oc-stamp-protocol', 'h2'],
        ['VerifyBox', () => html(h(C.VerifyBox, { as: 'h2', action: '/verify', title: 'Check a stamp' })), 'Check a stamp', 'h2'],
        ['Panel', () => html(h(C.Panel, { as: 'h2', title: 'Hash rate' }, h('p', null, 'x'))), 'Hash rate', 'h2'],
    ];
    for (const [name, render, text, want] of parts) {
        let got;
        try {
            got = level(render(), text);
        } catch (e) {
            got = `threw ${String(e.message).slice(0, 40)}`;
        }
        check(got === want, `${name}: the title came back as ${got}, not ${want}`);
    }
    // No titled part keeps a fixed level of its own: only a page's h1 is fixed (and the legal document's own outline).
    const { readdirSync, readFileSync } = require('node:fs');
    const FIXED_OK = new Set(['legal.tsx']);
    for (const dir of ['components', 'chrome', 'primitives']) {
        for (const f of readdirSync(join(here, '../src', dir)).filter((x) => x.endsWith('.tsx') && !x.includes('.stories.'))) {
            if (FIXED_OK.has(f)) continue;
            const fixed = readFileSync(join(here, '../src', dir, f), 'utf8').match(/<h[2-6][\s>]/g);
            check(!fixed, `${dir}/${f} draws a fixed heading level (${fixed?.join(' ')}); give it \`as\``);
        }
    }
}

// A tool site's way to its docs, and the docs' build-time contents still marking the section read.
{
    const tool = html(h(Ch.ToolShell, { protocol: 'stamp', tools: [{ href: '/create', label: 'Create' }] }, h('p', null, 'x')));
    check(/<nav aria-label="Main"[^>]*>(?:(?!<\/nav>)[\s\S])*href="https:\/\/ochk\.io\/docs\/stamp"[^>]*>Docs</.test(tool), 'ToolShell: no Docs link in the header');
    const toc = [{ id: 'install', label: 'Install', level: 2 }, { id: 'use', label: 'Use', level: 2 }];
    const docs = html(h(Ch.DocsShell, { nav: [], current: '/x', toc }, h('h2', { id: 'install' }, 'Install')));
    check(/aria-current="(?:true|location)"[^>]*>(?:<[^>]+>)*Install/.test(docs) || /href="#install"[^>]*aria-current/.test(docs), 'DocsShell: with a build-time toc no section is marked as the one being read');
}

// The MDX map: TypeDoc's h5 and h6, and GitHub task lists.
{
    check(html(h(mdxComponents.h5, null, 'Returns')).startsWith('<h5'), 'mdx: no h5');
    check(html(h(mdxComponents.h6, null, 'x')).startsWith('<h6'), 'mdx: no h6');
    const tasks = html(h(mdxComponents.ul, { className: 'contains-task-list' }, h(mdxComponents.li, { className: 'task-list-item' }, h(mdxComponents.input, { type: 'checkbox', checked: true, disabled: true }), 'Ship')));
    check(/<ul class="[^"]*list-none/.test(tasks) && tasks.includes('aria-label="Done"'), 'mdx: a task list keeps its bullets or its box has no name');
    // Outside a router a relative link is left as written.
    check(html(h(C.TextLink, { href: '../README' }, 'up')).includes('href="../README"'), 'TextLink: a relative href is changed without a router');
}

// An ErrorPage names a code only when it is given one.
{
    const eyebrow = (o) => o.match(/<p class="oca-eyebrow[^"]*">(.*?)<\/p>/)?.[1].replace(/<[^>]+>/g, '');
    check(eyebrow(html(h(C.ErrorPage, { code: 404 }))) === '404 · Not found', 'ErrorPage: a 404 does not say so');
    check(eyebrow(html(h(C.ErrorPage, { code: 403 }))) === '403 · Not available', 'ErrorPage: a 403 does not say so');
    check(eyebrow(html(h(C.ErrorPage, { code: 503 }))) === '503 · Error', 'ErrorPage: a 503 does not say so');
    const none = html(h(C.ErrorPage, { title: 'Not signed in to ochk.io', detail: 'There is nothing left to end here.' }));
    check(!none.includes('oca-eyebrow') && !/404|Not found|isn.t here/.test(none), 'ErrorPage: a page given no code claims one');
    check(none.includes('>Not signed in to ochk.io</h1>') && none.includes('There is nothing left to end here.'), 'ErrorPage: a page given no code loses its words');
}

// 1.4.1: home off a tool site's own /, phones, and the signing scheme in words.
{
    const href = (o) => o.match(/<a [^>]*href="([^"]*)"[^>]*>Go home</)?.[1];
    check(href(html(h(C.ErrorPage, { code: 404 }))) === 'https://ochk.io', 'ErrorPage: home is not ochk.io by default');
    check(href(html(h(C.ErrorPage, { code: 404, protocol: 'vote' }))) === 'https://ochk.io/vote', 'ErrorPage: protocol does not set home');
    const inShell = html(h(Ch.ToolShell, { protocol: 'lock', tools: [] }, h(C.ErrorPage, { code: 404 })));
    check(href(inShell) === 'https://ochk.io/lock', 'ErrorPage inside ToolShell: home is not the protocol page');
    const frame = html(h(Ch.SignInFrame, { protocol: 'attest' }, h('p', null, 'x')));
    check(/href="https:\/\/ochk.io\/attest"[^>]*>Back to home</.test(frame), 'SignInFrame: protocol does not set home');
    check(html(h(Ch.SignInFrame, {}, null)).includes('href="https://ochk.io"'), 'SignInFrame: home is not ochk.io by default');
    // On a phone the action takes its own row, so the hint keeps the width.
    const sec = html(h(C.FormSection, { n: 1, title: 'Who signs', hint: 'The address that holds the coins.', action: h('button', null, 'Edit') }, null));
    check(/<header class="[^"]*flex-wrap[^"]*">/.test(sec) && /<div class="[^"]*max-sm:basis-full[^"]*"><button>Edit/.test(sec), 'FormSection: the action does not stack under the hint on a phone');
    const chips = html(h(C.FilterChips, { label: 'Show', options: [{ value: 'a', label: 'Active' }], value: 'a', onChange: () => {} }));
    check(/role="group"[^>]*class="[^"]*flex-wrap/.test(chips) && !chips.includes('w-max'), 'FilterChips: chips scroll instead of wrapping');
    const id = '86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c';
    const sign = (scheme) => html(h(C.SignMessage, { address: 'bc1q', message: id, scheme, onSignature: () => {} }));
    check(/<pre [^>]*class="[^"]*break-all[^"]*"/.test(sign()), 'SignMessage: a 64-character id runs off a phone');
    check(sign().includes('(BIP-322)') && sign('legacy').includes('(legacy, BIP-137)') && !sign('legacy').includes('(BIP-322)'), 'SignMessage: the hint does not name the scheme');
    // Its own lead says what to do, so a wallet button's heading stays out of the slot.
    const slot = html(h(C.SignMessage, { address: 'bc1q', message: id, wallets: h('button', null, 'Sign with UniSat'), onSignature: () => {} }));
    check(/<div class="[^"]*\[--oc-wallet-heading:none\][^"]*"><button>Sign with UniSat/.test(slot), 'SignMessage: a wallet button in the slot keeps its own heading');
}

// 1.5: plan cards, a locked preview out of reach, a meter's verdict.
{
    const plan = html(h(C.PlanCard, { name: 'Annual', price: '210,000 sats', period: 'a year', badge: 'Recommended', highlight: true, features: ['Unlimited entries', 'Passkeys'], action: h('a', { href: '/pay' }, 'Pay with bitcoin') }));
    check(plan.includes('ring-foreground') && plan.includes('Recommended') && (plan.match(/<li/g) ?? []).length === 2 && plan.includes('href="/pay"'), 'PlanCard: a part is missing');
    const locked = html(h(C.LockedPreview, { title: 'Your watchlist', action: h('a', { href: '/signin' }, 'Sign in') }, h('a', { href: '/secret' }, 'a sample row')));
    check(/<div[^>]*inert=""[^>]*aria-hidden="true"[^>]*>[\s\S]*a sample row/.test(locked) && locked.includes('href="/signin"'), 'LockedPreview: the sample is reachable, or no way in');
    const strong = html(h(C.Meter, { value: 4, max: 4, label: 'Strength', figure: 'Very strong', tone: 'good' }));
    check(strong.includes('bg-success') && strong.includes('aria-valuetext="Very strong"'), 'Meter: tone good is not the success fill');
}

// 1.6: figures and where they come from.
{
    const up = html(h(C.Sparkline, { values: [3, 5, 4, 9], label: 'Sign-ups, 4 days, 3 to 9', tone: 'trend' }));
    check(up.includes('role="img"') && up.includes('aria-label="Sign-ups, 4 days, 3 to 9"') && up.includes('var(--oca-chart-up)') && /<path d="M0\.00,/.test(up), 'Sparkline: not a named picture of its values, or not green going up');
    check(html(h(C.Sparkline, { values: [9, 4], label: 'x', tone: 'trend' })).includes('var(--oca-chart-down)'), 'Sparkline: not red going down');
    check(C.chartColor(0) === 'var(--oca-chart-1)' && C.chartColor(5) === 'var(--oca-chart-2)' && C.chartColor('neutral') === 'var(--oca-chart-neutral)', 'chartColor: series do not map to the tokens');
    const frame = html(h(C.ChartFrame, { legend: [{ label: 'Price', color: 1 }, { label: '200-week mean', color: 'neutral', dashed: true }], caption: 'Daily close' }, h('svg', null)));
    check(frame.includes('class="oca-chart') && frame.includes('--swatch:var(--oca-chart-1)') && frame.includes('data-swatch="dashed"'), 'ChartFrame: no legend in the series colours');
    const line = html(h(C.SourceNote, { source: 'mempool.space', href: 'https://mempool.space/api', updated: 'Updated 2 min ago', variant: 'line' }));
    check(line.includes('href="https://mempool.space/api"') && line.includes('Updated 2 min ago') && line.includes('Source: '), 'SourceNote line: the source is not named and linked');
    check(/<button[^>]*>[\s\S]*Source<\/button>/.test(html(h(C.SourceNote, { source: 'Bitnodes' }))), 'SourceNote: no Source button');
    const panel = html(h(C.Panel, { title: 'Price', description: 'Daily close, 5 years', expandable: true, source: h('p', null, 'src') }, (expanded) => h('p', null, expanded ? 'big' : 'small')));
    check(panel.includes('>Price</h3>') && panel.includes('aria-label="Open full screen"') && panel.includes('<p>small</p>') && panel.includes('<p>src</p>'), 'Panel: a part is missing');
    const hud = html(h(C.HudCard, { eyebrow: 'Next block', live: true, title: '~4 min' }, h('p', null, 'row')));
    check(hud.includes('backdrop-blur-md') && hud.includes('animate-pulse') && hud.includes('~4 min'), 'HudCard: not a live card over the scene');
    const kv = html(h(C.KeyValueList, { items: [{ label: 'MVRV', value: '1.8', note: 'Fair value', tone: 'good' }, { label: 'Funding', value: '0.04%', tone: 'bad' }] }));
    check(/1\.8<span class="[^"]*text-success[^"]*">Fair value/.test(kv) && /<dd class="[^"]*text-destructive[^"]*">0\.04%/.test(kv), 'KeyValueList: tone does not colour the note, or the value without one');
    const stat = (delta) => html(h(C.StatCard, { label: 'Price', value: '$68,200', delta }));
    check(stat({ value: 2.4, suffix: '%' }).includes('text-success') && stat({ value: 2.4, suffix: '%' }).includes('+2.4%'), 'StatCard: a rise is not green and signed');
    check(stat({ value: -1.2, suffix: '%' }).includes('text-destructive') && stat({ value: -1.2, suffix: '%' }).includes('−1.2%'), 'StatCard: a fall is not red and signed');
    check(stat({ value: -3, good: 'down' }).includes('text-success'), 'StatCard: good: down does not make a fall green');
    check(/<span class="oca-label[^"]*">Price<\/span>/.test(stat()), 'StatCard: its label is not oca-label');
}

// A context set in one entry reaches a reader in another (each entry is bundled on its own).
{
    const sections = [{ id: 'you', label: 'You', href: '/me', groups: [{ items: [{ href: '/me', label: 'Home', active: true }] }] }];
    const out = html(h(Ch.AppShell, { sections }, h(C.PageHeader, { title: 'Home' })));
    check(/class="oca-eyebrow[^"]*">You</.test(out), 'AppShell (chrome) does not reach PageHeader (components): the section eyebrow is missing');
}

// A Select inside a Field is named by the Field's label: the trigger carries the id the label points at.
{
    const out = html(
        h(P.Field, { label: 'Network', hint: 'Mainnet anchors to Bitcoin.' },
            h(P.Select, { defaultValue: 'mainnet' }, h(P.SelectTrigger, null, h(P.SelectValue)), h(P.SelectContent, null, h(P.SelectItem, { value: 'mainnet' }, 'Mainnet'))))
    );
    const labelFor = out.match(/<label[^>]*for="([^"]+)"/)?.[1];
    check(!!labelFor && new RegExp(`<button[^>]*id="${labelFor}"`).test(out), 'Field + Select: the label does not name the trigger');
    check(/<button[^>]*aria-describedby="[^"]+-hint"/.test(out), 'Field + Select: the hint does not describe the trigger');
}

// The account control: one in every state and every place a header puts it, and never "Your account".
{
    const S = require(join(here, '../dist/session.js'));
    const view = (state, extra = {}) => h(Ch.SessionAccountView, { state, signInHref: '/signin', name: state === 'in' ? 'ana@example.com' : undefined, ...extra });
    const nav = [{ href: '/how', label: 'How it works' }];
    const places = {
        alone: (a) => a,
        site: (a) => h(Ch.SiteHeader, { nav, account: a }),
        tool: (a) => h(Ch.SiteHeader, { variant: 'tool', product: 'stamp', nav, account: a }),
        'site with a CTA': (a) => h(Ch.SiteHeader, { nav, cta: { label: 'Open your vault', href: '/vault' }, account: a }),
        'tool shell': (a) => h(Ch.ToolShell, { protocol: 'stamp', tools: [{ href: '/create', label: 'Create' }], account: a }, h('p', null, 'page')),
        docs: (a) => h(Ch.DocsShell, { nav: [], current: '/', account: a }, h('p', null, 'page')),
    };
    const KIND = { out: 'out', checking: 'pending', unknown: 'unknown', in: 'in' };
    for (const [place, wrap] of Object.entries(places)) {
        for (const state of Object.keys(KIND)) {
            const out = html(wrap(view(state)));
            const controls = out.match(/data-oca-account="[a-z]+"/g) ?? [];
            check(controls.length === 1 && controls[0] === `data-oca-account="${KIND[state]}"`, `Account (${place}, ${state}): ${controls.join(', ') || 'no account control'}, not one "${KIND[state]}"`);
            check(!/Your account/i.test(out), `Account (${place}, ${state}): "Your account" is drawn outside the menu`);
            const el = out.match(/<(a|span|button)\b[^>]*data-oca-account="[a-z]+"[^>]*>/)?.[0] ?? '';
            if (state === 'checking' || state === 'unknown') check(!/\bhref=/.test(el) && /aria-hidden="true"/.test(el), `Account (${place}, ${state}): the placeholder links or is read: ${el}`);
            if (state === 'out') check(/href="\/signin"/.test(el), `Account (${place}): the way in does not go to the sign-in: ${el}`);
            if (state === 'in') check(/aria-label="ana@example.com, account menu"/.test(el) && out.includes('>ana@example.com</span>'), `Account (${place}): the trigger does not show and say the email: ${el}`);
        }
    }
    // A session with no name at all is never called "Your account": the trigger keeps a mark, and the menu says who.
    for (const [place, wrap] of Object.entries(places)) {
        const nameless = html(wrap(view('in', { name: undefined })));
        check((nameless.match(/data-oca-account="in"/g) ?? []).length === 1 && !/Your account/i.test(nameless), `Account (${place}): a nameless session's trigger is missing or says "Your account"`);
    }
    // In every header the way in is 2.0's block at the right rule.
    const blockOut = html(places.site(view('out')));
    for (const place of ['site', 'tool', 'site with a CTA', 'tool shell', 'docs']) {
        check(/<a[^>]*data-oca-account="out"[^>]*class="[^"]*\bbg-primary\b/.test(html(places[place](view('out')))), `Account (${place}): the header's way in is not the block`);
    }
    // With `account`, a header's own Sign in and CTA give way: one control, and the site's action goes in the menu.
    for (const state of Object.keys(KIND)) {
        const withCta = html(places['site with a CTA'](view(state)));
        check(!withCta.includes('data-oca-cta') && !withCta.includes('Open your vault'), `Account (${state}): SiteHeader draws its cta beside the account`);
    }
    const both = html(h(Ch.SiteHeader, { nav, signIn: true, cta: true, account: view('out') }));
    check((both.match(/>Sign in</g) ?? []).length === 1 && !both.includes('Get an account'), `Account: SiteHeader draws signIn or cta beside the account (${(both.match(/>Sign in</g) ?? []).length} ways in)`);
    // The words come from the registry, and a site may say its own.
    check(blockOut.includes('>Sign in</span>') && html(places.site(view('out', { signInLabel: 'Get an account' }))).includes('>Get an account</span>'), 'Account: the way in does not say SIGN_IN_LABEL, or ignores signInLabel');
    // A refused sign-out leaves the person signed in, and the header says so under the trigger.
    const refusedOut = html(view('in', { signOutRefused: true }));
    check(!html(view('in')).includes('role="alert"'), 'Account: signed in, a notice shows with no refused sign-out');
    check(refusedOut.includes('role="alert"') && refusedOut.includes('Couldn’t sign out. You’re still signed in; try again.') && refusedOut.includes('ana@example.com, account menu'), 'Account: a refused sign-out is not said beside the trigger');
    // In place: the route on the server (the address is read in the browser); outside a router, the bare page.
    check(html(h(Ch.SessionAccountView, { state: 'out', signInPath: '/signin' })).includes('href="/signin"'), 'Account: signInPath does not reach the way in');
    check(html(h(Ch.SessionAccountView, { state: 'out', signInPath: '/signin', signInHref: 'https://ochk.io/signin' })).includes('href="https://ochk.io/signin"'), 'Account: signInHref does not win over signInPath');
    // Who is signed in: the email, else the chosen name, else a short address, else a short did. Never a generic word.
    const who = [
        [{ displayName: 'Ana', displayIdentity: { kind: 'email', value: 'ana@example.com' } }, 'ana@example.com'],
        [{ displayName: 'Ana', displayIdentity: { kind: 'did', value: 'did:oc:ed30f1d9c0ffee00112233a4c2' } }, 'Ana'],
        [{ displayName: null, displayIdentity: { kind: 'btc', value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' } }, 'bc1qxy2k…hx0wlh'],
        [{ displayName: null, displayIdentity: { kind: 'did', value: 'did:oc:ed30f1d9c0ffee00112233a4c2' } }, 'did:oc:ed30f1d9…a4c2'],
        [{ displayName: null, didOc: 'did:oc:ed30f1d9c0ffee00112233a4c2', displayIdentity: { kind: 'did', value: '' } }, 'did:oc:ed30f1d9…a4c2'],
    ];
    for (const [account, want] of who) check(S.accountName(account) === want, `accountName(${JSON.stringify(account.displayIdentity)}): ${JSON.stringify(S.accountName(account))}, not ${want}`);
}

// A Field labels a control inside a box of its own (an input with a popover under it) without taking the box.
{
    const out = html(
        h(P.Field, { label: 'Your Bitcoin address', hint: 'You sign in your own wallet.', error: 'Not an address.' }, (c) =>
            h('div', { className: 'relative' }, h(P.Input, c), h('div', { role: 'listbox', style: { position: 'absolute', top: '100%' } }))
        )
    );
    const labelFor = out.match(/<label[^>]*for="([^"]+)"/)?.[1];
    const input = out.match(/<input[^>]*>/)?.[0] ?? '';
    check(!!labelFor && input.includes(`id="${labelFor}"`), 'Field: the label does not name a control inside its own box');
    check(/aria-describedby="[^"]+-hint [^"]+-error"/.test(input) && input.includes('aria-invalid="true"'), 'Field: the hint and error do not describe that control');
    check(/<div class="relative"><input/.test(out), 'Field: the control\'s own box is not kept');
    const fixed = html(h(P.Field, { label: 'Address', id: 'addr' }, h(P.Input)));
    check(fixed.includes('for="addr"') && fixed.includes('id="addr"'), 'Field: a given id is not used');
}

// VerifyReport: items-start sizes a line to its longest word, so an address in the title or summary must be free to break.
{
    const addr = 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297';
    const out = html(
        h(C.VerifyReport, {
            verdict: 'caution',
            title: `Signed by ${addr}`,
            summary: `Signed by ${addr}, with no timestamp yet.`,
            checks: [
                { label: 'Bitcoin timestamp', state: 'none' },
                { label: 'Stake behind the signer', state: 'unchecked' },
            ],
        })
    );
    const holders = [...out.matchAll(/<(h2|p) class="([^"]*)"[^>]*>Signed by bc1p/g)];
    check(holders.length === 2 && holders.every((m) => m[2].includes('[overflow-wrap:anywhere]')), 'VerifyReport: an address in the title or summary cannot break, so it overflows a phone');
    check(/>Bitcoin timestamp<[\s\S]*?>None</.test(out), 'VerifyReport: an absent check does not read None');
    check(/>Stake behind the signer<[\s\S]*?>Not checked</.test(out), 'VerifyReport: an unchecked check does not read Not checked');
}

// A VerifyReport that runs in the page: no statement until it has run, a running check turns and says so, and a check's output sits under its line.
{
    const out = html(
        h(C.VerifyReport, {
            title: 'Check it yourself',
            checks: [
                { label: 'Fetch the signed bytes', state: 'ok', note: '482 bytes', output: h('details', null, h('summary', null, 'Output')) },
                { label: 'Check the signature', state: 'running' },
            ],
        })
    );
    check(/<header[^>]*><h2/.test(out) && !out.includes('data-status='), 'VerifyReport: a report with no verdict yet draws a statement before its title');
    check(/>Check the signature<[\s\S]*?>Running</.test(out), 'VerifyReport: a running check does not read Running');
    check(/<span aria-hidden="true" class="[^"]*text-foreground"><svg[^>]*class="[^"]*animate-spin/.test(out), 'VerifyReport: a running check does not turn');
    check(/>482 bytes<\/span><\/div><span[^>]*>Passed<\/span><div class="[^"]*sm:basis-full[^"]*"><details>/.test(out), "VerifyReport: a check's output does not take a line of its own under its result");
    check(/class="[^"]*sm:flex-wrap[^"]*"><div[^>]*><span[^>]*>Fetch the signed bytes</.test(out) && !/sm:flex-wrap[^"]*"><div[^>]*><span[^>]*>Check the signature</.test(out), "VerifyReport: only a check with output wraps its line");
}

// Tool parts.
{
    const meter = html(h(C.Meter, { value: 62, max: 100, ghost: 20, label: 'Turnout' }));
    check(meter.includes('role="meter"') && meter.includes('aria-valuenow="62"') && meter.includes('62%'), 'Meter: not a meter');
    const pending = html(h(C.AnchorStatus, { state: 'pending', calendar: 'https://alice.btc.calendar.opentimestamps.org', submittedAt: 1760951400 }));
    check(pending.includes('alice.btc.calendar.opentimestamps.org') && pending.includes('Waiting for a Bitcoin block'), 'AnchorStatus: pending does not say where');
    const anchored = html(h(C.AnchorStatus, { state: 'anchored', blockHeight: 971632 }));
    check(anchored.includes('https://mempool.space/block/971632') && anchored.includes('971,632'), 'AnchorStatus: the block is not linked');
    const later = html(h(C.BlockCountdown, { target: 972000, tip: 971632 }));
    check(later.includes('368') && later.includes('about 2 days 13 hours'), 'BlockCountdown: wrong wait');
    check(html(h(C.BlockCountdown, { target: 972000, tip: 972001, reached: 'Revealed' })).includes('Revealed at'), 'BlockCountdown: reached not said');
    const Badge = C.createStateBadge({ active: { label: 'Active', tone: 'good' }, revoked: { label: 'Revoked', tone: 'bad' } });
    check(html(h(Badge, { state: 'revoked' })).includes('Revoked'), 'createStateBadge: wrong word');
    const chips = html(h(C.FilterChips, { label: 'Status', options: [{ value: 'a', label: 'Active' }, { value: 'b', label: 'Revoked' }], value: 'a', onChange: () => {} }));
    check(/aria-pressed="true"[^>]*>Active/.test(chips) && chips.includes('aria-pressed="false"'), 'FilterChips: pressed state wrong');
    const chip = html(h(C.HashChip, { value: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t', explorer: 'address' }));
    check(chip.includes('https://mempool.space/address/bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t'), 'HashChip: explorer link missing');
    const art = html(h(C.ArtifactView, { content: '{"v":1,"kind":"stamp"}', filename: 'stamp.json' }));
    check(art.includes('aria-pressed="true"') && art.includes('Formatted') && art.includes('Download stamp.json'), 'ArtifactView: controls missing');
    check(art.includes('class="oca-p">&quot;kind&quot;<'), 'ArtifactView: JSON is not highlighted');
    const drop = html(h(C.DropZone, { onFile: () => {}, onText: () => {} }));
    check(drop.includes('Choose a file') && drop.includes('Paste text instead') && drop.includes('stays in your browser'), 'DropZone: a way in is missing');
    const sec = html(h(C.FormSection, { n: 2, title: 'Who signs', status: 'current' }, h('p', null, 'x')));
    check(sec.includes('aria-current="step"') && sec.includes('Step 2: '), 'FormSection: step not announced');
}

// The legal row: ochk.io's documents, or a self-hosting product's own.
{
    const F = require(join(here, '../dist/family.js'));
    const io = html(h(Ch.SiteFooter, { legal: true }));
    check(io.includes('href="https://ochk.io/terms"') && io.includes('aria-label="Legal"'), 'SiteFooter legal: ochk.io terms missing');
    const own = html(h(Ch.SiteFooter, { legal: F.SELF_HOSTED_LEGAL_LINKS, compact: true }));
    check(own.includes('href="/terms"') && own.includes('href="/privacy"') && !own.includes('https://ochk.io/terms'), 'SiteFooter legal: a self-hosting site does not link its own terms');
    check(own.includes('href="https://ochk.io/trademark"'), 'SiteFooter legal: trademarks are not on ochk.io');
    check(!html(h(Ch.SiteFooter, {})).includes('aria-label="Legal"'), 'SiteFooter: a legal row without legal');
    // The footer's two hands: inlined 1-bit pictures, decoration, drawn pixelated; none without the signature, none in a tool's footer.
    const hands = [...html(h(Ch.SiteFooter, { legal: true })).matchAll(/<img [^>]*data-oca-hand="(left|right)"[^>]*>/g)];
    check(
        hands.map((m) => m[1]).join() === 'left,right' && hands.every(([tag]) => tag.includes('src="data:image/png;base64,iVBORw0KGgo') && tag.includes('alt=""') && tag.includes('image-rendering:pixelated')),
        `SiteFooter: the two hands, inlined, as decoration, pixelated (${hands.length} drawn)`
    );
    check(html(h(Ch.SiteFooter, {})).includes('data-oca-hands="" aria-hidden="true"'), 'SiteFooter: the hands are not hidden from a screen reader');
    check(!html(h(Ch.SiteFooter, { signature: false })).includes('data-oca-hand') && !html(h(Ch.SiteFooter, { compact: true })).includes('data-oca-hand'), 'SiteFooter: hands without the signature, or in a tool\'s footer');
    // A dither ground keeps its cells whole: drawn at its cell size, never stretched to the section.
    {
        const B = require(join(here, '../dist/blocks.js'));
        const g = html(h(B.DitherGround, { src: '/a.png', width: 300, height: 120, cell: 2, at: '70% 50%' }));
        check(g.includes('aria-hidden="true"') && g.includes('background-size:600px 240px') && g.includes('background-position:70% 50%') && g.includes('image-rendering:pixelated'), `DitherGround: a whole-cell, still, hidden ground: ${g}`);
    }
}

// The parts a signed-in page repeats.
{
    const title = html(h(C.SectionTitle, { title: 'Backers', meta: '12 of 40', description: 'Who stands behind it.', action: h('a', { href: '/all' }, 'View all') }));
    check(/<h2[^>]*>Backers<span[^>]*>12 of 40<\/span><\/h2>/.test(title), 'SectionTitle: the count is not read with the title');
    check(title.includes('Who stands behind it.') && title.includes('href="/all"'), 'SectionTitle: the line or the action is missing');
    check(html(h(C.SectionTitle, { title: 'Delete', as: 'h3', size: 'sm', tone: 'danger' })).match(/<h3 class="[^"]*oca-title-sm[^"]*text-destructive/), 'SectionTitle: as, size or tone ignored');
    const list = html(h(C.ListCard, null, h('li', null, 'a'), h('li', null, 'b')));
    check(/^<ul (?=[^>]*data-oca-list="")(?=[^>]*class="[^"]*divide-y[^"]*rounded-none)[^>]*><li>a<\/li><li>b<\/li><\/ul>$/.test(list), 'ListCard: not a list in one card, marked for a flush card');
    const choice = html(
        h(C.ChoiceGroup, { label: 'Who can post', value: 'b', onValueChange: () => {} }, h(C.ChoiceCard, { value: 'a', title: 'Anyone' }), h(C.ChoiceCard, { value: 'b', title: 'Holders', description: 'A bound address.' }))
    );
    check(choice.includes('role="radiogroup"') && choice.includes('aria-label="Who can post"'), 'ChoiceGroup: not a named radio group');
    check(/role="radio" aria-checked="false"[^>]*>[\s\S]*?Anyone/.test(choice) && /role="radio" aria-checked="true"[^>]*>[\s\S]*?Holders/.test(choice), 'ChoiceCard: the chosen card is not checked');
    const nums = html(h(C.FilterChips, { label: 'Window', options: [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }], value: 30, onChange: () => {} }));
    check(/aria-pressed="true"[^>]*>30 days/.test(nums), 'FilterChips: a number value is not pressed');
    for (const [size, cls] of [['2xs', 'size-7'], ['xs', 'size-8']]) check(html(h(C.Monogram, { name: 'Ada', size })).includes(cls), `Monogram: ${size} is not ${cls}`);
}

// A table's inline code breaks after punctuation; prose code does not change.
{
    const inTable = html(h(mdxComponents.table, null, h('tbody', null, h('tr', null, h('td', null, h(mdxComponents.code, null, 'oc_session.expired'))))));
    check(inTable.includes('oc_<wbr/>session.<wbr/>expired'), 'MdxTable: inline code has no break after its punctuation');
    check(!inTable.includes('min-w-[9rem]'), 'MdxTable: a cell keeps a minimum width');
    check(html(h(mdxComponents.code, null, 'oc_session.expired')).includes('>oc_session.expired</code>'), 'mdx code: prose code outside a table changed');
}

// A block height links to mempool.space only once it is mined.
{
    const mined = /href="https:\/\/mempool\.space\/block\/972000"/;
    check(!mined.test(html(h(C.BlockCountdown, { target: 972000, tip: 971632 }))), 'BlockCountdown: an unmined target links to a page mempool.space does not have');
    check(!mined.test(html(h(C.BlockCountdown, { target: 972000 }))), 'BlockCountdown: a target with no known tip links');
    check(mined.test(html(h(C.BlockCountdown, { target: 972000, tip: 972004 }))), 'BlockCountdown: a reached target does not link its block');
}

// Rows, people, a pane's bar, a notice's icon.
{
    const row = html(
        h(C.ListRow, { href: '/messages/1', title: 'Ada', meta: '2m', description: 'The keys are in the usual place.', current: true, unread: true, leading: h('i', { 'data-lead': '' }), trailing: h('b', null, '2'), actions: h('button', { type: 'button', 'data-act': '' }, 'More') })
    );
    // With actions of its own the title is the row's one link, its target stretched over the row (the li).
    const links = [...row.matchAll(/<a ([^>]*)>/g)].map((m) => m[1]);
    check(/^<li class="[^"]*group\/row[^"]*relative/.test(row) && links.length === 1 && links[0].includes('href="/messages/1"') && links[0].includes('aria-current="true"') && links[0].includes('after:inset-0'), 'ListRow: not one link, marked current, stretched over the row');
    check(row.includes('data-act=""') && !/<a [^>]*>(?:(?!<\/a>)[\s\S])*data-act/.test(row), 'ListRow: the actions sit inside the link');
    check(/font-semibold[^"]*"><a [^>]*>Ada<\/a><\/span><span[^>]*>2m<\/span>/.test(row) && row.includes('text-foreground">The keys'), 'ListRow: unread does not set the title bold and the line in ink, or the meta is not beside the title');
    // Without controls of its own the whole row is still the one link.
    const whole = html(h(C.ListRow, { href: '/messages/2', title: 'Hal', trailing: h('b', null, '1') }));
    check(/^<li class="[^"]*"><a [^>]*href="\/messages\/2"[^>]*>[\s\S]*Hal[\s\S]*<b>1<\/b>[\s\S]*<\/a><\/li>$/.test(whole), 'ListRow: a row with no controls of its own is not one link around its content');
    check(/<button type="button" class="[^"]*min-h-11/.test(html(h(C.ListRow, { title: 'x', onSelect: () => {}, variant: 'pane' }))), 'ListRow: a pane row is not a 44px button');
    check(html(h(C.ListRow, { title: 'x', href: 'https://mempool.space' })).includes('<a href="https://mempool.space"'), 'ListRow: an outside link is not a plain anchor');
    const fig = html(h(C.Avatar, { seed: 'bc1q', name: 'Satoshi Nakamoto', size: 'md' }));
    check(/^<span aria-hidden="true" class="[^"]*rounded-full[^"]*size-11[^"]*" style="[^"]*--oca-avatar-h:\d+[^"]*">SN<\/span>$/.test(fig), 'Avatar: no initials on a round tint');
    check(html(h(C.Avatar, { seed: 'a' })).includes('<svg') && html(h(C.Avatar, { seed: 'a', name: '  ' })).includes('<svg'), 'Avatar: no name does not draw the person glyph');
    check(/^<img [^>]*src="data:image\/png;base64,AA"[^>]*aria-hidden="true"[^>]*rounded-full/.test(html(h(C.Avatar, { seed: 'a', name: 'Ada', src: 'data:image/png;base64,AA' }))), 'Avatar: a picture is not drawn round');
    check(html(h(C.Avatar, { seed: 'a', name: 'Ada' })).match(/--oca-avatar-h:(\d+)/)?.[1] === html(h(C.Avatar, { seed: 'a', name: 'Bob' })).match(/--oca-avatar-h:(\d+)/)?.[1], 'Avatar: the tint follows the name, not the seed');
    const bar = html(h(Ch.PaneHeader, null, h('span', null, 'Messages')));
    check(/^<header class="[^"]*h-14[^"]*border-b[^"]*px-4[^"]*"><span>Messages<\/span><\/header>$/.test(bar), 'PaneHeader: not a 56px bar with a hairline');
    const lock = html(h(C.Notice, { tone: 'warning', icon: h('svg', { 'data-icon': '' }), title: 'Set a passphrase' }));
    check(/<span aria-hidden="true" class="[^"]*text-oca-accent-ink[^"]*"><svg data-icon=""><\/svg><\/span>/.test(lock) && !lock.includes('rounded-full'), 'Notice: the icon does not replace the dot in the notice\'s colour');
    check(html(h(C.Notice, { tone: 'warning', title: 'x' })).includes('rounded-full bg-oca-orange'), 'Notice: without an icon the dot is gone');
}

// The account phrase and the sign-in page's word come from the registry.
{
    const F = require(join(here, '../dist/family.js'));
    const cta = html(h(Ch.AccountCta));
    check(cta.includes(`href="${F.GET_AN_ACCOUNT.href}"`) && cta.includes(`>${F.GET_AN_ACCOUNT.label}</a>`) && F.GET_AN_ACCOUNT.href === 'https://ochk.io/signin', 'AccountCta: not the registry\'s phrase to ochk.io\'s sign-in');
    // Typed as a string, so it passes where a string label is asked for.
    check(/label: "Get an account"/.test(require('node:fs').readFileSync(join(here, '../dist/family.d.ts'), 'utf8') + require('node:fs').readdirSync(join(here, '../dist')).filter((f) => /^index-.*\.d\.ts$/.test(f)).map((f) => require('node:fs').readFileSync(join(here, '../dist', f), 'utf8')).join('')), 'GET_AN_ACCOUNT: its label is not typed as the string it is');
    check(html(h(Ch.AccountCta, { href: '/signin' })).includes('href="/signin"'), 'AccountCta: ochk.app cannot point it at its own sign-in');
    const frame = html(h(Ch.SignInFrame, { protocol: 'stamp' }, h('p', null, 'ceremony')));
    check(/h-5 w-px[^>]*><\/span><span[^>]*>stamp<\/span>/.test(frame), 'SignInFrame: a tool site\'s sign-in does not carry its word');
    check(html(h(Ch.SignInFrame, { product: 'ochk.app' }, 'x')).includes('>ochk.app</span>'), 'SignInFrame: product is ignored');
    check(!/h-5 w-px/.test(html(h(Ch.SignInFrame, {}, 'x'))), 'SignInFrame: ochk.io\'s sign-in grew a word');
}

// 1.14.0: the parts ochk.app's lists and tables needed.
{
    // DataTable: the row's link named by a chosen column, in the table and the phone card.
    const events = [{ id: 'e1', when: '2 min ago', event: 'Stamp 86020d78 verified' }];
    const cols = [
        { key: 'when', header: 'When', cell: (r) => r.when },
        { key: 'event', header: 'Event', cell: (r) => r.event },
    ];
    const t = html(h(C.DataTable, { columns: cols, rows: events, rowKey: (r) => r.id, rowHref: (r) => `/events/${r.id}`, linkColumn: 'event' }));
    const links = [...t.matchAll(/<a [^>]*href="\/events\/e1"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    check(links.length === 2 && links.every((x) => x === 'Stamp 86020d78 verified'), `DataTable linkColumn: the row's link reads ${JSON.stringify(links)}, not the event`);
    const plain = html(h(C.DataTable, { columns: cols, rows: events, rowKey: (r) => r.id, rowHref: (r) => `/events/${r.id}` }));
    check(/<a [^>]*href="\/events\/e1"[^>]*>2 min ago<\/a>/.test(plain), 'DataTable: without linkColumn the primary cell no longer names the link');

    // CopyButton: the label said on the button, still the button's name.
    const copy = html(h(C.CopyButton, { value: '{}', label: 'Copy signed JSON', showLabel: true }));
    check(/<button[^>]*>.*Copy signed JSON.*<\/button>/.test(copy) && !/aria-label="Copy signed JSON"/.test(copy), `CopyButton showLabel: the label is not on the button (${copy.slice(0, 90)})`);
    check(/aria-label="Copy signed JSON"/.test(html(h(C.CopyButton, { value: '{}', label: 'Copy signed JSON' }))), 'CopyButton: the icon button lost its name');

    // FilterChips: a chip that cannot be chosen now, heard as such and still in the Tab order.
    const chips = html(h(C.FilterChips, { label: 'State', value: 'all', onChange: () => {}, options: [{ value: 'all', label: 'All' }, { value: 'held', label: 'Held', count: 0, disabled: true }] }));
    const held = chips.match(/<button[^>]*>Held/)?.[0] ?? '';
    check(/aria-disabled="true"/.test(held) && !/\sdisabled=""/.test(held) && !/tabindex="-1"/.test(held), `FilterChips: a disabled chip is not heard as unavailable, or leaves the Tab order (${held})`);

    // ListRow: a line over the title and two under it, all in the row.
    const row = html(h('ul', null, h(C.ListRow, { eyebrow: 'Signed · 21 Oct', title: 'Lumen Notes', description: 'Asked to read your identity', detail: 'From notes.example', onSelect: () => {} })));
    const order = ['Signed · 21 Oct', 'Lumen Notes', 'Asked to read your identity', 'From notes.example'].map((x) => row.indexOf(x));
    check(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])) && /<button[^>]*>[\s\S]*From notes\.example[\s\S]*<\/button>/.test(row), `ListRow: the eyebrow, title, line and detail are not in order inside the row (${order})`);
    // A text action sits outside the row's button, never inside it.
    const act = html(h('ul', null, h(C.ListRow, { title: 'bc1q…e3w7t', onSelect: () => {}, action: h('button', { type: 'button', 'data-remove': '' }, 'Remove') })));
    check(act.includes('data-remove') && !/<button[^>]*type="button"[^>]*class="[^"]*min-h-11[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*data-remove/.test(act), 'ListRow action: the text action is missing, or nested in the row');

    // A mermaid fence's size meta rides through rehypeCode to the Diagram.
    const { rehypeCode } = require(join(here, '../dist/code.js'));
    const tree = { type: 'root', children: [{ type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'element', tagName: 'code', properties: { className: ['language-mermaid'] }, data: { meta: 'size=834x623' }, children: [{ type: 'text', value: 'sequenceDiagram\n' }] }] }] };
    rehypeCode()(tree);
    check(tree.children[0].properties.dataSize === '834x623' && tree.children[0].children.length === 1, `rehypeCode: a mermaid fence's size is not carried (${JSON.stringify(tree.children[0].properties)})`);
}

// 2.1.0: ./signin, the sign-in page six tool sites each carried a copy of, and SignInFrame's backTo.
{
    const S = require(join(here, '../dist/signin.js'));
    const F = require(join(here, '../dist/family.js'));
    // backTo draws the link opposite the lockup as Back to home is drawn: the same look and the coarse hit box.
    const hit = 'pointer-coarse:before:h-11';
    const backLink = (out) => out.match(/<header[^>]*>.*?<\/a>.*?(<a [^>]*>[^<]*<\/a>)/s)?.[1] ?? '';
    const to = backLink(html(h(Ch.SignInFrame, { protocol: 'lock', backTo: '/came/from?x=1' }, 'x')));
    check(/href="\/came\/from\?x=1"/.test(to) && />Go back</.test(to) && to.includes(hit), `SignInFrame backTo: the link is ${to}`);
    check(/>Back again</.test(backLink(html(h(Ch.SignInFrame, { backTo: '/a', backLabel: 'Back again' }, 'x')))), 'SignInFrame backLabel: the words are not the given ones');
    const home = backLink(html(h(Ch.SignInFrame, { protocol: 'lock' }, 'x')));
    check(/href="https:\/\/ochk.io\/lock"/.test(home) && />Back to home</.test(home) && home.includes(hit), `SignInFrame: with no backTo the link is no longer Back to home (${home})`);
    check(/>Mine</.test(html(h(Ch.SignInFrame, { backTo: '/a', back: h('a', { href: '/m' }, 'Mine') }, 'x'))) && !/>Go back</.test(html(h(Ch.SignInFrame, { backTo: '/a', back: null }, 'x'))), 'SignInFrame: back no longer wins over backTo');
    // homeLink={false}, for a popup that must stay with its opener: the lockup is drawn but goes nowhere, and
    // there is no Back to home. The skip link is the only anchor; a back of the popup's own sits opposite.
    const pinned = html(h(Ch.SignInFrame, { protocol: 'lock', homeLink: false }, 'x'));
    const hrefs = [...pinned.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);
    check(hrefs.join() === '#signin' && /<header[^>]*>.*?<svg/s.test(pinned), `SignInFrame homeLink={false}: the page still links to ${hrefs.join(', ')}, or the lockup is gone`);
    const closer = html(h(Ch.SignInFrame, { homeLink: false, back: h('button', { type: 'button' }, 'Close') }, 'x'));
    check(/<header[^>]*>.*<button type="button">Close<\/button>.*<\/header>/s.test(closer), 'SignInFrame homeLink={false}: a back of its own is not drawn opposite the lockup');
    // HIT_LINK from the package entry: the classes the frame's own links carry, which stamp, lock and me.ochk.io's
    // Close copied by hand.
    const { HIT_LINK } = require(join(here, '../dist/index.js'));
    check(typeof HIT_LINK === 'string' && HIT_LINK.includes(hit) && home.includes(HIT_LINK), `HIT_LINK: the package entry exports ${HIT_LINK}, not the classes Back to home carries`);

    // The page on the server, as a prerendered /signin: no query, so the return target is the default.
    const page = html(h(S.SignInPage, { protocol: 'lock', defaultReturnTo: '/app' }));
    const back = backLink(page);
    check(/href="\/app"/.test(back) && />Go back</.test(back) && back.includes(hit), `SignInPage: Go back is ${back}, not a 44px link to the default return`);
    // The six tool sites' own words, so their screens do not move when they adopt it.
    check(page.includes('>Sign in to OC Lock</h1>') && page.includes('One sign-in for every orangecheck site. No password.'), 'SignInPage: the title or lead is not the tool sites\' own');
    check(/href="https:\/\/ochk.io\/lock"/.test(page) && /data-oc-signin/.test(page), 'SignInPage: no lockup home to ochk.io/lock, or no OcSignIn');
    const btc = html(h(S.SignInPage, { product: 'btc', home: '/', audience: 'https://btc.ochk.io', defaultReturnTo: '/', back: 'home', title: 'Sign in to the desk', fineprint: 'Small print.' }));
    const btcBack = backLink(btc);
    check(/href="\/"/.test(btcBack) && />Back to home</.test(btcBack) && btc.includes('>Sign in to the desk</h1>') && btc.includes('Small print.'), `SignInPage product: back="home", the title or the fineprint is not the site's (${btcBack})`);
    check(html(h(S.SignInPage, { product: 'x', home: '/', audience: 'https://x.ochk.io', defaultReturnTo: '/' })).includes(`>${F.SIGN_IN_LABEL}</h1>`), 'SignInPage: a product site\'s default title is not SIGN_IN_LABEL');

    // One rule for the tab: the title is SIGN_IN_LABEL, and site-kit adds the site's name.
    const seo = S.signInSeo({ protocol: 'vote' });
    check(
        seo.title === F.SIGN_IN_LABEL &&
            seo.description === 'Sign in to OC Vote with email, Google, GitHub or a Bitcoin wallet. One sign-in for every orangecheck site.' &&
            seo.canonical === '/signin' &&
            seo.noindex === true,
        `signInSeo: ${JSON.stringify(seo)}`
    );
    check(S.signInSeo({ product: 'btc', description: 'Desk.' }).description === 'Desk.', 'signInSeo: a product site\'s description is not its own');

    // A product site has no protocol to take the audience from, so leaving it out is a type error.
    const ts = require('typescript');
    const file = join(here, '../dist/__signin-types.tsx');
    const probe = (src) => {
        require('node:fs').writeFileSync(file, `import { SignInPage } from './signin';\nexport const x = ${src};\n`);
        try {
            const p = ts.createProgram([file], { strict: true, noEmit: true, jsx: ts.JsxEmit.ReactJSX, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
            return ts.getPreEmitDiagnostics(p).length;
        } finally {
            require('node:fs').rmSync(file, { force: true });
        }
    };
    check(probe(`<SignInPage protocol="lock" defaultReturnTo="/app" />`) === 0, 'SignInPage types: a tool site\'s two props do not type-check');
    check(probe(`<SignInPage product="btc" home="/" defaultReturnTo="/" />`) > 0, 'SignInPage types: a product site without an audience type-checks');
    check(probe(`<SignInPage protocol="lock" product="btc" home="/" audience="a" defaultReturnTo="/" />`) > 0, 'SignInPage types: a protocol and a product together type-check');
}

// The section shell: a Section's bar is its first row, across its container or frame, and the section's
// space is under it; SectionHeading's split puts the title and the lead in two cells.
{
    const { JSDOM } = require('jsdom');
    const dom = (el) => new JSDOM(html(el)).window.document;
    const body = h('p', { 'data-body': '' }, 'Body');
    const shapes = [
        ['contained', h(C.Section, { id: 's', 'aria-labelledby': 's-bar', bar: { start: 'How it works', end: '01 / 03', as: 'h2' } }, body), '.oca-container', 'py-16 md:py-24'],
        ['framed', h(C.Section, { framed: true, bar: { start: 'How it works' } }, body), '[data-oca-frame]', 'py-16 md:py-24'],
        ['framed, space sm', h(C.Section, { framed: true, space: 'sm', bar: { start: 'How it works' } }, body), '[data-oca-frame]', 'py-12 md:py-16'],
        ['uncontained', h(C.Section, { contained: false, bar: { start: 'How it works' } }, body), 'section', 'py-16 md:py-24'],
    ];
    for (const [name, el, box, space] of shapes) {
        const d = dom(el);
        const section = d.querySelector('section');
        const holder = box === 'section' ? section : section.querySelector(`:scope > ${box}`);
        const [first, second] = holder ? [...holder.children] : [];
        check(first?.matches('[data-oca-section-bar]') && first.textContent.startsWith('How it works'), `Section bar (${name}): the bar is not the first row of its ${box}`);
        check(second?.className === space && second.querySelector('[data-body]'), `Section bar (${name}): the body is not under the bar in its space ${space}: ${second?.outerHTML.slice(0, 120)}`);
        // The space is under the bar, never above it: the section and its frame or container hold none.
        const above = [section.className, holder === section ? '' : holder.className].join(' ');
        check(!/(^|\s)(md:)?(py|pt)-\d|oca-section/.test(above), `Section bar (${name}): space above the bar: ${above}`);
        check(!/clamp\(1rem/.test(html(el)), `Section bar (${name}): a literal gutter in the markup`);
    }
    const named = dom(shapes[0][1]);
    check(named.querySelector('[data-oca-section-bar] h2')?.textContent.endsWith('How it works') && named.querySelector('[data-oca-section-bar]').textContent.includes('01 / 03'), 'Section bar: as h2 and its end label are not drawn');
    // Without a bar a Section draws as before.
    const plain = dom(h(C.Section, null, body)).querySelector('section');
    check(!plain.querySelector('[data-oca-section-bar]') && /oca-section/.test(plain.className) && plain.querySelector(':scope > .oca-container > [data-body]'), 'Section without a bar: its space or container moved');
    const framedPlain = dom(h(C.Section, { framed: true }, body)).querySelector('[data-oca-frame]');
    check(/oca-section/.test(framedPlain.className) && framedPlain.querySelector(':scope > [data-body]'), 'framed Section without a bar: its Frame no longer holds its space and its children');

    const split = dom(h(C.SectionHeading, { layout: 'split', reveal: false, eyebrow: 'Data and funds', title: 'What we store', lead: h('p', null, 'What a session keeps.'), id: 'store' })).body.firstElementChild;
    const [left, right] = [...split.children];
    check(/(^|\s)grid(\s|$)/.test(split.className) && /items-end/.test(split.className) && /lg:grid-cols-\[minmax\(0,1\.1fr\)_minmax\(0,0\.9fr\)\]/.test(split.className) && !/max-w-3xl/.test(split.className), `SectionHeading split: not two cells from lg, feet level: ${split.className}`);
    check(split.children.length === 2 && left.querySelector('[data-ui="label"]')?.textContent === 'Data and funds' && left.querySelector('h2#store')?.textContent === 'What we store', 'SectionHeading split: the eyebrow and the title are not in the first cell');
    check(/oca-lead/.test(right?.className) && right.querySelector('p')?.textContent === 'What a session keeps.', 'SectionHeading split: the lead is not the second cell');
    const noLead = dom(h(C.SectionHeading, { layout: 'split', reveal: false, title: 'Alone' })).body.firstElementChild;
    check(noLead.children.length === 1, 'SectionHeading split: a heading with no lead draws an empty cell');
    const stack = dom(h(C.SectionHeading, { reveal: false, title: 'One column', lead: 'A line.' })).body.firstElementChild;
    check(/max-w-3xl/.test(stack.className) && /flex-col/.test(stack.className), 'SectionHeading: the default layout is no longer one column');
}

// StepGrid's line: per step its numeral, then its rule with a square node, then its title; from md the steps
// touch and each rule runs into the step's padding, so the rules meet as one.
{
    const { JSDOM } = require('jsdom');
    const items = [
        { title: 'An app decides to pay', body: 'Always, only in promos, or never.' },
        { title: 'You do something real', body: 'Sessions and actions count.' },
        { title: 'You keep up to 80%', badge: 'in testing', body: 'The reward lands in your activity.' },
    ];
    const d = new JSDOM(html(h(C.StepGrid, { look: 'line', items }))).window.document;
    const ol = d.querySelector('ol');
    const cls = (el) => ` ${el?.getAttribute('class') ?? ''} `;
    check(ol && cls(ol).includes(' md:gap-x-0 ') && cls(ol).includes(' md:grid-cols-3 ') && !cls(ol).includes(' md:gap-5 '), `StepGrid line: the steps do not touch from md: ${cls(ol)}`);
    const steps = ol ? [...ol.children] : [];
    check(steps.length === 3, `StepGrid line: ${steps.length} steps, not 3`);
    for (const [i, li] of steps.entries()) {
        const rule = li.querySelector('[data-oca-step-rule]');
        const node = rule?.firstElementChild;
        const label = li.querySelector('.oca-label');
        const title = li.querySelector('h3');
        check(cls(li).includes(' md:pr-10 ') && rule && cls(rule).includes(' md:-mr-10 ') && cls(rule).includes(' h-px ') && cls(rule).includes(' bg-foreground ') && rule.getAttribute('aria-hidden') === 'true', `StepGrid line, step ${i + 1}: its rule does not run into its padding as a hairline: ${rule?.outerHTML.slice(0, 160)}`);
        check(node && cls(node).includes(' size-2.5 ') && cls(node).includes(' bg-oca-accent-display ') && cls(node).includes(' absolute '), `StepGrid line, step ${i + 1}: no square node on its rule`);
        check(label?.textContent === String(i + 1).padStart(2, '0') && label.compareDocumentPosition(rule) & 4 && title && rule.compareDocumentPosition(title) & 4, `StepGrid line, step ${i + 1}: not its numeral, its rule, then its title`);
    }
    check(steps[2]?.querySelector('h3')?.textContent.includes('in testing'), 'StepGrid line: a badge is not drawn beside its title');
    const cards = new JSDOM(html(h(C.StepGrid, { items }))).window.document.querySelector('ol');
    check(cls(cards).includes(' md:gap-5 ') && !cards.querySelector('[data-oca-step-rule]'), 'StepGrid: the default look is no longer cards');
}

// PackageCard: without a tone, the dark panel of packages exactly as 2.4.0 drew it; with one, a square tile in
// that tone, its icon and label across its top, its title and note, then what it holds.
{
    const { JSDOM } = require('jsdom');
    const { createHash } = require('node:crypto');
    const sha = (s) => createHash('sha256').update(s).digest('hex');
    const items = [
        { title: 'A drop-in gate', code: '@orangecheck/gate', note: 'Middleware.' },
        { title: 'Sign in', code: '<OcSignInButton />', kind: 'tag', href: '/signin' },
        { title: 'Open', code: 'MIT', kind: 'link', note: 'Fork it.' },
    ];
    // The panel's markup from 2.4.0, for these items with the default heading and with h4 and a class.
    check(sha(html(h(C.PackageCard, { items }))) === 'c36d5c93153f906e514f08611aa6838ac2cdfcf827ec4dcb3c2246d8cd539a65', 'PackageCard: the panel no longer draws as 2.4.0 did');
    check(sha(html(h(C.PackageCard, { items, as: 'h4', className: 'rounded-none' }))) === 'cc0948f97d28e7d1268e0cce94cb6480a930dc82d5c6fea9ad1c31a85f05f86a', 'PackageCard: the panel with a heading level and a class no longer draws as 2.4.0 did');
    const GROUND = { card: ' bg-card ', ink: ' oca-band-ink ', brand: ' oca-band-brand ' };
    const cls = (el) => ` ${el?.getAttribute('class') ?? ''} `;
    for (const tone of ['card', 'ink', 'brand']) {
        const d = new JSDOM(html(h(C.PackageCard, { tone, icon: h(Terminal), label: '01 · @orangecheck/me-client', title: 'Sign-in that keeps bots out', note: 'A sign-in button.' }, h('pre', { 'data-held': '' }, 'yarn add')))).window.document;
        const tile = d.body.firstElementChild;
        const [head, words, held] = tile ? [...tile.children] : [];
        check(tile?.tagName === 'ARTICLE' && tile.getAttribute('data-oca-package-tile') === tone && cls(tile).includes(GROUND[tone]) && cls(tile).includes(' p-6 ') && cls(tile).includes(' md:p-8 ') && !/rounded|bg-oca-ink-card/.test(cls(tile)), `PackageCard tile (${tone}): not a square panel in its tone: ${cls(tile)}`);
        const icon = head?.firstElementChild;
        check(icon?.getAttribute('aria-hidden') === 'true' && icon.querySelector('svg') && cls(icon).includes(' [&_svg]:size-10 ') && cls(icon).includes(' text-oca-accent-display ') === (tone === 'ink'), `PackageCard tile (${tone}): its icon is not a 40px mark, orange on ink only: ${cls(icon)}`);
        check(head?.lastElementChild?.textContent === '01 · @orangecheck/me-client' && cls(head.lastElementChild).includes(' oca-label ') && cls(head.lastElementChild).includes(' normal-case '), `PackageCard tile (${tone}): its label is not the mono line at the top right`);
        check(words?.querySelector('h3')?.textContent === 'Sign-in that keeps bots out' && cls(words.querySelector('h3')).includes(' font-light ') && words.querySelector('p.text-muted-foreground')?.textContent === 'A sign-in button.', `PackageCard tile (${tone}): its title and note are not under its top`);
        check(held?.matches('pre[data-held]') && tile.children.length === 3, `PackageCard tile (${tone}): what it holds is not last`);
    }
    const bare = new JSDOM(html(h(C.PackageCard, { tone: 'card', as: 'h2', title: 'A drop-in gate' }))).window.document.body.firstElementChild;
    check(bare.children.length === 1 && bare.querySelector('h2')?.textContent === 'A drop-in gate', 'PackageCard tile: with no icon or label it draws an empty top row, or ignores its heading level');
}

// The long page (S34): the entry being read, as ochk.app's scroll-spy tests pinned it; the numbered contents, sticky
// from 900px and folded on a phone; the columns ruled at 900px on the frame's gutter; DocLayout drawing through them
// with contents and as 2.5.0 did without; LegalDocument's S10 header, its dates on a bar and its "§ NN" marks.
{
    const { JSDOM } = require('jsdom');
    const { createHash } = require('node:crypto');
    const sha = (s) => createHash('sha256').update(s).digest('hex');
    const dom = (el) => new JSDOM(html(el)).window.document;
    const cls = (el) => ` ${el?.getAttribute('class') ?? ''} `;
    const ai = C.activeIndex;
    check(ai([400, 1200, 2000], 140, false, 900) === 0, 'activeIndex: before any heading reaches the line, not the first entry');
    check(ai([-900, -100, 140, 600], 140, false, 900) === 2 && ai([-900, -100, 141, 600], 140, false, 900) === 1, 'activeIndex: not the last heading at or above the line');
    check(ai([-1400, -600, 300, 700], 140, true, 900) === 3, 'activeIndex: at the foot of the page, the last heading in view is not marked');
    check(ai([-1400, -600, 100, 1200], 140, true, 900) === 2, 'activeIndex: at the foot of the page, a last heading still below the fold is marked');
    check(ai([-300, Infinity, 500], 140, false, 900) === 0, 'activeIndex: a heading not on the page is marked');
    check(ai([], 140, false, 900) === -1, 'activeIndex: a page with no headings marks an entry');

    const entries = [
        { id: 'a', num: '01', label: 'Alpha' },
        { id: 'b', num: '02', label: 'Beta' },
        { id: 'c', label: 'Gamma' },
    ];
    const toc = dom(h(C.Toc, { entries, aside: h('p', { 'data-aside': '' }, 'Aside') }));
    const [sticky, folded] = toc.querySelectorAll('nav[aria-label="On this page"]');
    const details = toc.querySelector('details');
    check(sticky && [' sticky ', ' hidden ', ' min-[900px]:flex ', ' top-[calc(var(--oca-site-bar-h)+2.75rem)] ', ' overflow-y-auto '].every((c) => cls(sticky).includes(c)) && sticky.querySelector('[data-aside]'), `Toc: the contents are not sticky under the site's bar from 900px with the aside: ${cls(sticky)}`);
    check(details && cls(details).includes(' min-[900px]:hidden ') && details.contains(folded) && !details.querySelector('[data-aside]') && details.querySelector('summary')?.textContent === 'On this page+' && details.querySelector('summary span[aria-hidden]')?.textContent === '+', 'Toc: the phone fold is not "On this page" and its + over the list');
    for (const [name, nav] of [['sticky', sticky], ['folded', folded]]) {
        const links = [...(nav?.querySelectorAll('ol.border-l > li > a') ?? [])];
        check(links.map((a) => a.getAttribute('href')).join() === '#a,#b,#c' && links.map((a) => a.firstElementChild?.textContent).join() === '01,02,' && links.map((a) => a.lastElementChild?.textContent).join() === 'Alpha,Beta,Gamma', `Toc (${name}): its entries are not numbered links to their headings`);
        check(links[0]?.getAttribute('aria-current') === 'location' && cls(links[0]).includes(' border-oca-accent-display ') && links.slice(1).every((a) => !a.hasAttribute('aria-current') && cls(a).includes(' border-transparent ')), `Toc (${name}): the first entry is not marked in ember on the rule before any scroll`);
        check(links.every((a) => cls(a).includes(' min-h-11 ') && cls(a).includes(' border-l-2 ') && cls(a).includes(' -ml-px ')), `Toc (${name}): an entry is not 44px tall with its mark over the rule`);
    }

    // Contents of a site's own making (ochk.app's changelog, grouped by month): the same column and fold, its list as given.
    const grouped = h('div', { 'data-list': '' }, h('p', null, 'November'), h('ol', { className: 'border-l border-border' }, ...['v2', 'v1'].map((id) => h('li', { key: id }, h(C.ContentsLink, { id, here: id === 'v1' }, id)))));
    const own = dom(h(C.ContentsNav, { active: 'v1', list: grouped, aside: h('p', { 'data-aside': '' }, 'Aside') }));
    const ownNavs = [...own.querySelectorAll('nav[aria-label="On this page"]')];
    check(ownNavs.length === 2 && cls(ownNavs[0]).includes(' sticky ') && ownNavs[0].querySelector('[data-aside]') && own.querySelector('details')?.contains(ownNavs[1]) && !own.querySelector('details [data-aside]'), 'ContentsNav: not the sticky column with its aside and the phone fold without it');
    for (const nav of ownNavs) {
        const links = [...nav.querySelectorAll('[data-list] ol > li > a')];
        check(nav.querySelector('[data-list] > p')?.textContent === 'November' && links.map((a) => a.getAttribute('href')).join() === '#v2,#v1', 'ContentsNav: the list is not drawn as given, in each place');
        check(links[1]?.getAttribute('aria-current') === 'location' && cls(links[1]).includes(' border-oca-accent-display ') && !links[0]?.hasAttribute('aria-current') && cls(links[0]).includes(' border-transparent ') && links.every((a) => cls(a).includes(' min-h-11 ')), 'ContentsLink: the entry here is not the one marked, or an entry is not 44px tall');
    }
    check(html(h(C.Toc, { entries })) === html(h(C.ContentsNav, { active: 'a', list: h('ol', { className: 'border-l border-border' }, entries.map((e) => h('li', { key: e.id }, h(C.ContentsLink, { id: e.id, here: e.id === 'a' }, h('span', { className: 'w-5 shrink-0 font-mono text-[0.75rem] tabular-nums text-oca-subtle' }, e.num), h('span', null, e.label))))) })), 'Toc: not ContentsNav over a numbered list of ContentsLinks');

    const cols = dom(h(C.DocColumns, { nav: h('nav', null, 'N') }, h('p', { 'data-text': '' }, 'T'))).body.firstElementChild;
    const [navCell, textCell] = cols ? [...cols.children] : [];
    check(cls(cols).includes(' min-[900px]:grid-cols-[15.5rem_minmax(0,1fr)] ') && cls(cols).includes(' xl:grid-cols-[18.5rem_minmax(0,1fr)] '), `DocColumns: not 15.5rem then 18.5rem of contents beside the text: ${cls(cols)}`);
    check(cls(navCell).includes(' min-[900px]:border-r ') && cls(navCell).includes(' border-b ') && cls(navCell).includes(' min-[900px]:border-b-0 '), `DocColumns: the contents are not ruled off, under the fold on a phone and beside the text from 900px: ${cls(navCell)}`);
    check(cls(textCell).includes(' px-[var(--oca-frame-gutter)] ') && !/clamp\(/.test(html(h(C.DocColumns, { nav: null }, 'x'))) && textCell.querySelector('[data-text]'), `DocColumns: the text is not on the frame's gutter: ${cls(textCell)}`);
    check(!cols?.querySelector(':scope > [data-oca-doc-header]') && !cls(navCell).includes(' border-t '), `DocColumns without a header: a header cell, or a rule over the fold: ${cls(navCell)}`);
    // With a header: first, so a phone opens with the title above the fold; from 900px it heads the text column, the contents down both rows.
    const headed = dom(h(C.DocColumns, { nav: h('nav', null, 'N'), header: h('h1', null, 'H') }, h('p', { 'data-text': '' }, 'T'))).body.firstElementChild;
    const [hHead, hNav, hText] = headed ? [...headed.children] : [];
    check(
        hHead?.matches('[data-oca-doc-header]') &&
            hHead.querySelector('h1') &&
            [' min-[900px]:col-start-2 ', ' min-[900px]:row-start-1 ', ' min-[900px]:pl-16 ', ' px-[var(--oca-frame-gutter)] '].every((c) => cls(hHead).includes(c)) &&
            [' border-t ', ' border-b ', ' min-[900px]:border-t-0 ', ' min-[900px]:row-span-2 ', ' min-[900px]:border-r '].every((c) => cls(hNav).includes(c)) &&
            cls(hText).includes(' min-[900px]:pt-0 ') &&
            !cls(hText).includes(' min-[900px]:pt-14 ') &&
            hText.querySelector('[data-text]'),
        `DocColumns with a header: not the header first, the fold ruled over and under on a phone, the contents down both rows beside it from 900px: ${cls(hHead)} | ${cls(hNav)} | ${cls(hText)}`
    );

    const withToc = dom(h(C.DocLayout, { toc: entries, header: h(C.DocHeader, { title: 'Security' }) }, h('p', { 'data-text': '' }, 'T')));
    const frame = withToc.querySelector('[data-oca-frame]');
    const columns = frame?.querySelector(':scope > [data-oca-doc-columns]');
    const head = columns?.firstElementChild;
    const text = columns?.lastElementChild;
    check(frame && !/oca-container/.test(html(h(C.DocLayout, { toc: entries }, 'x'))) && columns && columns.querySelectorAll('nav[aria-label="On this page"] a[href="#b"]').length === 2, 'DocLayout with contents: not DocColumns on a Frame with the numbered contents');
    check(
        head?.matches('[data-oca-doc-header]') && head.querySelector('h1')?.textContent === 'Security' && head.nextElementSibling?.querySelector('details nav[aria-label="On this page"]') && text?.firstElementChild?.matches('p[data-text]') && !text.querySelector('h1'),
        'DocLayout with contents: its header does not come first, before the contents, with the text after them'
    );
    // Without contents, the markup 2.5.0 drew.
    check(sha(html(h(C.DocLayout, null, h('p', null, 'Body')))) === 'd16b1c4df347861c5339f77dd02bfb09a53e69cb34450e2d3be99f8b4bdbd964', 'DocLayout without contents no longer draws as 2.5.0 did');
    check(sha(html(h(C.DocLayout, { header: h(C.DocHeader, { title: 'Security', lead: 'How to tell us.' }), className: 'x' }, h('p', null, 'Body')))) === '2748b5ab7cb9ebfcfceed04893d00583f0dc587436f97300eb55566d288f732b', 'DocLayout without contents, with a header, no longer draws as 2.5.0 did');
    check(html(h(C.DocLayout, { toc: [] }, h('p', null, 'Body'))) === html(h(C.DocLayout, null, h('p', null, 'Body'))), 'DocLayout: an empty toc draws the columns, not the page without contents');

    const doc = {
        eyebrow: 'legal',
        title: 'Privacy policy',
        description: 'What we keep.',
        effective: '1 January 2026',
        updated: '4 November 2026',
        sections: [
            { id: 's1', num: '01', heading: 'what we store', blocks: [{ kind: 'para', text: 'One.' }] },
            { id: 's2', heading: 'more', blocks: [{ kind: 'para', text: 'Two.' }] },
        ],
    };
    const legal = dom(h(C.LegalDocument, { doc, art: h('svg', { 'data-art': '' }) }));
    const hero = legal.querySelector('section[data-ground="paper"]');
    const h1 = hero?.querySelector('h1');
    check(h1 && [...h1.children].map((x) => x.textContent).join('|') === 'Privacy|policy' && cls(h1.lastElementChild).includes(' text-oca-subtle ') && hero.querySelector('[data-art]') && /min-\[900px\]:min-h-/.test(hero.getAttribute('class')), `LegalDocument: its header is not S10 with the title's last word set back and the site's art: ${h1?.outerHTML.slice(0, 160)}`);
    check(legal.querySelector('[data-oca-frame] > [data-oca-section-bar]')?.textContent === 'Effective 1 January 2026 · last updated 4 November 2026', 'LegalDocument: its dates are not on a bar under the header');
    const legalLinks = [...legal.querySelectorAll('[data-oca-doc-columns] nav ol a')].slice(0, 2);
    check(legalLinks.map((a) => a.textContent).join('|') === '01What we store|More', `LegalDocument: its contents are not its numbered sections: ${legalLinks.map((a) => a.textContent).join('|')}`);
    const mark = legal.querySelector('h2#s1 > span');
    check(mark?.textContent === '§ 01' && cls(mark).includes(' text-oca-accent-ink ') && cls(mark).includes(' block ') && legal.querySelector('h2#s1')?.textContent === '§ 01What we store' && !legal.querySelector('h2#s2 > span'), 'LegalDocument: a numbered section has no "§ NN" mark over its heading, or an unnumbered one has one');
    check(!dom(h(C.LegalDocument, { doc })).querySelector('svg, [data-art]'), 'LegalDocument: draws art of its own');
    // The last word alone is set back, however many come before it; a one-word title is drawn whole.
    const terms = dom(h(C.LegalDocument, { doc: { ...doc, title: 'Terms of service' } })).querySelector('h1');
    check([...terms.children].map((x) => x.textContent).join('|') === 'Terms of|service' && cls(terms.lastElementChild).includes(' text-oca-subtle ') && !cls(terms.firstElementChild).includes(' text-oca-subtle '), `LegalDocument: "Terms of service" does not set "service" alone back: ${terms.outerHTML.slice(0, 200)}`);
    const one = dom(h(C.LegalDocument, { doc: { ...doc, title: 'Privacy' } })).querySelector('h1');
    check(one.children.length === 0 && one.textContent === 'Privacy', `LegalDocument: a one-word title is split: ${one.outerHTML.slice(0, 160)}`);
}

if (failures) {
    console.error(`\n${failures} render failure(s)`);
    process.exit(1);
}
console.log(`✓ render: ${checks} checks on the docs and tool components`);
