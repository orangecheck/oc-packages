#!/usr/bin/env node
/*
 * The keyboard, in Chrome, with real key presses:
 *
 * - A field in focus has an edge of 3:1 or more against the card and the
 *   page, in light and dark, one styled inline too, and no second ring; so
 *   does a composite field's box (chips and a bare input) while focus is
 *   inside it. An invalid one keeps its red. Under forced colours a field
 *   keeps an outline.
 * - On the orange closing band the focus ring is ink, not orange on orange.
 * - The sign-in page's first stop skips to the ceremony; every shell's skip
 *   link (AppShell's too) puts focus on its main, and so does a site's own
 *   plain <main>, even on a page that handles its own hash.
 * - A code block's scroll area and a tab's panel ring when reached; a
 *   focused control never sits under a sticky bar.
 * - The docs sidebar's open section closes from its own button.
 * - A dialog opened without a Trigger (confirm(), a dialog or sheet opened
 *   from state) hands focus back to what opened it.
 * - A page shortcut ("/") waits while a menu is open; ⌘K/Ctrl-K still toggles
 *   search from its own field. Focus is back on a dialog's opener within a
 *   frame of it closing.
 * - A message to sign, selected by hand (a range, a drag) and copied, is the
 *   exact bytes, its final LF too; a part selection copies as the browser
 *   would; the kept newline draws no line.
 * - Tab past a toast goes on to the page, not back to where it came from;
 *   sonner's alt+T still returns there.
 * - A highlighted menu or select item stands out from its neighbours at 3:1.
 * - A tab pressed with the mouse shows no ring; one reached by the keyboard does.
 * - Shift+Tab back through a docs table scrolled right brings each link, its
 *   ring included, inside the table's box.
 *
 * Run after `yarn build`.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundle, COLOUR_KIT, compileCss, findChrome, pkg, writePage } from './browser.mjs';

process.env.NODE_ENV = 'production';
const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/chrome.js'))) {
    console.error('✗ focus: dist is missing; run yarn build first');
    process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ focus: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ focus: ${msg}`);
        failures++;
    }
};
const show = (v) => JSON.stringify(v);

const src = (f) => join(pkg, 'src', f);
const SIGNED = 'oc-lock binding v3\naddress: bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t\nid: 86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c\n';
const dir = mkdtempSync(join(tmpdir(), 'app-design-focus-'));
try {
    const mount = (imports, jsx) => `${imports}\nimport { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(${jsx});\n`;
    const clients = {
        dialogs: mount(
            `import { useState } from 'react';\n` +
                `import { DialogHost, confirm } from '${src('primitives/dialogs.tsx')}';\n` +
                `import { Dialog, DialogContent, DialogTitle, Sheet, SheetContent, SheetTitle } from '${src('primitives/overlay.tsx')}';\n` +
                `function Page() {\n` +
                `  const [d, setD] = useState(false);\n` +
                `  const [s, setS] = useState(false);\n` +
                `  return <div className="flex gap-4 p-6">\n` +
                `    <DialogHost />\n` +
                `    <button id="ask" onClick={() => confirm({ title: 'Delete this stamp?', confirmLabel: 'Delete' }).then((v) => (window.__answer = v))}>Delete</button>\n` +
                `    <button id="details" onClick={() => setD(true)}>Details</button>\n` +
                `    <button id="sheet" onClick={() => setS(true)}>Filters</button>\n` +
                `    <Dialog open={d} onOpenChange={setD}><DialogContent aria-describedby={undefined}><DialogTitle>Details</DialogTitle></DialogContent></Dialog>\n` +
                `    <Sheet open={s} onOpenChange={setS}><SheetContent aria-describedby={undefined}><SheetTitle>Filters</SheetTitle></SheetContent></Sheet>\n` +
                `  </div>;\n` +
                `}`,
            '<Page />'
        ),
        toasts: mount(
            `import { useEffect } from 'react';\n` +
                `import { Toaster, toast } from '${src('primitives/feedback.tsx')}';\n` +
                `function Page() {\n` +
                `  useEffect(() => { toast('Saved', { duration: Infinity, action: { label: 'Undo', onClick() {} } }); }, []);\n` +
                `  return <div className="p-6"><button id="before">Before</button><Toaster /><button id="after">After</button></div>;\n` +
                `}`,
            '<Page />'
        ),
        menus: mount(
            `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '${src('primitives/overlay.tsx')}';\n` +
                `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '${src('primitives/form.tsx')}';\n` +
                `const which = new URLSearchParams(location.search).get('m');`,
            `which === 'select'\n` +
                `  ? <div className="p-6"><Select defaultOpen><SelectTrigger id="sel"><SelectValue placeholder="Network" /></SelectTrigger><SelectContent><SelectItem value="a">Mainnet</SelectItem><SelectItem value="b">Signet</SelectItem><SelectItem value="c">Testnet4</SelectItem></SelectContent></Select></div>\n` +
                `  : <div className="p-6"><DropdownMenu modal={false}><DropdownMenuTrigger id="menu">Actions</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Rename</DropdownMenuItem><DropdownMenuItem>Copy link</DropdownMenuItem><DropdownMenuItem>Forget</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>`
        ),
        tabs: mount(
            `import { Tabs, TabsList, TabsTrigger, TabsContent } from '${src('primitives/tabs.tsx')}';`,
            `<div className="p-6"><Tabs defaultValue="a"><TabsList>{['a', 'b', 'c'].map((v) => <TabsTrigger key={v} value={v} id={'t-' + v}>{'Tab ' + v}</TabsTrigger>)}</TabsList>{['a', 'b', 'c'].map((v) => <TabsContent key={v} value={v}>{'Panel ' + v}</TabsContent>)}</Tabs></div>`
        ),
        docsnav: mount(
            `import { DocsNav } from '${src('chrome/docs-shell.tsx')}';\n` +
                `const sections = [{ label: 'Getting started', items: [{ href: '/docs', label: 'Overview' }, { href: '/docs/quickstart', label: 'Quickstart' }] }, { label: 'Reference', items: [{ href: '/docs/api', label: 'API' }] }];`,
            `<div className="w-64 p-6"><DocsNav sections={sections} current="/docs/quickstart" /></div>`
        ),
        hotkeys: mount(
            `import { SearchDialog } from '${src('components/search.tsx')}';\n` +
                `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '${src('primitives/overlay.tsx')}';`,
            `<div className="flex gap-4 p-6"><SearchDialog onQuery={() => []} /><DropdownMenu modal={false}><DropdownMenuTrigger id="sites">All orangecheck sites</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>stamp</DropdownMenuItem><DropdownMenuItem>vote</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>`
        ),
        // A message to sign that ends in LF (lock's binding statement), beside the same lines without it.
        signing: mount(
            `import { SignMessage } from '${src('components/verify.tsx')}';\n` +
                `import { CodeBlock } from '${src('components/code-block.tsx')}';\n` +
                `const SIGNED = ${JSON.stringify(SIGNED)};`,
            `<div className="mx-auto flex max-w-[40rem] flex-col gap-6 p-4"><div data-sign=""><SignMessage address="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t" message={SIGNED} onSignature={() => {}} /></div>` +
                `<div data-nolf=""><CodeBlock code={SIGNED.slice(0, -1)} caption="Message to sign" wrap /></div><div data-lf=""><CodeBlock code={SIGNED} caption="Message to sign" wrap /></div></div>`
        ),
        ownmain: mount(`import { SkipLink } from '${src('chrome/site.tsx')}';`, `<><SkipLink /><header><a href="/">Home</a></header><main id="main-content"><p>The page</p><a href="/next">Next</a></main></>`),
        // A page that handles its own hash, as Swagger UI does: the browser never moves focus for the link.
        hashpage: mount(
            `import { SkipLink } from '${src('chrome/site.tsx')}';\n` +
                `document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href^="#"]'); if (a) e.preventDefault(); }, true);`,
            `<><SkipLink /><header><a href="/">Home</a></header><main id="main-content"><p>The API</p><a href="/next">Next</a></main></>`
        ),
        // A code block wider than its well, and tabs whose panel takes focus.
        panes: mount(
            `import { CodeBlock } from '${src('components/code-block.tsx')}';\n` +
                `import { Tabs, TabsList, TabsTrigger, TabsContent } from '${src('primitives/tabs.tsx')}';`,
            `<div className="flex max-w-md flex-col gap-6 p-6"><CodeBlock lang="bash" code={'curl -s https://stamp.ochk.io/api/v1/stamps/86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c | jq .envelope.signature'} />` +
                `<Tabs defaultValue="a"><TabsList><TabsTrigger value="a" id="ta">Envelope</TabsTrigger><TabsTrigger value="b">Proof</TabsTrigger></TabsList><TabsContent value="a" id="pa"><p>The envelope, as published.</p></TabsContent><TabsContent value="b"><p>The proof.</p></TabsContent></Tabs></div>`
        ),
        // A docs table wider than its column, links in its second and last columns.
        widetable: mount(
            `import { MdxTable } from '${src('components/docs.tsx')}';`,
            `<div className="w-[40rem] p-6"><MdxTable><thead><tr><th>Property</th><th>Type</th><th>Description</th><th>Defined in</th></tr></thead><tbody>{['FederationRevocationEnvelope', 'FederationDelegationEnvelope', 'RevocationEnvelope'].map((t, i) => <tr key={t}><td>{'revocations' + i}</td><td><a href={'#' + t}>{t}</a></td><td style={{ minWidth: '36rem' }}>Revocations to check (kind-30085 by #t with the delegation id): federation revocations, and the agent's own.</td><td><a href={'#src' + i}>{'agent-core/src/federation.ts:23' + i}</a></td></tr>)}</tbody></MdxTable></div>`
        ),
    };
    bundle(dir, clients);
    compileCss(dir, Object.keys(clients));
    const client = (name, q = '') => writePage(dir, name, '<div id="root"></div>', { script: `<script>${COLOUR_KIT}</script><script src="${name}.js"></script>` }) + q;

    // Server-rendered pages: fields, the band, the sign-in frame, the shells.
    const { createElement: h } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const P = require(join(pkg, 'dist/primitives.js'));
    const C = require(join(pkg, 'dist/components.js'));
    const Ch = require(join(pkg, 'dist/chrome.js'));
    const ssr = (name, el) => writePage(dir, name, renderToStaticMarkup(el), { script: `<script>${COLOUR_KIT}</script>` });
    const fields = ssr(
        'fields',
        h(
            'div',
            { className: 'flex flex-col gap-4 bg-background p-6' },
            h(P.Input, { 'data-f': 'input', placeholder: 'bc1q…' }),
            h(P.Textarea, { 'data-f': 'textarea', placeholder: 'A note' }),
            h(P.Select, null, h(P.SelectTrigger, { 'data-f': 'select' }, h(P.SelectValue, { placeholder: 'Network' }))),
            // A field styled inline, as the sign-in ceremony styles its own: the focus look still wins.
            h('input', { 'data-f': 'inline', 'data-oca-field': '', placeholder: 'you@example.com', style: { border: '1px solid var(--input)', borderRadius: 12, padding: '10px 14px', background: 'var(--card)' } }),
            // A composite field, as vault's tags are: chips and a bare input in one bordered box.
            h(
                'div',
                { 'data-oca-field-group': '', className: 'flex flex-wrap items-center gap-2 rounded-xl border border-input bg-card px-3 py-2' },
                h('span', { className: 'inline-flex items-center gap-1 rounded-full bg-muted px-2' }, 'bitcoin', h('button', { type: 'button', 'data-f': 'group', 'aria-label': 'Remove bitcoin' }, '×')),
                h('input', { 'data-f': 'group-input', 'aria-label': 'Tags', className: 'min-w-0 flex-1 bg-transparent outline-none' })
            ),
            h(P.Input, { 'data-f': 'invalid', 'aria-invalid': true, defaultValue: 'not an address' })
        )
    );
    const band = ssr(
        'band',
        h(C.Section, { tone: 'brand' }, h('p', null, h('a', { href: '/docs', 'data-b': 'link' }, 'Read the docs')), h(P.Button, { 'data-b': 'button' }, 'Get an account'))
    );
    const signin = ssr('signin', h(Ch.SignInFrame, { title: 'Sign in', protocol: 'stamp' }, h('input', { 'data-ceremony': '', 'aria-label': 'Email' })));
    const appNav = [{ items: [{ href: '/me', label: 'Home', active: true }, { href: '/me/activity', label: 'Activity' }, { href: '/me/balance', label: 'Balance' }] }];
    const shells = [
        ['ToolShell', ssr('tool', h(Ch.ToolShell, { protocol: 'stamp', tools: [] }, h('p', null, 'page')))],
        ['DocsShell', ssr('docs', h(Ch.DocsShell, { nav: [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }] }], current: '/docs', toc: [] }, h('p', null, 'page')))],
        ['AppShell', ssr('appshell', h(Ch.AppShell, { product: 'ochk.app', nav: appNav }, h('p', null, 'page')))],
        ['AppShell rail', ssr('apprail', h(Ch.AppShell, { variant: 'rail', header: h('header', null, h('a', { href: '/' }, 'chat')), nav: appNav }, h('p', null, 'page')))],
    ];
    // A long tool page: every control further down than the window, under a sticky bar.
    const tall = ssr('tall', h(Ch.ToolShell, { protocol: 'stamp', tools: [] }, h('div', { className: 'flex flex-col gap-12' }, ...Array.from({ length: 24 }, (_, i) => h('button', { key: i, type: 'button', 'data-n': i, className: 'h-10 w-40 rounded-full border' }, `Copy ${i + 1}`)))));
    const tallDocs = ssr('tall-docs', h(Ch.DocsShell, { nav: [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }] }], current: '/docs', toc: [] }, h('div', { className: 'flex flex-col gap-12' }, ...Array.from({ length: 24 }, (_, i) => h('button', { key: i, type: 'button', 'data-n': i, className: 'h-10 w-40 rounded-full border' }, `Copy ${i + 1}`)))));

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    // A slow runner can still be mid-transition after any fixed wait: let every running transition finish.
    const settled = (p) => p.evaluate(() => Promise.all(document.getAnimations().filter((a) => a instanceof CSSTransition).map((a) => a.finished.catch(() => {}))));
    const active = (p) =>
        p.evaluate(() => {
            const e = document.activeElement;
            if (e === document.body) return 'the page body';
            return e ? e.id || e.getAttribute('data-f') || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24) || e.tagName : 'none';
        });
    try {
        const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });

        // Fields: the focused edge against the field's own ground and the page's, in both modes.
        for (const dark of [false, true]) {
            await p.goto(fields);
            await p.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
            for (const f of ['input', 'textarea', 'select', 'inline', 'group', 'group-input', 'invalid']) {
                await p.keyboard.press('Tab');
                // Read the edge after its transition, not halfway.
                await p.waitForTimeout(300);
                await settled(p);
                const got = await p.evaluate((f) => {
                    const focused = document.activeElement;
                    if (focused?.getAttribute('data-f') !== f) return { focused: focused?.getAttribute('data-f') ?? focused?.tagName };
                    // In a composite field the edge is the box's, wherever inside it focus is.
                    const el = focused.closest('[data-oca-field-group]') ?? focused;
                    const page = __rgb(getComputedStyle(el.closest('.bg-background')).backgroundColor);
                    const ground = __rgb(getComputedStyle(el).backgroundColor, `rgb(${page.join()})`);
                    const edge = getComputedStyle(el).borderTopColor;
                    const drawn = __rgb(edge, `rgb(${ground.join()})`);
                    // The page's own focus outline would ring it a second time.
                    const cs = getComputedStyle(el);
                    const second = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && __rgb(cs.outlineColor, 'rgb(1, 2, 3)').join() !== '1,2,3';
                    // The focus look itself, not a resting border that happens to pass: a shadow ring at 3:1 on the field.
                    const ringed = Math.max(0, ...__layers(cs.boxShadow).map((l) => __contrast(__rgb(l.colour, `rgb(${ground.join()})`), ground)));
                    return { focused: f, card: __contrast(drawn, ground), page: __contrast(drawn, page), edge, second, ringed };
                }, f);
                const mode = dark ? 'dark' : 'light';
                if (got.focused !== f) {
                    check(false, `[${mode}] Tab reached ${show(got.focused)}, not the ${f} field`);
                    continue;
                }
                check(got.card >= 3 && got.page >= 3, `[${mode}] ${f} in focus: its edge is ${got.card.toFixed(2)}:1 on the field, ${got.page.toFixed(2)}:1 on the page (${got.edge})`);
                check(!got.second, `[${mode}] ${f} in focus: the page's outline rings it a second time`);
                check(got.ringed >= 3, `[${mode}] ${f} in focus: no ring of 3:1 drawn round it (strongest ${got.ringed.toFixed(2)}:1)`);
            }
            // The invalid field keeps the destructive edge in focus.
            const red = await p.evaluate(() => {
                const el = document.querySelector('[data-f="invalid"]');
                const probe = document.createElement('i');
                probe.style.color = 'var(--destructive)';
                el.parentElement.append(probe);
                return { edge: getComputedStyle(el).borderTopColor, token: getComputedStyle(probe).color };
            });
            check(red.edge === red.token, `[${dark ? 'dark' : 'light'}] an invalid field in focus lost its red edge (${red.edge}, want ${red.token})`);
        }

        // Forced colours drop the shadow: a field in focus keeps an outline the system can paint.
        {
            const fc = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: 'active' });
            const q = await fc.newPage();
            await q.goto(fields);
            await q.keyboard.press('Tab');
            await q.waitForTimeout(300);
            const o = await q.evaluate(() => {
                const cs = getComputedStyle(document.activeElement);
                return { f: document.activeElement.getAttribute('data-f'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
            });
            check(o.f === 'input' && o.style !== 'none' && o.width >= 2, `forced colours: a field in focus has no outline to paint (${show(o)})`);
            await fc.close();
        }

        // The orange band: a focused link and button draw their ring in ink.
        for (const dark of [false, true]) {
            await p.goto(band);
            await p.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
            for (const b of ['link', 'button']) {
                await p.keyboard.press('Tab');
                await p.waitForTimeout(300);
                await settled(p);
                const got = await p.evaluate(() => {
                    const el = document.activeElement;
                    const section = el.closest('section');
                    const bg = __rgb(getComputedStyle(section).backgroundColor);
                    const cs = getComputedStyle(el);
                    const ring = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px' ? cs.outlineColor : __ring(cs.boxShadow);
                    return { b: el.getAttribute('data-b'), ring, contrast: ring ? __contrast(__rgb(ring, `rgb(${bg.join()})`), bg) : 1 };
                });
                check(got.b === b && got.contrast >= 3, `[${dark ? 'dark' : 'light'}] band ${b}: the focus ring is ${got.contrast?.toFixed(2)}:1 on the orange (${got.ring})`);
            }
        }

        // Sign-in: the first stop skips to the ceremony, and lands there.
        await p.goto(signin);
        await p.keyboard.press('Tab');
        const first = await p.evaluate(() => ({ text: document.activeElement.textContent.trim(), href: document.activeElement.getAttribute('href') }));
        let landed = null;
        let next = false;
        // Enter on any other first stop would leave the page.
        if (first.href === '#signin') {
            await p.keyboard.press('Enter');
            landed = await active(p);
            await p.keyboard.press('Tab');
            next = await p.evaluate(() => document.activeElement.hasAttribute('data-ceremony'));
        }
        check(first.href === '#signin' && landed === 'signin' && next, `SignInFrame: Tab 1 is ${show(first)}, Enter lands on ${show(landed)}, the next Tab reaches the ceremony ${next}`);

        // The shells' skip link puts focus on main; a site's own plain main too.
        for (const [name, url] of [...shells, ['a site’s own main', client('ownmain')], ['a page that handles its own hash', client('hashpage')]]) {
            await p.goto(url);
            await p.waitForSelector('main', { state: 'attached' });
            await p.waitForTimeout(100);
            if (!(await p.$('a[href="#main-content"]'))) {
                check(false, `${name}: no skip link to the page`);
                continue;
            }
            await p.keyboard.press('Tab');
            const skip = await p.evaluate(() => document.activeElement.getAttribute('href'));
            await p.keyboard.press('Enter');
            const got = await p.evaluate(() => ({ main: document.activeElement?.tagName === 'MAIN', ring: getComputedStyle(document.activeElement).outlineStyle }));
            check(skip === '#main-content' && got.main && got.ring === 'none', `${name}: the skip link (${skip}) leaves focus ${got.main ? 'on main' : 'off main'}, outline ${got.ring}`);
        }

        // A code block's scroll area and a tab's panel: each draws a ring when the keyboard reaches it, inside its own edge.
        await p.goto(client('panes'));
        await p.waitForSelector('#ta');
        const ringOf = (sel) =>
            p.evaluate((sel) => {
                const el = document.activeElement;
                if (!el || !el.matches(sel)) return { reached: false, who: el?.tagName };
                const cs = getComputedStyle(el);
                const drawn = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
                // An outside ring is cut away when a rounded frame around it clips.
                let clip = el.parentElement;
                while (clip && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement;
                const r = el.getBoundingClientRect();
                const c = clip ? clip.getBoundingClientRect() : { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
                const off = parseFloat(cs.outlineOffset) || 0;
                const w = parseFloat(cs.outlineWidth) || 0;
                const outer = { left: r.left - off - w, top: r.top - off - w, right: r.right + off + w, bottom: r.bottom + off + w };
                const inside = outer.left >= c.left - 0.5 && outer.top >= c.top - 0.5 && outer.right <= c.right + 0.5 && outer.bottom <= c.bottom + 0.5;
                return { reached: true, drawn, inside, style: cs.outlineStyle, offset: cs.outlineOffset, shadow: cs.boxShadow.slice(0, 40) };
            }, sel);
        await p.keyboard.press('Tab');
        await p.keyboard.press('Tab');
        await p.waitForTimeout(150);
        const code = await ringOf('[tabindex="0"]');
        check(code.reached && code.drawn && code.inside, `CodeBlock: its scroll area, reached by Tab, draws no ring a reader can see (${JSON.stringify(code)})`);
        await p.focus('#ta');
        await p.keyboard.press('Tab');
        await p.waitForTimeout(150);
        const panel = await ringOf('[role="tabpanel"]');
        check(panel.reached && panel.drawn, `TabsContent: the panel, reached by Tab, has no focus ring (${JSON.stringify(panel)})`);
        // A table scrolled right: Shift+Tab back through its links brings each one, ring and all, inside the scroller.
        await p.goto(client('widetable'));
        await p.waitForSelector('table a');
        await p.evaluate(() => {
            // The last link focused, then the table scrolled so the type links show only their right part, as the docs page had it.
            const sc = document.querySelector('table').parentElement;
            const links = [...document.querySelectorAll('table a')];
            links.at(-1).focus();
            const a = links.at(-2).getBoundingClientRect();
            sc.scrollLeft += a.left + a.width * 0.6 - sc.getBoundingClientRect().left;
        });
        const steps = [];
        for (let i = 0; i < 6; i++) {
            await p.keyboard.press('Shift+Tab');
            await p.waitForTimeout(150);
            steps.push(
                await p.evaluate(() => {
                    const e = document.activeElement;
                    const sc = e.closest('table')?.parentElement;
                    if (!sc) return null;
                    const cs = getComputedStyle(e);
                    const ring = (parseFloat(cs.outlineOffset) || 0) + (parseFloat(cs.outlineWidth) || 0);
                    const r = e.getBoundingClientRect();
                    const v = sc.getBoundingClientRect();
                    return { t: e.textContent, inside: r.left - ring >= v.left - 0.5 && r.right + ring <= v.right + 0.5, at: [Math.round(r.left), Math.round(r.right)], box: [Math.round(v.left), Math.round(v.right)] };
                })
            );
        }
        const walked = steps.filter(Boolean);
        check(walked.length === 5 && walked.every((x) => x.inside), `MdxTable: Shift+Tab back through a table scrolled right leaves a link outside its box (${JSON.stringify(walked.filter((x) => !x.inside))}, ${walked.length} stops)`);

        // A control the keyboard reaches is never left under a sticky bar: a tool page at a desk, the docs on a phone.
        for (const [name, url, vw] of [
            ['ToolShell', tall, 1280],
            ['DocsShell', tallDocs, 390],
        ]) {
            const q = await browser.newPage({ viewport: { width: vw, height: 800 } });
            await q.goto(url);
            await q.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await q.focus('[data-n="23"]');
            const hidden = [];
            let scrolled = 0;
            // Far enough up that every step past the window's top must scroll.
            for (let i = 0; i < 16; i++) {
                await q.keyboard.press('Shift+Tab');
                await q.waitForTimeout(80);
                const r = await q.evaluate(() => {
                    const el = document.activeElement;
                    // Any bar stuck across the top, whatever it is called: a sticky element as wide as half the window.
                    const bars = [...document.querySelectorAll('body *')].filter((b) => {
                        if (getComputedStyle(b).position !== 'sticky') return false;
                        const r = b.getBoundingClientRect();
                        return r.width > innerWidth / 2 && r.top < 200 && r.height > 0;
                    });
                    const under = Math.max(0, ...bars.map((b) => b.getBoundingClientRect().bottom));
                    return { n: el.getAttribute('data-n'), top: Math.round(el.getBoundingClientRect().top), under: Math.round(under), y: scrollY };
                });
                if (r.n !== null && r.top < r.under) hidden.push(r);
                scrolled = Math.max(scrolled, r.y);
            }
            const moved = await q.evaluate(() => scrollY);
            check(hidden.length === 0 && moved < scrolled, `${name} at ${vw}: a focused control scrolled in under the sticky bar (${JSON.stringify(hidden.slice(0, 2))}; the page scrolled from ${scrolled} to ${moved})`);
            await q.close();
        }

        // SignMessage: select the whole message by hand, copy, and the clipboard holds the exact bytes, its final LF too.
        for (const vw of [390, 1440]) {
            const ctx = await browser.newContext({ viewport: { width: vw, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
            const q = await ctx.newPage();
            await q.goto(client('signing'));
            await q.waitForSelector('[data-sign] pre code [data-line]');
            const copyOf = async (how) => {
                await q.evaluate(() => navigator.clipboard.writeText('(nothing copied)'));
                if (how === 'range') {
                    await q.evaluate(() => {
                        const r = document.createRange();
                        r.selectNodeContents(document.querySelector('[data-sign] pre code'));
                        const sel = getSelection();
                        sel.removeAllRanges();
                        sel.addRange(r);
                    });
                } else {
                    // A drag from the first character to below the last line, as a reader selects it.
                    const box = await q.evaluate(() => {
                        const pre = document.querySelector('[data-sign] pre');
                        const first = pre.querySelector('[data-line]').getBoundingClientRect();
                        const p = pre.getBoundingClientRect();
                        return { x0: first.left + 20, y0: first.top + first.height / 2, x1: p.right - 8, y1: p.bottom - 4 };
                    });
                    await q.mouse.move(box.x0, box.y0);
                    await q.mouse.down();
                    await q.mouse.move(box.x1, box.y1, { steps: 8 });
                    await q.mouse.up();
                }
                await q.keyboard.press('Control+C');
                return q.evaluate(() => navigator.clipboard.readText());
            };
            for (const how of ['range', 'drag']) {
                const got = await copyOf(how);
                check(got === SIGNED, `[${vw}] SignMessage: a hand selection (${how}) copies ${JSON.stringify(got.slice(-24))}, not the exact bytes ending ${JSON.stringify(SIGNED.slice(-24))}`);
            }
            // Part of the message selected: the browser's own copy, untouched.
            await q.evaluate(() => {
                const line = document.querySelector('[data-sign] pre code [data-line]');
                const r = document.createRange();
                r.selectNodeContents(line);
                const sel = getSelection();
                sel.removeAllRanges();
                sel.addRange(r);
            });
            await q.keyboard.press('Control+C');
            const part = await q.evaluate(() => navigator.clipboard.readText());
            check(part === 'oc-lock binding v3', `[${vw}] CodeBlock: a part selection copies ${JSON.stringify(part)}, not just the line`);
            const wells = await q.evaluate(() => ['nolf', 'lf'].map((k) => Math.round(document.querySelector(`[data-${k}] pre`).getBoundingClientRect().height)));
            check(wells[0] === wells[1], `[${vw}] CodeBlock: the kept final newline draws an extra line (${wells[1]}px against ${wells[0]}px)`);
            await ctx.close();
        }

        // DocsNav: the open section's button closes it, and opens it again.
        await p.goto(client('docsnav'));
        const sectionBtn = p.locator('nav[aria-label="Docs"] button').first();
        await sectionBtn.waitFor();
        await sectionBtn.focus();
        const states = [await sectionBtn.getAttribute('aria-expanded')];
        await p.keyboard.press('Enter');
        states.push(await sectionBtn.getAttribute('aria-expanded'), String(await p.locator('nav[aria-label="Docs"] ul').first().isHidden()));
        await p.keyboard.press('Enter');
        states.push(await sectionBtn.getAttribute('aria-expanded'));
        check(states.join() === 'true,false,true,true', `DocsNav: the open section's button reads ${states.join()} (want true, false and hidden, true)`);

        // Dialogs opened from state hand focus back to their opener.
        await p.goto(client('dialogs'));
        await p.waitForSelector('#ask');
        for (const opener of ['ask', 'details', 'sheet']) {
            await p.focus(`#${opener}`);
            await p.keyboard.press('Enter');
            await p.waitForSelector('[role="dialog"], [role="alertdialog"]');
            await p.keyboard.press('Escape');
            // Focus is back within a frame of the dialog leaving, not after an exit animation.
            const back = await p.evaluate(
                () =>
                    new Promise((done) => {
                        const gone = () => !document.querySelector('[role="dialog"], [role="alertdialog"]');
                        const t0 = performance.now();
                        const tick = () => {
                            if (gone()) requestAnimationFrame(() => setTimeout(() => done({ id: document.activeElement?.id || document.activeElement?.tagName, ms: Math.round(performance.now() - t0) }), 0));
                            else if (performance.now() - t0 > 3000) done({ id: 'still open', ms: 3000 });
                            else requestAnimationFrame(tick);
                        };
                        tick();
                    })
            );
            check(back.id === opener && back.ms < 500, `${opener}: a frame after the dialog left, focus is on ${show(back.id)} (${back.ms}ms after Escape), not its opener`);
        }

        // A page shortcut waits for an open menu: "/" over ochk.io/docs' sites menu opened search on top of it.
        await p.goto(client('hotkeys'));
        await p.waitForSelector('#sites');
        const searching = () => p.evaluate(() => Boolean(document.querySelector('[role="dialog"] input')));
        await p.focus('#sites');
        await p.keyboard.press('Enter');
        await p.waitForSelector('[role="menu"]');
        await p.keyboard.press('/');
        await p.waitForTimeout(150);
        const overMenu = await searching();
        await p.keyboard.press('Escape');
        await p.waitForSelector('[role="menu"]', { state: 'detached' });
        await p.keyboard.press('/');
        await p.waitForTimeout(150);
        const fromPage = await searching();
        // ⌘K/Ctrl-K closes it again from its own field.
        await p.keyboard.press('Control+KeyK');
        await p.waitForTimeout(250);
        const toggled = !(await searching());
        check(!overMenu && fromPage && toggled, `SearchDialog: "/" over an open menu opened search (${overMenu}); from the page ${fromPage}; Ctrl-K from its field closed it ${toggled}`);

        // Toasts: Tab goes on past them; alt+T and a Tab out still go back.
        await p.goto(client('toasts'));
        await p.waitForSelector('[data-sonner-toast]');
        await p.waitForTimeout(400);
        await p.focus('#before');
        const walk = [];
        for (let i = 0; i < 6 && walk.at(-1) !== 'after'; i++) {
            await p.keyboard.press('Tab');
            walk.push(await active(p));
        }
        check(walk.includes('after'), `Toaster: Tab from before the toast walks ${walk.join(' → ')} and never gets past it`);
        await p.focus('#before');
        await p.keyboard.press('Alt+KeyT');
        const listed = await p.evaluate(() => document.activeElement?.hasAttribute('data-sonner-toaster'));
        for (let i = 0; i < 4 && (await active(p)) !== 'before'; i++) await p.keyboard.press('Tab');
        check(listed && (await active(p)) === 'before', `Toaster: alt+T no longer returns to where it came from (list focused ${listed}, now ${show(await active(p))})`);

        // A highlighted item: a 3:1 edge against the menu, light and dark.
        for (const m of ['menu', 'select']) {
            for (const dark of [false, true]) {
                await p.goto(client('menus', `?m=${m}`));
                await p.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark);
                if (m === 'menu') {
                    await p.focus('#menu');
                    await p.keyboard.press('Enter');
                }
                await p.waitForSelector(m === 'menu' ? '[role="menuitem"]' : '[role="option"]');
                await p.keyboard.press('ArrowDown');
                await p.waitForSelector('[data-highlighted]');
                await p.waitForTimeout(300);
                await settled(p);
                const got = await p.evaluate(() => {
                    const el = document.querySelector('[data-highlighted]');
                    const pop = __rgb(getComputedStyle(el.closest('[role="menu"], [role="listbox"]')).backgroundColor);
                    const shadow = getComputedStyle(el).boxShadow;
                    const ring = __ring(shadow);
                    const fill = __rgb(getComputedStyle(el).backgroundColor, `rgb(${pop.join()})`);
                    const edge = ring ? __contrast(__rgb(ring, `rgb(${fill.join()})`), pop) : __contrast(fill, pop);
                    return { edge, shadow };
                });
                check(got.edge >= 3, `[${dark ? 'dark' : 'light'}] ${m}: the highlighted item stands out ${got.edge.toFixed(2)}:1 from the menu (${got.shadow})`);
            }
        }

        // Tabs: a press shows no ring; the keyboard does.
        await p.goto(client('tabs'));
        await p.waitForSelector('#t-b');
        const ringOn = (id) => p.evaluate((id) => __ring(getComputedStyle(document.getElementById(id)).boxShadow) !== null, id);
        const box = await p.locator('#t-b').boundingBox();
        await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await p.waitForTimeout(300);
        await settled(p);
        const pressed = { focused: await active(p), ring: await ringOn('t-b') };
        await p.keyboard.press('ArrowRight');
        // Radix moves focus on a timer.
        await p.waitForTimeout(300);
        await settled(p);
        const keyed = { focused: await active(p), ring: await ringOn('t-c') };
        const box2 = await p.locator('#t-a').boundingBox();
        await p.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
        await p.waitForTimeout(300);
        await settled(p);
        const again = { focused: await active(p), ring: await ringOn('t-a') };
        check(pressed.focused === 't-b' && !pressed.ring, `Tabs: a first press shows the ring (${show(pressed)})`);
        check(keyed.focused === 't-c' && keyed.ring, `Tabs: ArrowRight reaches a tab with no ring (${show(keyed)})`);
        check(again.focused === 't-a' && !again.ring, `Tabs: a press after the keyboard shows the ring (${show(again)})`);
        await p.close();
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} focus failure(s)`);
    process.exit(1);
}
console.log(`✓ focus: ${checks} checks in Chrome; field edges at 3:1, ink rings on the band, skip links that land, a docs section that closes, focus back from dialogs, Tab past toasts, highlighted items at 3:1, tabs ringed only from the keyboard`);
