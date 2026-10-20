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

if (failures) {
    console.error(`\n${failures} render failure(s)`);
    process.exit(1);
}
console.log(`✓ render: ${checks} checks on the docs and tool components`);
