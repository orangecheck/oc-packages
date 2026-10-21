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

// CodeBlock: highlighted on the server, marks and diff drawn, the sign not in the text.
{
    const out = html(h(C.CodeBlock, { code: 'const a = 1;\nverify(a);', lang: 'ts', highlight: '2' }));
    check(out.includes('class="oca-k">const<'), 'CodeBlock: code is not highlighted in the server markup');
    check(/data-mark="">[^\n]*verify/.test(out) && !/data-mark="">const/.test(out), 'CodeBlock: the wrong line is marked');
    check(out.includes('>TypeScript<'), 'CodeBlock: the caption does not default to the language');
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
    check(/<tr class="[^"]*relative[^"]*"><td[^>]*><a class="[^"]*after:absolute after:inset-0[^"]*" href="\/people\/a1">Ada<\/a><\/td>/.test(linked), 'DataTable rowHref: the primary cell is not the row\'s link');
    check(/<td class="[^"]*\[&amp;_button\]:z-10[^"]*"><button/.test(linked), 'DataTable rowHref: a control in another cell would sit under the row link');
    check((linked.match(/href="\/people\/a1"/g) ?? []).length === 2, 'DataTable rowHref: the phone card has no link');
    check(/<button type="button" class="[^"]*after:inset-0[^"]*">Ada<\/button>/.test(html(h(C.DataTable, { columns: cols, rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id, onRowSelect: () => {} }))), 'DataTable onRowSelect: no row button');
    check(!html(h(C.DataTable, { columns: cols, rows: [{ name: 'Ada', id: 'a1' }], rowKey: (r) => r.id })).includes('after:inset-0'), 'DataTable: a plain table grew row links');
    // ComparisonTable: a last row of actions; Closing: small print.
    const cmp = html(h(C.ComparisonTable, { label: 'x', columns: [{ key: 'oc', label: 'OC Stamp', highlight: true, action: h('a', { href: '/stamp' }, 'Use OC Stamp') }, { key: 'pgp', label: 'PGP' }], rows: [{ label: 'Anchored', values: { oc: 'Yes', pgp: 'No' } }] }));
    check(cmp.includes('>Use OC Stamp</a>') && (cmp.match(/<li/g) ?? []).length === 3, 'ComparisonTable: no action row');
    check(html(h(C.Closing, { title: 't', fineprint: h('span', { 'data-fine': '' }, 'credit') })).includes('data-fine'), 'Closing: no fineprint');
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

// The MDX map: TypeDoc's h5 and h6, and GitHub task lists.
{
    check(html(h(mdxComponents.h5, null, 'Returns')).startsWith('<h5'), 'mdx: no h5');
    check(html(h(mdxComponents.h6, null, 'x')).startsWith('<h6'), 'mdx: no h6');
    const tasks = html(h(mdxComponents.ul, { className: 'contains-task-list' }, h(mdxComponents.li, { className: 'task-list-item' }, h(mdxComponents.input, { type: 'checkbox', checked: true, disabled: true }), 'Ship')));
    check(/<ul class="[^"]*list-none/.test(tasks) && tasks.includes('aria-label="Done"'), 'mdx: a task list keeps its bullets or its box has no name');
    // Outside a router a relative link is left as written.
    check(html(h(C.TextLink, { href: '../README' }, 'up')).includes('href="../README"'), 'TextLink: a relative href is changed without a router');
}

// 1.4.1: home off a tool site's own /, phones, and the signing scheme in words.
{
    const href = (o) => o.match(/<a [^>]*href="([^"]*)"[^>]*>Go home</)?.[1];
    check(href(html(h(C.ErrorPage, {}))) === 'https://ochk.io', 'ErrorPage: home is not ochk.io by default');
    check(href(html(h(C.ErrorPage, { protocol: 'vote' }))) === 'https://ochk.io/vote', 'ErrorPage: protocol does not set home');
    const inShell = html(h(Ch.ToolShell, { protocol: 'lock', tools: [] }, h(C.ErrorPage, {})));
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
}

// A context set in one entry reaches a reader in another (each entry is bundled on its own).
{
    const sections = [{ id: 'you', label: 'You', href: '/me', groups: [{ items: [{ href: '/me', label: 'Home', active: true }] }] }];
    const out = html(h(Ch.AppShell, { sections }, h(C.PageHeader, { title: 'Home' })));
    check(/class="oca-eyebrow">You</.test(out), 'AppShell (chrome) does not reach PageHeader (components): the section eyebrow is missing');
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

// The account control.
{
    const checking = html(h(Ch.SessionAccountView, { state: 'checking', signInHref: '/signin' }));
    check(checking.includes('invisible') && checking.includes('aria-hidden="true"'), 'Session: checking does not hold its place unseen');
    const out = html(h(Ch.SessionAccountView, { state: 'out', signInHref: 'https://ochk.io/signin?return_to=x' }));
    check(out.includes('href="https://ochk.io/signin?return_to=x"') && out.includes('Sign in'), 'Session: signed out has no sign-in');
    // In place: the route on the server (the address is read in the browser); outside a router, the bare page.
    const inPlace = html(h(Ch.SessionAccountView, { state: 'out', signInPath: '/signin' }));
    check(inPlace.includes('href="/signin"'), 'Session: signInPath does not reach the sign-in link');
    const given = html(h(Ch.SessionAccountView, { state: 'out', signInPath: '/signin', signInHref: 'https://ochk.io/signin' }));
    check(given.includes('href="https://ochk.io/signin"'), 'Session: signInHref does not win over signInPath');
    const unknown = html(h(Ch.SessionAccountView, { state: 'unknown', signInHref: '/signin' }));
    check(unknown.includes('https://ochk.app/me/account'), 'Session: a failed check does not offer the account page');
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
}

// The parts a signed-in page repeats.
{
    const title = html(h(C.SectionTitle, { title: 'Backers', meta: '12 of 40', description: 'Who stands behind it.', action: h('a', { href: '/all' }, 'View all') }));
    check(/<h2[^>]*>Backers<span[^>]*>12 of 40<\/span><\/h2>/.test(title), 'SectionTitle: the count is not read with the title');
    check(title.includes('Who stands behind it.') && title.includes('href="/all"'), 'SectionTitle: the line or the action is missing');
    check(html(h(C.SectionTitle, { title: 'Delete', as: 'h3', size: 'sm', tone: 'danger' })).match(/<h3 class="[^"]*oca-title-sm[^"]*text-destructive/), 'SectionTitle: as, size or tone ignored');
    const list = html(h(C.ListCard, null, h('li', null, 'a'), h('li', null, 'b')));
    check(/^<ul class="[^"]*divide-y[^"]*rounded-\[1\.25rem\][^"]*"><li>a<\/li><li>b<\/li><\/ul>$/.test(list), 'ListCard: not a list in one card');
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
    const link = row.match(/^<li class="[^"]*group\/row[^"]*relative[^"]*"><a ([^>]*)>/)?.[1] ?? '';
    check(link.includes('href="/messages/1"') && link.includes('aria-current="true"'), 'ListRow: not one link, marked current');
    check(/<\/a><div[^>]*><button type="button" data-act="">/.test(row) && !/<a [^>]*>(?:(?!<\/a>)[\s\S])*data-act/.test(row), 'ListRow: the actions sit inside the link');
    check(/font-semibold[^"]*">Ada<\/span><span[^>]*>2m<\/span>/.test(row) && row.includes('text-foreground">The keys'), 'ListRow: unread does not set the title bold and the line in ink, or the meta is not beside the title');
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
    check(cta.includes(`href="${F.GET_AN_ACCOUNT.href}"`) && cta.includes(`>${F.GET_AN_ACCOUNT.label}</a>`) && F.GET_AN_ACCOUNT.href === 'https://ochk.app/signin', 'AccountCta: not the registry\'s phrase to ochk.app\'s sign-in');
    // The account phrase looks the same wherever it shows: primary, as AccountCta draws it. "Sign in" stays secondary.
    const view = (props) => html(h(Ch.SessionAccountView, { state: 'out', signInHref: '/x', ...props }));
    const btn = (out) => out.match(/<a [^>]*class="([^"]*)"/)?.[1] ?? '';
    check(/\bbg-primary\b/.test(btn(view({ signInLabel: F.GET_AN_ACCOUNT.label }))) && /\bbg-primary\b/.test(btn(cta)), 'SessionAccountView: the account phrase is not drawn as AccountCta draws it');
    check(/\bbg-secondary\b/.test(btn(view({}))) && !/\bbg-primary\b/.test(btn(view({}))), 'SessionAccountView: "Sign in" changed its look');
    check(/\bbg-secondary\b/.test(btn(view({ signInLabel: F.GET_AN_ACCOUNT.label, signInVariant: 'secondary' }))), 'SessionAccountView: signInVariant is ignored');
    // Typed as a string, so it passes where a string label is asked for.
    check(/label: "Get an account"/.test(require('node:fs').readFileSync(join(here, '../dist/family.d.ts'), 'utf8') + require('node:fs').readdirSync(join(here, '../dist')).filter((f) => /^index-.*\.d\.ts$/.test(f)).map((f) => require('node:fs').readFileSync(join(here, '../dist', f), 'utf8')).join('')), 'GET_AN_ACCOUNT: its label is not typed as the string it is');
    check(html(h(Ch.AccountCta, { href: '/signin' })).includes('href="/signin"'), 'AccountCta: ochk.app cannot point it at its own sign-in');
    const frame = html(h(Ch.SignInFrame, { protocol: 'stamp' }, h('p', null, 'ceremony')));
    check(/h-5 w-px[^>]*><\/span><span[^>]*>stamp<\/span>/.test(frame), 'SignInFrame: a tool site\'s sign-in does not carry its word');
    check(html(h(Ch.SignInFrame, { product: 'ochk.app' }, 'x')).includes('>ochk.app</span>'), 'SignInFrame: product is ignored');
    check(!/h-5 w-px/.test(html(h(Ch.SignInFrame, {}, 'x'))), 'SignInFrame: ochk.io\'s sign-in grew a word');
}

if (failures) {
    console.error(`\n${failures} render failure(s)`);
    process.exit(1);
}
console.log(`✓ render: ${checks} checks on the docs and tool components`);
