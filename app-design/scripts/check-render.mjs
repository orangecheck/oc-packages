#!/usr/bin/env node
/*
 * The docs components, rendered from the build to markup, doing what they
 * promise: code arrives highlighted in the server's HTML, the docs mark
 * where you are, and a context or a label reaches across entries. Run after `yarn build`.
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

if (failures) {
    console.error(`\n${failures} render failure(s)`);
    process.exit(1);
}
console.log(`✓ render: ${checks} checks on the docs components and the shared parts`);
