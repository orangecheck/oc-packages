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
    check(out.includes('href="https://ochk.io/stamp"') && out.includes('About stamp'), 'ToolShell: no way to the protocol page');
    check(out.includes('data-oca-tabbar'), 'ToolShell: three tools with icons get no tab bar');
    check(out.includes('data-size="sm"'), 'ToolShell: fields are not compact inside it');
    check(out.includes('aria-label="Legal"'), 'ToolShell: the footer has no legal row');
    const app = html(h(Ch.ToolShell, { protocol: 'lock', tools, variant: 'app' }, h('p', null, 'inbox')));
    check(!app.includes('<footer') && !app.includes('data-oca-tabbar'), 'ToolShell app: a footer or tab bar is drawn');
    check(html(h(P.Input, { 'aria-label': 'x' })).includes('data-size="md"'), 'Input: default size is not md outside a tool');
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
    const unknown = html(h(Ch.SessionAccountView, { state: 'unknown', signInHref: '/signin' }));
    check(unknown.includes('https://ochk.app/me/account'), 'Session: a failed check does not offer the account page');
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

if (failures) {
    console.error(`\n${failures} render failure(s)`);
    process.exit(1);
}
console.log(`✓ render: ${checks} checks on the docs and tool components`);
