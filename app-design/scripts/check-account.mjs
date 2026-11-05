#!/usr/bin/env node
/*
 * The family's one account control, in Chrome on SwiftShader, in every place
 * a site puts it (the public header, the tool header, a header given a site's
 * own CTA, the docs' header, the signed-in shell) and every state, from 320 to
 * 1440:
 *
 * - Exactly one account control a person can use: signed in, the trigger
 *   showing who (the email, or a short did), at every width; signed out, the
 *   one way in, in the bar or, where the bar has no room, at the foot of the
 *   phone menu, never in both. Checking or a failed check: none to use, and in
 *   the bar a placeholder the size of the way in, with no words and no link.
 * - "Your account" is never a button or a link: not in the bar, not in the
 *   phone menu, not in the open account menu, which holds the site's items,
 *   Account settings on ochk.app, Appearance and Sign out. A site's own CTA
 *   gives way to the account: the bar holds one control at its right end.
 * - The trigger is a 44px target to a thumb, carries its name, aria-haspopup
 *   and aria-expanded, and shows a focus ring of 3:1 on the bar in light and
 *   dark. The keyboard opens the menu (Enter, Space, ArrowDown), Escape shuts
 *   it with focus back on the trigger, Appearance moves to the next theme
 *   with the menu left open, and Sign out runs from the keyboard.
 * - Nothing in the bar runs off a phone's screen or under its neighbour.
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
    console.error('✗ account: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
const names = [];
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ account: ${msg}`);
        failures++;
    }
};

const src = (f) => join(pkg, 'src', f);
const EMAIL = 'ana@example.com';
// Longer than the bar holds anywhere: it is cut, at about 32 characters from 1024.
const LONG = 'ana.maria.oliveira.dos.santos.pereira@example.com';
const DID = 'did:oc:ed30f1d9…a4c2';
const PAGE = `
import { createRoot } from 'react-dom/client';
import { FileText, House, List } from 'lucide-react';
import { SiteHeader } from '${src('chrome/site.tsx')}';
import { ToolShell } from '${src('chrome/tool-shell.tsx')}';
import { DocsShell } from '${src('chrome/docs-shell.tsx')}';
import { SearchButton } from '${src('components/search.tsx')}';
import { AppShell, ThemeProvider } from '${src('chrome/app-shell.tsx')}';
import { SessionAccountView } from '${src('chrome/account.tsx')}';
const q = new URLSearchParams(location.search);
if (q.has('dark')) document.documentElement.classList.add('dark');
const place = q.get('place');
const state = q.get('state');
const account = (
    <SessionAccountView
        state={state.startsWith('in') ? 'in' : state}
        name={state === 'in' ? '${EMAIL}' : state === 'in-did' ? '${DID}' : state === 'in-long' ? '${LONG}' : undefined}
        detail={state.startsWith('in') ? 'bc1qxy2k…hx0wlh' : undefined}
        signInHref="/signin"
        accountHref={q.has('noacct') ? false : undefined}
        appearance={!q.has('noappear')}
        items={[{ label: 'Your stamps', href: '/dashboard', icon: <FileText /> }]}
        onSignOut={() => { window.__signedOut = true; }}
    />
);
const nav = [{ href: '/how', label: 'How it works' }, { href: '/earn', label: 'Earn' }, { href: '/apps', label: 'For apps' }];
const page = <main id="main-content" style={{ height: 1200 }}><p>page</p></main>;
const views = {
    site: () => <><SiteHeader family="me" nav={nav} account={account} />{page}</>,
    // A site that gave the header its account and still passes its old control among the actions and in the menu.
    dup: () => <><SiteHeader family="me" nav={nav} account={account} actions={account} menu={account} />{page}</>,
    // A site not yet bumped: its control among the actions, no \`account\`. It still draws (the inline look).
    old: () => <><SiteHeader family="me" nav={nav} actions={account} />{page}</>,
    cta: () => <><SiteHeader product="vault" family="vault" nav={nav} cta={{ label: 'Open your vault', href: '/vault' }} account={account} />{page}</>,
    tool: () => (
        <ToolShell protocol="stamp" tools={[{ href: '/create', label: 'Create', icon: <FileText />, active: true }, { href: '/verify', label: 'Verify', icon: <List /> }]} account={account}>
            <p>page</p>
        </ToolShell>
    ),
    // The docs' bar: orangecheck's own lockup, the family menu and search beside the account.
    docs: () => (
        <DocsShell nav={[{ label: 'Start', items: [{ href: '/', label: 'Overview' }] }]} current="/" search={<SearchButton />} account={account}>
            <div style={{ height: 1200 }}>page</div>
        </DocsShell>
    ),
    app: () => (
        // As vault draws it: its word, the family menu, and a footer that keeps the menu button on a phone.
        <AppShell product="vault" family="vault" footer={<p>Install the app</p>} nav={[{ items: [{ href: '/a', label: 'Entries', icon: <House />, active: true }, { href: '/b', label: 'Shares', icon: <List /> }] }]} account={account}>
            <p>page</p>
        </AppShell>
    ),
};
createRoot(document.getElementById('root')).render(<ThemeProvider>{views[place]()}</ThemeProvider>);
`;

const PLACES = ['site', 'dup', 'old', 'cta', 'tool', 'docs', 'app'];
// Places whose lockup is orangecheck's alone (no site's word).
const BARE = new Set(['site', 'dup', 'old', 'docs']);
// The site's word beside the lockup, where there is one.
const WORD = { cta: 'vault', tool: 'stamp', app: 'vault' };
// The one place whose trigger shows the name only from lg: a site's own control among a header's actions.
const INLINE = new Set(['old']);
const STATES = ['out', 'checking', 'unknown', 'in', 'in-did', 'in-long'];
// 440: between the wordmark's 420 and the bar's 480, where a signed-in lockup drops its wordmark. 900: where the
// links come into the bar, its most crowded width. 1179: the last width of a band.
const WIDTHS = [320, 360, 390, 440, 768, 900, 1024, 1179, 1440];

// In the page: the words the bar's lockup draws ("orangecheck", "stamp"), not those only read aloud (nameRoom reads
// them the same way: a page function carries nothing in with it).
function brandWords() {
    const brand = document.querySelector('header > div').querySelector('a');
    return [...brand.querySelectorAll('span')]
        .filter((e) => !e.children.length && e.textContent.trim() && !e.classList.contains('sr-only') && e.getBoundingClientRect().width > 1)
        .map((e) => e.textContent.trim());
}

// In the page, signed in: the name in the bar's trigger, the room the bar has left beside it, and the brand's word.
function nameRoom() {
    const half = (v) => Math.round(v * 2) / 2;
    const t = [...document.querySelectorAll('[data-oca-account="in"]')].find((e) => e.getClientRects().length);
    const n = t.querySelector('[data-oca-account-name]');
    const disc = t.querySelector('[data-initial]');
    const cs = getComputedStyle(n);
    // Its cap, 17em: about 32 characters of an email in its type (32 of ana.maria.oliveira@example.co.uk's are 241px at 15px).
    const cap = half(17 * parseFloat(cs.fontSize));
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;white-space:pre;font-family:${cs.fontFamily};font-size:${cs.fontSize};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing}`;
    probe.textContent = 'ana.maria.oliveira@example.co.uk';
    document.body.append(probe);
    const typical32 = half(probe.getBoundingClientRect().width);
    // The least a cut name shows whole: its first letter and the ellipsis.
    probe.textContent = `${n.textContent.charAt(0)}…`;
    const least = half(probe.getBoundingClientRect().width);
    const w = n.getBoundingClientRect().width;
    const cut = n.scrollHeight > n.clientHeight + 1;
    // The letters it shows: all of them, or as many as fit before the ellipsis, as line-clamp cuts.
    let chars = n.textContent.length;
    if (cut) {
        chars = 0;
        for (let k = 1; k <= n.textContent.length; k++) {
            probe.textContent = `${n.textContent.slice(0, k)}…`;
            if (probe.getBoundingClientRect().width > w + 0.5) break;
            chars = k;
        }
    }
    probe.remove();
    // The trigger's own bar: SiteHeader's and AppShell's phone bar set their parts in a row; AppShell's desk bar is its own row.
    const bar = t.closest('header');
    const row = bar.querySelector(':scope > div') ?? bar;
    const right = [...row.children].find((e) => e.contains(t));
    const before = [...row.children].slice(0, [...row.children].indexOf(right));
    // SiteHeader groups the brand, the family menu and the links; AppShell's phone bar has them in the row itself.
    const parts = (before.length === 1 && before[0].tagName === 'DIV' ? [...before[0].children] : before).filter((e) => e.getClientRects().length);
    const slack = parts.length ? half(right.getBoundingClientRect().left - parseFloat(getComputedStyle(row).columnGap) - Math.max(...parts.map((e) => e.getBoundingClientRect().right))) : Infinity;
    // A word drawn and cut; one kept only for screen readers (sr-only, 1px) is not drawn.
    const spans = [...(row.querySelector('a')?.querySelectorAll('span') ?? [])];
    const brandCut = spans.some((e) => e.getBoundingClientRect().width > 1 && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth);
    return { shown: n.getClientRects().length > 0, w: half(w), cut, chars, cap, typical32, least, slack, brandCut, brandWords: spans
            .filter((e) => !e.children.length && e.textContent.trim() && !e.classList.contains('sr-only') && e.getBoundingClientRect().width > 1)
            .map((e) => e.textContent.trim()), disc: disc.getClientRects().length > 0, sticky: bar.dataset.ocaSticky ?? null };
}

// In the page: every account control drawn, and every link or button that says "Your account" or the CTA the account replaced.
function read() {
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const usable = (el) => shown(el) && (el.matches('a[href], button') || el.querySelector('a[href], button')) && !el.closest('[aria-hidden="true"]');
    const box = (el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const all = [...document.querySelectorAll('[data-oca-account]')];
    const inDialog = (el) => Boolean(el.closest('[role="dialog"]'));
    const bar = all.filter((el) => !inDialog(el) && el.getClientRects().length > 0);
    const sheet = all.filter((el) => inDialog(el) && el.getClientRects().length > 0);
    const words = [...document.querySelectorAll('a, button, [role="menuitem"]')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim())
        .filter((t) => /\byour account\b|open your vault/i.test(t));
    return {
        bar: bar.map((el) => ({ kind: el.dataset.ocaAccount, usable: usable(el), tag: el.tagName, href: el.getAttribute('href'), hidden: el.getAttribute('aria-hidden'), focusable: el.matches('a[href], button, [tabindex]:not([tabindex="-1"])'), text: shown(el) ? (el.innerText || '').trim() : '', ...box(el) })),
        sheet: sheet.map((el) => ({ kind: el.dataset.ocaAccount, usable: usable(el), text: (el.innerText || '').trim() })),
        words,
    };
}

const dir = mkdtempSync(join(tmpdir(), 'app-design-account-'));
try {
    bundle(dir, { account: PAGE });
    compileCss(dir, ['account']);
    const url = writePage(dir, 'account', '<div id="root"></div>', { head: `<script>${COLOUR_KIT}</script>`, script: '<script src="account.js"></script>' });
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const open = async (place, state, width, dark = false, extra = '') => {
        const phone = width < 768;
        // The theme follows the system until someone picks one, so dark is the system's.
        const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, colorScheme: dark ? 'dark' : 'light' });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(`${url}?place=${place}&state=${state}${dark ? '&dark' : ''}${extra}`);
        // A page that draws no control at all is a failure the counts below report, not a crash here.
        await p.waitForSelector('[data-oca-account]', { state: 'attached', timeout: 5000 }).catch(() => {});
        await p.evaluate(() => document.fonts.ready);
        return { p, errors, close: () => ctx.close() };
    };
    try {
        // The way in's box at each width, for the placeholders to match.
        const wayIn = {};
        for (const place of PLACES) {
            for (const width of WIDTHS) {
                for (const state of STATES) {
                    const at = `[${width}] ${place}, ${state}`;
                    const { p, errors, close } = await open(place, state, width);
                    const r = await p.evaluate(read);
                    check(errors.length === 0, `${at}: the page threw ${errors.join('; ')}`);
                    // The bar first; then the phone menu, where the header has one.
                    const menuButton = p.locator('header button[aria-label="Open menu"]');
                    let sheet = [];
                    let sheetWords = [];
                    if ((await menuButton.count()) && (await menuButton.first().isVisible())) {
                        await menuButton.first().click();
                        await p.waitForSelector('[role="dialog"]');
                        const s = await p.evaluate(read);
                        sheet = s.sheet;
                        sheetWords = s.words;
                        await p.keyboard.press('Escape');
                    }
                    const usable = [...r.bar.filter((c) => c.usable), ...sheet.filter((c) => c.usable)];
                    const signedIn = state.startsWith('in');
                    if (state === 'out' || signedIn) {
                        check(usable.length === 1, `${at}: ${usable.length} account controls to use, not 1: ${JSON.stringify({ bar: r.bar, sheet })}`);
                        check(usable[0]?.kind === (signedIn ? 'in' : 'out'), `${at}: the control is ${usable[0]?.kind}, not ${signedIn ? 'in' : 'out'}`);
                    } else {
                        check(usable.length === 0, `${at}: a placeholder can be used: ${JSON.stringify({ bar: r.bar, sheet })}`);
                        for (const c of r.bar) check(!c.href && c.hidden === 'true' && !c.focusable && c.text === '', `${at}: the placeholder has words, a link or a tab stop: ${JSON.stringify(c)}`);
                    }
                    check(r.words.length === 0 && sheetWords.length === 0, `${at}: "Your account", or the site's CTA beside the account, is a link or button: ${[...r.words, ...sheetWords].join(', ')}`);
                    if (state === 'out') wayIn[`${place}:${width}`] = r.bar.find((c) => c.kind === 'out') ?? null;
                    // Signed out, nothing needs the room: the lockup is drawn whole (the wordmark gives way below 420
                    // beside a site's word, as it always has).
                    if ((place !== 'app' || width < 1024) && !state.startsWith('in')) {
                        const words = await p.evaluate(brandWords);
                        const want = BARE.has(place) ? ['orangecheck'] : width < 420 ? [WORD[place]] : ['orangecheck', WORD[place]];
                        check(JSON.stringify(words) === JSON.stringify(want), `${at}: the lockup draws ${JSON.stringify(words)}, not ${JSON.stringify(want)}`);
                    }
                    if (state === 'checking' || state === 'unknown') {
                        const out = wayIn[`${place}:${width}`];
                        const held = r.bar[0] ?? null;
                        // Where the way in is drawn in the bar, its placeholder takes the same box; where it is not, neither is the placeholder.
                        check(out ? held && held.x === out.x && held.w === out.w && held.h === out.h : !held, `${at}: the placeholder is not the way in's box: ${JSON.stringify({ out, held })}`);
                    }
                    if (signedIn) {
                        const t = r.bar.find((c) => c.kind === 'in');
                        if (width < 768) check(t && t.w >= 44 && t.h >= 44, `${at}: the trigger is ${t?.w}x${t?.h}, under a thumb's 44`);
                        const name = { in: EMAIL, 'in-did': DID, 'in-long': LONG }[state];
                        // In a header's block and AppShell's bars the trigger says who it is in words at every width; among a
                        // site's own controls from lg, and below that its name is its label and heads the menu.
                        const named = !INLINE.has(place);
                        if (named || width >= 1024) check(t?.text === name, `${at}: the trigger shows "${t?.text}", not ${name}`);
                        if (named) {
                            const n = await p.evaluate(nameRoom);
                            check(n.shown, `${at}: the name is not shown in the bar`);
                            // Cut where the bar has no room left for it, or at its cap (its line ends a letter short of it at
                            // most); the brand's word only once the name has given way.
                            const atCap = n.w >= n.cap - 16;
                            check(!n.cut || n.slack <= 1 || atCap, `${at}: the name is cut at ${n.w}px, under its ${n.cap}px, with ${n.slack}px of the bar to spare`);
                            check(!n.brandCut || n.w < 1, `${at}: the brand is cut while the name still has ${n.w}px`);
                            check(n.w <= n.cap + 0.5, `${at}: the name is ${n.w}px, past its ${n.cap}px`);
                            check(!n.cut || n.w >= n.least, `${at}: the name is cut to ${n.w}px, under a letter and the ellipsis (${n.least}px), so the ellipsis is clipped`);
                            // At least 8 of its characters at every width: below 480 the lockup drops its wordmark, so
                            // orangecheck's own is its mark alone, and below 390 a site's is too, to make the room.
                            check(n.chars >= Math.min(8, name.length), `${at}: the name shows ${n.chars} characters, under 8`);
                            // AppShell's desk bar holds the account alone: its lockup is in the sidebar.
                            const words = place === 'app' && width >= 1024 ? null : BARE.has(place) ? (width < 480 ? [] : ['orangecheck']) : width < 390 ? [] : width < 480 ? [WORD[place]] : null;
                            if (words) check(JSON.stringify(n.brandWords) === JSON.stringify(words), `${at}: signed in, the lockup draws ${JSON.stringify(n.brandWords)}, not ${JSON.stringify(words)}`);
                            check(n.typical32 <= n.cap && n.typical32 >= n.cap * 0.85, `${at}: 32 characters of an email are ${n.typical32}px against the ${n.cap}px cap: not about 32`);
                            // Whole wherever the bar has the room: at 768, where the links are still in the phone's menu, and
                            // from 1024. At 900 the links have just come into the bar, and the name gives them its room.
                            if (state !== 'in-long' && width >= 768 && width !== 900) check(!n.cut, `${at}: "${name}" is cut at ${n.w}px`);
                            if (state === 'in-long' && width >= 1024) check(n.cut, `${at}: the long name is whole at ${n.w}px`);
                            if (state === 'in-long' && width >= 1440) check(atCap, `${at}: the long name is cut at ${n.w}px with room for its ${n.cap}px`);
                            // On a phone the initial gives its room to the name.
                            check(n.disc === width >= 768, `${at}: the initial is ${n.disc ? 'shown' : 'hidden'}`);
                            // The bar it sits in says whose it is, at every width: AppShell's phone and desk bars alike.
                            check(n.sticky === (place === 'app' ? 'app-bar' : 'site'), `${at}: the trigger's bar is data-oca-sticky=${n.sticky}`);
                            names.push(`${width} ${place} ${state}: ${n.w}px, ${n.chars} characters${n.cut ? ', cut' : ''}`);
                        }
                        const label = await p.locator('[data-oca-account="in"]').first().getAttribute('aria-label');
                        check(label === `${name}, account menu`, `${at}: the trigger is named "${label}"`);
                    }
                    // The docs' search: a field from md, but with someone signed in its icon where the links share the bar
                    // (900 to 1179px), its word still its name and the shortcut not drawn.
                    if (place === 'docs' && width >= 768) {
                        const s = await p.evaluate(() => {
                            const b = document.querySelector('header button[aria-keyshortcuts]');
                            const label = b.querySelector('span:not([aria-hidden])');
                            const kbd = b.querySelector('[aria-hidden]:not(svg)');
                            return { w: Math.round(b.getBoundingClientRect().width), label: label.textContent, drawn: label.getBoundingClientRect().width > 1, kbd: kbd.getClientRects().length > 0 };
                        });
                        const icon = signedIn && width >= 900 && width < 1180;
                        check(icon ? s.w <= 44 && !s.drawn && !s.kbd : s.w === 224 && s.drawn && s.kbd, `${at}: the search is ${JSON.stringify(s)}, not ${icon ? 'its icon' : 'its field'}`);
                        check(s.label === 'Search', `${at}: the search is named "${s.label}"`);
                    }
                    if (width <= 390) {
                        const fit = await p.evaluate(() => {
                            const row = document.querySelector('header > div');
                            const kids = [...row.querySelectorAll(':scope > *')].map((k) => k.getBoundingClientRect()).filter((k) => k.width > 0);
                            return { over: row.scrollWidth - row.clientWidth, right: Math.max(...kids.map((k) => k.right)) - document.documentElement.clientWidth, overlap: Math.max(0, ...kids.slice(1).map((k, i) => kids[i].right - k.left)) };
                        });
                        check(fit.over <= 1 && fit.right <= 1 && fit.overlap <= 0.5, `${at}: the bar overflows or a part runs under the next: ${JSON.stringify(fit)}`);
                    }
                    await close();
                }
            }
        }

        // The keyboard, the menu and the ring, signed in, in light and dark, at a desk and on a phone.
        for (const place of PLACES) {
            for (const width of [390, 1440]) {
                for (const dark of [false, true]) {
                    const at = `[${width}${dark ? ' dark' : ''}] ${place}`;
                    const { p, close } = await open(place, 'in', width, dark);
                    const trigger = p.locator('[data-oca-account="in"]:visible').first();
                    // Tab from the top of the page until the trigger has focus.
                    let reached = false;
                    for (let i = 0; i < 40 && !reached; i++) {
                        await p.keyboard.press('Tab');
                        reached = await trigger.evaluate((el) => el === document.activeElement);
                    }
                    check(reached, `${at}: Tab never reaches the trigger`);
                    const ring = await trigger.evaluate((el) => {
                        const ground = (e) => {
                            for (let x = e; x; x = x.parentElement) {
                                const bg = getComputedStyle(x).backgroundColor;
                                if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
                            }
                            return getComputedStyle(document.body).backgroundColor;
                        };
                        const cs = getComputedStyle(el);
                        const colour = window.__ring(cs.boxShadow) ?? (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : null);
                        if (!colour) return { contrast: 0 };
                        const under = window.__rgb(ground(el.parentElement), '#fff');
                        return { contrast: window.__contrast(window.__rgb(colour, `rgb(${under.join(',')})`), under), colour };
                    });
                    check(ring.contrast >= 3, `${at}: the focused trigger's ring is ${ring.contrast.toFixed(2)}:1 on the bar (${ring.colour})`);
                    check((await trigger.getAttribute('aria-haspopup')) === 'menu' && (await trigger.getAttribute('aria-expanded')) === 'false', `${at}: the trigger does not say it opens a menu, shut`);
                    const menu = p.locator('[role="menu"]');
                    // Radix moves focus into the menu, and back to the trigger, a frame after it opens or shuts:
                    // the next key waits for focus to land, as a person's next key does.
                    const focusIn = (where) =>
                        p
                            .waitForFunction((w) => (w === 'menu' ? Boolean(document.activeElement?.closest('[role="menu"]')) : document.activeElement?.getAttribute('data-oca-account') === 'in'), where, { timeout: 3000 })
                            .then(() => true, () => false);
                    const openBy = async (key) => {
                        await p.keyboard.press(key);
                        await menu.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
                        return focusIn('menu');
                    };
                    // Radix moves focus between items in a timeout after the key, too.
                    const focusOn = (text) =>
                        p.waitForFunction((t) => document.activeElement?.textContent?.trim() === t, text, { timeout: 3000 }).then(() => true, () => false);
                    const shut = async () => {
                        await p.keyboard.press('Escape');
                        await menu.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
                        return focusIn('trigger');
                    };
                    for (const key of ['Enter', ' ', 'ArrowDown']) {
                        const focused = await openBy(key);
                        const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => [e.textContent.trim(), e.getAttribute('href')]));
                        check((await trigger.getAttribute('aria-expanded')) === 'true' && focused, `${at}: ${JSON.stringify(key)} does not open the menu with focus in it`);
                        check(
                            JSON.stringify(items) === JSON.stringify([['Your stamps', '/dashboard'], ['Account settings', 'https://ochk.app/me/account'], ['Appearance: System', null], ['Sign out', null]]),
                            `${at}: the menu holds ${JSON.stringify(items)}`
                        );
                        const words = await menu.evaluate((m) => m.textContent).catch(() => '');
                        check(!/your account/i.test(words), `${at}: the open menu says "Your account"`);
                        const back = await shut();
                        check((await menu.count()) === 0 && back, `${at}: Escape after ${JSON.stringify(key)} does not shut the menu with focus back on the trigger`);
                    }
                    // Appearance, from the keyboard: the item above Sign out moves system to light, and the menu stays open.
                    await openBy('Enter');
                    await p.keyboard.press('End');
                    await focusOn('Sign out');
                    await p.keyboard.press('ArrowUp');
                    const onAppearance = await focusOn('Appearance: System');
                    await p.keyboard.press('Enter');
                    const moved = await p
                        .waitForFunction(() => document.activeElement?.textContent?.trim() === 'Appearance: Light' && document.documentElement.classList.contains('light'), null, { timeout: 3000 })
                        .then(() => true, () => false);
                    const after = await p.evaluate(() => ({
                        open: Boolean(document.querySelector('[role="menu"]')),
                        label: document.activeElement?.textContent?.trim(),
                        light: document.documentElement.classList.contains('light') && !document.documentElement.classList.contains('dark'),
                    }));
                    check(onAppearance && moved && after.open && after.light, `${at}: Appearance does not move to light with the menu open: ${JSON.stringify({ onAppearance, ...after })}`);
                    // On round the cycle with the menu open and focus held: light to dark, dark to the system's.
                    for (const [label, stored, cls] of [['Dark', 'dark', 'dark'], ['System', 'system', dark ? 'dark' : 'light']]) {
                        await p.keyboard.press('Enter');
                        const went = await p
                            .waitForFunction(([l, c]) => document.activeElement?.textContent?.trim() === `Appearance: ${l}` && document.documentElement.classList.contains(c), [label, cls], { timeout: 3000 })
                            .then(() => true, () => false);
                        const now = await p.evaluate(() => ({
                            open: Boolean(document.querySelector('[role="menu"]')),
                            label: document.activeElement?.textContent?.trim(),
                            stored: localStorage.getItem('theme'),
                            classes: document.documentElement.className,
                        }));
                        check(went && now.open && now.stored === stored && !now.classes.includes(cls === 'dark' ? 'light' : 'dark'), `${at}: Appearance does not move on to ${label.toLowerCase()} with the menu open and focus held: ${JSON.stringify(now)}`);
                    }
                    await shut();
                    // Sign out, from the keyboard: open, End to the last item, Enter.
                    await openBy('Enter');
                    await p.keyboard.press('End');
                    const onSignOut = await focusOn('Sign out');
                    await p.keyboard.press('Enter');
                    check(onSignOut, `${at}: End does not reach Sign out`);
                    check(await p.evaluate(() => window.__signedOut === true), `${at}: Sign out does not run from the keyboard`);
                    await close();
                }
            }
        }
        // A site that leaves Account settings or Appearance out (ochk.app, whose own items hold its account page):
        // the menu holds exactly what is left, one separator under the name and between kinds, none doubled.
        const STAMPS = ['Your stamps', '/dashboard'];
        const SETTINGS = ['Account settings', 'https://ochk.app/me/account'];
        const APPEARANCE = ['Appearance: System', null];
        const SIGN_OUT = ['Sign out', null];
        for (const place of PLACES) {
            for (const [extra, want, seps] of [
                ['&noacct', [STAMPS, APPEARANCE, SIGN_OUT], 3],
                ['&noappear', [STAMPS, SETTINGS, SIGN_OUT], 3],
                ['&noacct&noappear', [STAMPS, SIGN_OUT], 2],
            ]) {
                const at = `[1440] ${place}, ${extra.slice(1).replace('&', ' ')}`;
                const { p, errors, close } = await open(place, 'in', 1440, false, extra);
                await p.locator('[data-oca-account="in"]:visible').first().click();
                const menu = p.locator('[role="menu"]');
                await menu.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
                const items = await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => [e.textContent.trim(), e.getAttribute('href')]));
                const separators = await menu.locator('[role="separator"]').count();
                check(errors.length === 0 && JSON.stringify(items) === JSON.stringify(want) && separators === seps, `${at}: the menu holds ${JSON.stringify(items)} with ${separators} separators, not ${JSON.stringify(want)} with ${seps}`);
                await close();
            }
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} account failure(s)`);
    process.exit(1);
}
console.log(`names in the bar: ${names.join('; ')}`);
console.log(`✓ account: ${checks} checks in Chrome from 320 to 1440; one account control in every state and place, never "Your account", and the menu by keyboard`);
