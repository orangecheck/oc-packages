#!/usr/bin/env node
/*
 * One header for the family, in Chrome on SwiftShader. ochk.app's bar (SiteHeader) is the measure; ToolShell's
 * tool page and app, DocsShell, and a SiteHeader over a full-width app (`variant="tool"`) must draw the same bar:
 *
 * - the same height (56px and its hairline, 68 from 900px), lockup (the 30px mark and its 21px wordmark), gutter,
 *   navigation (15px text 18px after the family menu, into the phone's menu below 900px) and account block flush
 *   at the right end; in the frame (82.5rem at most, between its rules), or the window's width for `tool`;
 * - no theme switch in the bar: it is in the footer and the account menu;
 * - ToolShell's phone menu holds its links one row each, as ochk.app's does;
 * - with the longest tool set a site has (agent's four), no link wraps, the lockup's word is whole and the bar does
 *   not overflow; Docs and About join the bar from 1180px, and the menu holds them below; a rail page keeps them.
 *
 * It bundles the package's sources, so it needs no build.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundle, COLOUR_KIT, compileCss, findChrome, pkg, writePage } from './browser.mjs';

const require = createRequire(import.meta.url);
const chrome = findChrome();
if (!chrome) {
    console.error('✗ header: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ header: ${msg}`);
        failures++;
    }
};

const src = (f) => join(pkg, 'src', f);
const PAGE = `
import { createRoot } from 'react-dom/client';
import { FileText, House, List, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '${src('chrome/site.tsx')}';
import { ToolShell } from '${src('chrome/tool-shell.tsx')}';
import { DocsShell } from '${src('chrome/docs-shell.tsx')}';
import { AppShell, ThemeProvider } from '${src('chrome/app-shell.tsx')}';
import { SessionAccountView } from '${src('chrome/account.tsx')}';
const place = new URLSearchParams(location.search).get('place');
const account = <SessionAccountView state="out" signInHref="/signin" />;
// agent's own four, the longest tool set of the six sites.
const tools = [{ href: '/create', label: 'Create', icon: <FileText />, active: true }, { href: '/inspect', label: 'Inspect', icon: <ShieldCheck /> }, { href: '/delegations', label: 'Delegations', icon: <List /> }, { href: '/playground', label: 'Playground', icon: <House /> }];
const page = <main id="main-content" style={{ height: 1600 }}><p>page</p></main>;
const views = {
    // ochk.app's public header, the measure.
    app: () => <><SiteHeader family="me" nav={[{ href: '/how', label: 'How it works' }, { href: '/earn', label: 'Earn' }, { href: '/apps', label: 'For apps' }]} account={account} />{page}</>,
    tool: () => <ToolShell protocol="agent" tools={tools} account={account}><p>page</p></ToolShell>,
    toolapp: () => <ToolShell protocol="attest" variant="app" tools={tools} account={account}><p>page</p></ToolShell>,
    toolrail: () => <ToolShell protocol="agent" rail railFooter={<a href="/docs">Docs</a>} tools={tools} account={account}><p>page</p></ToolShell>,
    docs: () => <DocsShell nav={[{ label: 'Start', items: [{ href: '/', label: 'Overview' }] }]} current="/" account={account}><div style={{ height: 2400 }}>page</div></DocsShell>,
    messenger: () => (
        <AppShell variant="rail" header={<SiteHeader variant="tool" home="/" product="chat" family="chat" nav={[{ href: '/', label: 'Overview' }]} account={account} />} nav={[{ items: [{ href: '/a', label: 'Chats', icon: <House />, active: true }] }]}>
            <p>page</p>
        </AppShell>
    ),
};
createRoot(document.getElementById('root')).render(<ThemeProvider>{views[place]()}</ThemeProvider>);
`;

// The bar's measures, read in the page.
function measure() {
    const header = [...document.querySelectorAll('header')].find((h) => h.getClientRects().length && h.querySelector('a[href] .sr-only'));
    if (!header) return null;
    const row = header.firstElementChild;
    const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left * 2) / 2, y: Math.round(r.top * 2) / 2, w: Math.round(r.width * 2) / 2, h: Math.round(r.height * 2) / 2 };
    };
    const brand = header.querySelector('a:has(> .sr-only)');
    const mark = brand?.querySelector('svg');
    // The wordmark's own element: a lockup's outer span holds the same text at the link's size.
    const word = [...(brand?.querySelectorAll('span, text') ?? [])].find((e) => !e.children.length && e.textContent.trim() === 'orangecheck' && !e.classList.contains('sr-only'));
    const nav = header.querySelector('nav[aria-label="Main"]');
    // The first item shown, a link or a dropdown's button (ochk.io's Protocols).
    const shownLinks = nav ? [...nav.querySelectorAll('a, button')].filter((a) => a.getClientRects().length) : [];
    const firstLink = shownLinks[0] ?? null;
    const navShown = Boolean(firstLink);
    // A link on two lines: its words' boxes start more than half a line apart (an icon beside them is not a line).
    const lines = (el) => {
        const tops = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
            const r = document.createRange();
            r.selectNodeContents(t);
            for (const b of r.getClientRects()) if (b.width > 0) tops.push(b.top);
        }
        return tops.length ? 1 + tops.filter((t) => t - Math.min(...tops) > 8).length : 0;
    };
    const family = header.querySelector('button[aria-haspopup]:not([data-oca-account])');
    const familyShown = family && family.getClientRects().length > 0;
    const acc = header.querySelector('[data-oca-account]');
    const rs = getComputedStyle(row);
    return {
        header: box(header),
        row: box(row),
        rules: [rs.borderLeftWidth, rs.borderRightWidth],
        padLeft: rs.paddingLeft,
        mark: box(mark),
        word: word ? getComputedStyle(word).fontSize : null,
        nav: navShown ? { font: getComputedStyle(firstLink).fontSize, gap: Math.round(firstLink.getBoundingClientRect().left - (familyShown ? family : brand).getBoundingClientRect().right) } : null,
        account: acc && acc.getClientRects().length ? box(acc) : null,
        theme: [...header.querySelectorAll('button[aria-label^="Theme:"]')].filter((b) => b.getClientRects().length).length,
        menu: Boolean(header.querySelector('button[aria-label="Open menu"]')?.getClientRects().length),
        family: Boolean(familyShown),
        links: shownLinks.map((a) => a.textContent.trim()),
        // The links marked as the page you are on.
        current: shownLinks.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent.trim()),
        // The space between one link and the next, each distinct value once.
        gaps: [...new Set(shownLinks.slice(1).map((a, i) => Math.round(a.getBoundingClientRect().left - shownLinks[i].getBoundingClientRect().right)))],
        wrapped: shownLinks.filter((a) => lines(a) > 1).map((a) => a.textContent.trim()),
        // The lockup's words shown, each as wide as its content (a word cut to nothing reads 0 of its width); a word
        // the lockup hides on purpose is visually hidden (absolute, 1px), not cut.
        cut: [...(brand?.querySelectorAll('span') ?? [])].filter((e) => !e.children.length && e.textContent.trim() && getComputedStyle(e).position !== 'absolute' && !e.closest('.sr-only') && e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map((e) => `${e.textContent.trim()} ${e.clientWidth} of ${e.scrollWidth}`),
        over: row.scrollWidth > row.clientWidth + 1,
    };
}

const dir = mkdtempSync(join(tmpdir(), 'app-design-header-'));
try {
    bundle(dir, { header: PAGE });
    compileCss(dir, ['header']);
    const url = writePage(dir, 'header', '<div id="root"></div>', { head: `<script>${COLOUR_KIT}</script>`, script: '<script src="header.js"></script>' });
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const open = async (place, width) => {
        const phone = width < 768;
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: phone, hasTouch: phone });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(`${url}?place=${place}`);
        await p.waitForSelector('[data-oca-account]', { state: 'attached' });
        await p.evaluate(() => document.fonts.ready);
        return { p, errors, close: () => ctx.close() };
    };
    try {
        const PLACES = ['tool', 'toolapp', 'toolrail', 'docs', 'messenger'];
        const TOOLS = new Set(['tool', 'toolapp', 'toolrail']);
        for (const width of [360, 390, 768, 899, 900, 1024, 1179, 1180, 1440, 1920]) {
            const ref = await open('app', width);
            const want = await ref.p.evaluate(measure);
            await ref.close();
            const at0 = `[${width}]`;
            // The measure itself, so a change to it is a change someone meant: ochk.app's bar as 2.0 drew it.
            check(want && want.header.h === (width >= 900 ? 69 : 57), `${at0} ochk.app's bar is ${want?.header.h} tall`);
            check(want && want.mark?.h === 15 && want.mark?.w === 30, `${at0} ochk.app's mark is ${JSON.stringify(want?.mark)}`);
            check(want && !(want.menu && want.family), `${at0} ochk.app's family menu and menu button are both in the bar`);
            for (const place of PLACES) {
                const at = `[${width}] ${place}`;
                const { p, errors, close } = await open(place, width);
                const got = await p.evaluate(measure);
                check(errors.length === 0, `${at}: the page threw ${errors.join('; ')}`);
                check(got, `${at}: no header with a home link`);
                if (!got) {
                    await close();
                    continue;
                }
                const bleed = place === 'toolapp' || place === 'messenger';
                check(got.header.h === want.header.h, `${at}: the bar is ${got.header.h} tall, ochk.app's ${want.header.h}`);
                check(got.mark?.w === want.mark.w && got.mark?.h === want.mark.h, `${at}: the mark is ${JSON.stringify(got.mark)}, ochk.app's ${JSON.stringify(want.mark)}`);
                check(got.word === want.word, `${at}: the wordmark is ${got.word}, ochk.app's ${want.word}`);
                check(got.padLeft === want.padLeft && Math.abs(got.mark.x - (bleed ? want.mark.x - want.row.x - parseFloat(want.rules[0]) : want.mark.x)) <= 0.5, `${at}: the lockup starts at ${got.mark?.x} (gutter ${got.padLeft}), ochk.app's at ${want.mark.x} (${want.padLeft})`);
                // A rail page's bar from lg holds no tools, so from 1024 to 1179 no link: its first is Docs from 1180.
                if (!(place === 'toolrail' && width >= 1024 && width < 1180))
                    check(JSON.stringify(got.nav && { font: got.nav.font, gap: got.nav.gap }) === JSON.stringify(want.nav && { font: want.nav.font, gap: want.nav.gap }), `${at}: the navigation is ${JSON.stringify(got.nav)}, ochk.app's ${JSON.stringify(want.nav)}`);
                // A tool bar's menu holds Docs and About to 1179px, so its button stays there beside the tools.
                const menuWanted = TOOLS.has(place) ? width < 1180 : want.menu;
                check(got.menu === menuWanted, `${at}: the menu button is ${got.menu ? 'there' : 'missing'}, ${menuWanted ? 'wanted' : 'not wanted'}`);
                // The menu holds the family where its button shows, so the bar never draws both.
                check(!(got.menu && got.family), `${at}: the family menu and the menu button are both in the bar`);
                check(got.wrapped.length === 0, `${at}: ${got.wrapped.join(', ')} wraps onto two lines`);
                check(got.cut.length === 0, `${at}: the lockup's word is cut: ${got.cut.join(', ')}`);
                check(!got.over, `${at}: the bar overflows`);
                // ochk.app's links 28px apart; a tool bar's close up to 24 where its menu holds Docs and About.
                if (TOOLS.has(place) && got.gaps.length) {
                    const gap = width < 1180 ? 24 : 28;
                    check(JSON.stringify(got.gaps) === JSON.stringify([gap]) && (!want.gaps.length || JSON.stringify(want.gaps) === '[28]'), `${at}: the links are ${JSON.stringify(got.gaps)}px apart, not ${gap} (ochk.app's ${JSON.stringify(want.gaps)})`);
                }
                if (TOOLS.has(place)) {
                    const wantLinks = width < 900 ? [] : [...(place === 'toolrail' && width >= 1024 ? [] : ['Create', 'Inspect', 'Delegations', 'Playground']), ...(width >= 1180 ? ['Docs', `About ${place === 'toolapp' ? 'attest' : 'agent'}`] : [])];
                    check(JSON.stringify(got.links) === JSON.stringify(wantLinks), `${at}: the bar's links are ${JSON.stringify(got.links)}, not ${JSON.stringify(wantLinks)}`);
                    // The tool you are on is marked, and only it.
                    const wantCurrent = wantLinks.includes('Create') ? ['Create'] : [];
                    check(JSON.stringify(got.current) === JSON.stringify(wantCurrent), `${at}: the bar marks ${JSON.stringify(got.current)} as the page, not ${JSON.stringify(wantCurrent)}`);
                }
                check(got.theme === 0, `${at}: ${got.theme} theme switch in the bar`);
                // What sticks under the bar, scrolled: the docs' section bar below lg, its sidebar from lg and its On this
                // page column from xl, flush.
                if (place === 'docs') {
                    const stuck = await p.evaluate(() => {
                        window.scrollTo({ top: 800, behavior: 'instant' });
                        const half = (n) => Math.round(n * 2) / 2;
                        const main = document.querySelector('#main-content');
                        const parts = [
                            ['section bar', document.querySelector('[data-oca-sticky="docs-bar"]')],
                            ['sidebar', main.previousElementSibling],
                            ['On this page column', main.nextElementSibling],
                        ].filter(([, el]) => el.getClientRects().length);
                        return { header: half(document.querySelector('header').getBoundingClientRect().bottom), parts: parts.map(([which, el]) => [which, half(el.getBoundingClientRect().top)]) };
                    });
                    const want = width >= 1280 ? ['sidebar', 'On this page column'] : width >= 1024 ? ['sidebar'] : ['section bar'];
                    check(JSON.stringify(stuck.parts.map(([which]) => which)) === JSON.stringify(want), `${at}: scrolled, the bar has ${JSON.stringify(stuck.parts)} under it, not ${JSON.stringify(want)}`);
                    for (const [which, top] of stuck.parts) check(top === stuck.header, `${at}: scrolled, the ${which} sticks at ${top}, the bar ends at ${stuck.header}`);
                }
                if (bleed) {
                    check(got.row.w === width && got.rules.every((r) => r === '0px'), `${at}: a full-width bar is ${got.row.w} wide with rules ${got.rules}`);
                } else {
                    check(got.row.x === want.row.x && got.row.w === want.row.w && JSON.stringify(got.rules) === JSON.stringify(want.rules), `${at}: the frame is ${JSON.stringify([got.row, got.rules])}, ochk.app's ${JSON.stringify([want.row, want.rules])}`);
                }
                // The account's block: the bar's full height at its right end, as ochk.app's.
                if (want.account) {
                    const right = bleed ? width : want.account.x + want.account.w;
                    check(got.account && got.account.h === want.account.h && got.account.w === want.account.w && got.account.x + got.account.w === right, `${at}: the account is ${JSON.stringify(got.account)}, not ${want.account.w}x${want.account.h} ending at ${right}`);
                } else check(!got.account, `${at}: the account shows where ochk.app's does not: ${JSON.stringify(got.account)}`);
                await close();
            }
        }
        // ToolShell's phone menu: every link a row of its own (2.0 set About and Docs side by side), the tools too.
        {
            const { p, close } = await open('tool', 390);
            await p.locator('header button[aria-label="Open menu"]').click();
            await p.waitForSelector('[role="dialog"]');
            const rows = await p.evaluate(() =>
                [...document.querySelectorAll('[role="dialog"] nav[aria-label="Main"] a')].map((a) => {
                    const r = a.getBoundingClientRect();
                    return [a.textContent.trim(), Math.round(r.left), Math.round(r.top), Math.round(r.height)];
                })
            );
            const labels = rows.map((r) => r[0]);
            check(JSON.stringify(labels) === JSON.stringify(['Create', 'Inspect', 'Delegations', 'Playground', 'Docs', 'About agent']), `ToolShell's phone menu lists ${JSON.stringify(labels)}`);
            const current = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] nav[aria-label="Main"] a[aria-current="page"]')].map((a) => a.textContent.trim()));
            check(JSON.stringify(current) === '["Create"]', `ToolShell's phone menu marks ${JSON.stringify(current)} as the page, not Create`);
            check(rows.every((r) => r[1] === rows[0][1] && r[3] >= 44) && rows.every((r, i) => i === 0 || r[2] >= rows[i - 1][2] + rows[i - 1][3] - 1), `ToolShell's phone menu is not one 44px row per link: ${JSON.stringify(rows)}`);
            await close();
        }
        // From 900 to 1179 a tool bar's menu holds what the bar does not show: Docs and About, on a rail page too.
        for (const place of ['tool', 'toolrail']) {
            const { p, close } = await open(place, 1024);
            await p.locator('header button[aria-label="Open menu"]').click();
            await p.waitForSelector('[role="dialog"]');
            const labels = await p.evaluate(() => [...document.querySelectorAll('[role="dialog"] nav[aria-label="Main"] a')].map((a) => a.textContent.trim()));
            check(labels.includes('Docs') && labels.includes('About agent'), `[1024] ${place}: the menu lists ${JSON.stringify(labels)}, without Docs or About`);
            await close();
        }
        // The theme's switch: in ToolShell's footer.
        {
            const { p, close } = await open('tool', 1440);
            check((await p.locator('footer button[aria-label^="Theme:"]').count()) === 1, "ToolShell's footer has no theme switch");
            await close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} header failure(s)`);
    process.exit(1);
}
console.log(`✓ header: ${checks} checks in Chrome from 360 to 1920; ToolShell, DocsShell and a full-width app draw ochk.app's bar, with no theme switch in it, and agent's four tools fit it`);
