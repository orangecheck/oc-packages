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
 *   link puts focus on its main, and so does a site's own plain <main>.
 * - The docs sidebar's open section closes from its own button.
 * - A dialog opened without a Trigger (confirm(), a dialog or sheet opened
 *   from state) hands focus back to what opened it.
 * - Tab past a toast goes on to the page, not back to where it came from;
 *   sonner's alt+T still returns there.
 * - A highlighted menu or select item stands out from its neighbours at 3:1.
 * - A tab pressed with the mouse shows no ring; one reached by the keyboard does.
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
        ownmain: mount(`import { SkipLink } from '${src('chrome/site.tsx')}';`, `<><SkipLink /><header><a href="/">Home</a></header><main id="main-content"><p>The page</p><a href="/next">Next</a></main></>`),
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
    const shells = [
        ['ToolShell', ssr('tool', h(Ch.ToolShell, { protocol: 'stamp', tools: [] }, h('p', null, 'page')))],
        ['DocsShell', ssr('docs', h(Ch.DocsShell, { nav: [{ label: 'Start', items: [{ href: '/docs', label: 'Overview' }] }], current: '/docs', toc: [] }, h('p', null, 'page')))],
    ];

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
        for (const [name, url] of [...shells, ['a site’s own main', client('ownmain')]]) {
            await p.goto(url);
            await p.waitForSelector('a[href="#main-content"]', { state: 'attached' });
            await p.keyboard.press('Tab');
            const skip = await p.evaluate(() => document.activeElement.getAttribute('href'));
            await p.keyboard.press('Enter');
            const got = await p.evaluate(() => ({ main: document.activeElement?.tagName === 'MAIN', ring: getComputedStyle(document.activeElement).outlineStyle }));
            check(skip === '#main-content' && got.main && got.ring === 'none', `${name}: the skip link (${skip}) leaves focus ${got.main ? 'on main' : 'off main'}, outline ${got.ring}`);
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
            await p.waitForSelector('[role="dialog"], [role="alertdialog"]', { state: 'detached' });
            await p.waitForTimeout(50);
            check((await active(p)) === opener, `${opener}: closing the dialog leaves focus on ${show(await active(p))}, not its opener`);
        }

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
