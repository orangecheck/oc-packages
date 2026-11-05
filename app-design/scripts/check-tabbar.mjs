#!/usr/bin/env node
/*
 * On a phone the app shell's TabBar is fixed over the bottom of the window. What
 * sits under it is out of sight, so nothing in the package may count it as seen,
 * in Chrome on SwiftShader at 390 wide:
 *
 * - Each on-screen test and each IntersectionObserver stops at the bar's top
 *   edge: ParticleText, StepPath, Reveal, Ticker, useInView, Wipe, Marquee,
 *   useOnScreen, the motion scheduler, HalftoneCanvas and useActiveHeading.
 *   An element just under the bar at load waits, and plays once it is moved
 *   into the visible middle. The window is 400 tall, so the bar (14% of it)
 *   is deeper than the old 8%, 10% and 12% margins, and a revert of either
 *   the on-screen test or the observer alone shows. lane-lock's case is here
 *   too: vote's share at 807 in an 844 window, under the bar from 787.
 * - With no bar, the same element behaves as it did before the bar was known.
 * - A shared observer made before a shell mounts takes the bar in when it
 *   comes: a Wipe added under the bar still waits.
 * - The bar's height is published once, from its own box, and is 0 where the
 *   bar is hidden (md up) and gone when the bar is. With two bars mounted, the
 *   one left keeps it when the other goes. An observer remade for a new
 *   height lets the old one go: one callback per change, not two.
 * - Each shell's room under its content is the bar's height.
 * - Focus: tabbing down a column of buttons never leaves the one in focus
 *   under the bar (WCAG 2.4.11), in light and dark, and on the server's page
 *   with no script. A narrow page with no bar has no bottom scroll padding.
 *
 * It bundles the package's sources, so it needs no build.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundle, compileCss, findChrome, pkg, writePage } from './browser.mjs';

const require = createRequire(import.meta.url);
const chrome = findChrome();
if (!chrome) {
    console.error('✗ tabbar: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ tabbar: ${msg}`);
        failures++;
    }
};

const src = (f) => join(pkg, 'src', f);
const PAGE = `
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { House, List, User } from 'lucide-react';
import { AppShell, TabBar } from '${src('chrome/app-shell.tsx')}';
import { ToolShell } from '${src('chrome/tool-shell.tsx')}';
import { ParticleText, Wipe, Marquee, schedule } from '${src('motion/index.ts')}';
import { Reveal, Ticker, useInView } from '${src('components/motion.tsx')}';
import { useActiveHeading } from '${src('components/hero.tsx')}';
import { StepPath } from '${src('blocks/step-path.tsx')}';
import { useOnScreen } from '${src('blocks/parts.tsx')}';
import { HalftoneCanvas } from '${src('brand/halftone-canvas.tsx')}';
import { visibleObserver } from '${src('lib/viewport.ts')}';
const q = new URLSearchParams(location.search);
const s = q.get('s');
if (q.has('dark')) document.documentElement.classList.add('dark');
const tabs = [
    { href: '/a', label: 'Home', icon: <House />, active: true },
    { href: '/b', label: 'List', icon: <List /> },
    { href: '/c', label: 'You', icon: <User /> },
];
function OnScreen() {
    const ref = useRef(null);
    const on = useOnScreen(ref, 0.35);
    return <div ref={ref} data-t="" data-on={on ? '' : undefined} style={{ height: 40 }}>on screen</div>;
}
function InView() {
    const [ref, seen] = useInView();
    return <div ref={ref} data-t="" data-seen={seen ? '' : undefined} style={{ height: 40 }}>in view</div>;
}
function Scheduled() {
    const ref = useRef(null);
    useEffect(() => {
        window.__frames = 0;
        const t = schedule(ref.current, { frame() { window.__frames++; return true; } });
        t.wake();
        return () => t.stop();
    }, []);
    return <div ref={ref} data-t="" style={{ height: 40 }}>scheduled</div>;
}
// One observer, counted: each record its callback gets.
function Remake() {
    const ref = useRef(null);
    useEffect(() => {
        window.__calls = 0;
        const io = visibleObserver((records) => (window.__calls += records.length));
        io.observe(ref.current);
        return () => io.disconnect();
    }, []);
    return <div ref={ref} data-t="" style={{ height: 40 }}>watched</div>;
}
function Headings() {
    const active = useActiveHeading(['h-a', 'h-b']);
    return (
        <div>
            <p id="active" style={{ position: 'fixed', top: 0, right: 0, margin: 0 }}>{active}</p>
            <h2 id="h-a" style={{ margin: 0, height: 20, fontSize: 16 }}>A</h2>
            <div style={{ height: +(q.get('gap') ?? 108) }} />
            <h2 id="h-b" style={{ margin: 0, height: 20, fontSize: 16 }}>B</h2>
            <div style={{ height: 2400 }} />
        </div>
    );
}
function Buttons() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
            {Array.from({ length: 20 }, (_, i) => <button key={i} data-b={i} style={{ height: 44 }}>Button {i + 1}</button>)}
        </div>
    );
}
const scenes = {
    text: () => <p data-t="" style={{ fontSize: q.get('px') ? +q.get('px') : 40, lineHeight: 1.15, margin: 0 }}><ParticleText>100%</ParticleText></p>,
    steps: () => <div data-t="" style={{ width: 120 }}><StepPath steps={[{ label: 'One' }, { label: 'Two' }]} /></div>,
    reveal: () => <Reveal><div data-t="" style={{ height: 40 }}>revealed</div></Reveal>,
    ticker: () => <p data-t="" style={{ margin: 0, height: 40 }}><Ticker value={1234} duration={300} /></p>,
    inview: () => <InView />,
    wipe: () => <Wipe><div data-t="" style={{ height: 40, background: '#2a1206' }} /></Wipe>,
    marquee: () => <div data-t="" style={{ height: 40, overflow: 'hidden' }}><Marquee><span style={{ fontSize: 24, paddingRight: 16 }}>Lumen Notes</span></Marquee></div>,
    onscreen: () => <OnScreen />,
    sched: () => <Scheduled />,
    halftone: () => <div data-t="" style={{ width: 360, height: 40, background: '#ff7030' }}><HalftoneCanvas alt="A portrait" /></div>,
};
function Page() {
    const [bar, setBar] = useState(!q.has('nobar') && !q.has('late') && s !== 'late' && s !== 'remake');
    const [second, setSecond] = useState(s === 'two');
    window.__bar = setBar;
    window.__second = setSecond;
    if (s === 'two') return <div>{bar ? <TabBar items={tabs} /> : null}{second ? <TabBar items={tabs} /> : null}</div>;
    if (s === 'remake') return <div><div style={{ height: 2000 }} /><Remake /><div style={{ height: 2000 }} />{bar ? <TabBar items={tabs} /> : null}</div>;
    if (s === 'rail') return <AppShell variant="rail" nav={[{ items: tabs }]}><Buttons /></AppShell>;
    if (s === 'heading') return <div><Headings />{bar ? <TabBar items={tabs} /> : null}</div>;
    // In the shells themselves: the app's (its page scrolls the window) and a tool's, whose last button ends the page.
    if (s === 'focus') return <AppShell product="test" nav={[{ items: tabs }]}><Buttons /></AppShell>;
    if (s === 'focus-tool') return <ToolShell protocol="agent" tools={tabs}><Buttons /></ToolShell>;
    // A Wipe far down makes the shared observer before any bar is mounted. The second comes after the bar, 20px
    // of it above the bar: short of the 12% of what is seen that a Wipe waits for, inside the old 12% of the window.
    if (s === 'late')
        return (
            <div>
                <div style={{ height: innerHeight - 77 }} />
                {second ? <Wipe><div data-t="" style={{ height: 40, background: '#2a1206' }} /></Wipe> : <div style={{ height: 40 }} />}
                <div style={{ height: 2000 }} />
                <Wipe><div style={{ height: 40 }} /></Wipe>
                <div style={{ height: 2000 }} />
                {bar ? <TabBar items={tabs} /> : null}
            </div>
        );
    // Just under the bar: its top 50px above the window's bottom edge (the bar is 57 tall), all of it in the window.
    return (
        <div>
            <div id="spacer" style={{ height: innerHeight - +(q.get('up') ?? 50) }} />
            {scenes[s]()}
            <div style={{ height: 2400 }} />
            {bar ? <TabBar items={tabs} /> : null}
        </div>
    );
}
createRoot(document.getElementById('root')).render(<Page />);
`;

// Every draw (each starts with a clear) on a canvas in the page, and every frame the page's code asks for.
const COUNTERS =
    `<script>window.__draws = 0; window.__rafs = 0; const clear = CanvasRenderingContext2D.prototype.clearRect;` +
    `CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.isConnected) window.__draws++; return clear.apply(this, a); };` +
    `const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__rafs++; return raf(cb); };</script>`;

// What each scene shows once it has been seen, and what it must show while it waits.
const STATE = {
    text: () => document.querySelector('.oca-ptext')?.dataset.form ?? 'none',
    steps: () => document.querySelector('[data-line]')?.dataset.line ?? 'none',
    reveal: () => document.querySelector('[data-t]').parentElement.dataset.reveal ?? 'none',
    ticker: () => document.querySelector('[data-t]').textContent,
    inview: () => ('seen' in document.querySelector('[data-t]').dataset ? 'seen' : 'unseen'),
    wipe: () => document.querySelector('.oca-wipe').dataset.wipe ?? 'none',
    marquee: () => ('away' in document.querySelector('.oca-marquee').dataset ? 'away' : 'here'),
    onscreen: () => ('on' in document.querySelector('[data-t]').dataset ? 'on' : 'off'),
};
const WAIT = { text: 'wait', steps: 'armed', reveal: 'pending', ticker: '0', inview: 'unseen', wipe: 'pending', marquee: 'away', onscreen: 'off' };
const SEEN = { text: 'gather', steps: 'drawing', reveal: 'shown', ticker: '1,234', inview: 'seen', wipe: 'shown', marquee: 'here', onscreen: 'on' };

// The server's markup of an app shell with its bar and twenty buttons, for the walk with no script.
const SSR = `
import { renderToStaticMarkup } from 'react-dom/server';
import { House, List, User } from 'lucide-react';
import { AppShell } from '${src('chrome/app-shell.tsx')}';
const tabs = [
    { href: '/a', label: 'Home', icon: <House />, active: true },
    { href: '/b', label: 'List', icon: <List /> },
    { href: '/c', label: 'You', icon: <User /> },
];
export const markup = renderToStaticMarkup(
    <AppShell product="test" nav={[{ items: tabs }]}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
            {Array.from({ length: 20 }, (_, i) => <button key={i} data-b={i} style={{ height: 44 }}>Button {i + 1}</button>)}
        </div>
    </AppShell>
);
`;

const dir = mkdtempSync(join(tmpdir(), 'app-design-tabbar-'));
try {
    bundle(dir, { tabbar: PAGE });
    compileCss(dir, ['tabbar']);
    const url = writePage(dir, 'tabbar', '<div id="root"></div>', { head: COUNTERS, script: '<script src="tabbar.js"></script>' });
    require('esbuild').buildSync({
        stdin: { contents: SSR, loader: 'jsx', resolveDir: pkg },
        outfile: join(dir, 'ssr.cjs'),
        bundle: true,
        platform: 'node',
        format: 'cjs',
        jsx: 'automatic',
        nodePaths: [join(pkg, 'node_modules')],
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
        logLevel: 'silent',
    });
    const { markup } = require(join(dir, 'ssr.cjs'));
    const ssrLight = writePage(dir, 'ssr', markup);
    const ssrDark = writePage(dir, 'ssr-dark', markup).replace(/ssr-dark\.html$/, 'ssr-dark.html');
    writeFileSync(join(dir, 'ssr-dark.html'), readFileSync(join(dir, 'ssr-dark.html'), 'utf8').replace('<html data-oc-app="ochk">', '<html data-oc-app="ochk" class="dark">'));
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    // safe: a bottom safe-area inset in px, as a phone with a home indicator has (env(safe-area-inset-bottom)).
    const open = async (scene, { width = 390, height = 400, flags = '', page = null, safe = 0 } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, javaScriptEnabled: !page });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        if (safe) await (await ctx.newCDPSession(p)).send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: safe } });
        await p.goto(page ?? `${url}?s=${scene}${flags ? `&${flags}` : ''}`);
        await p.evaluate(() => document.fonts.ready);
        return { p, errors, close: () => ctx.close() };
    };
    const barTop = (p) => p.evaluate(() => document.querySelector('[data-oca-tabbar]')?.getBoundingClientRect().top ?? innerHeight);
    // Where the element is laid out, whatever transform its own motion puts on it.
    const box = (p) =>
        p.evaluate(() => {
            const top = document.getElementById('spacer').getBoundingClientRect().bottom;
            return { top, bottom: top + document.querySelector('[data-t]').offsetHeight };
        });
    // The element into the middle of what is seen: wholly above the bar.
    const intoView = (p) =>
        p.evaluate(() => {
            const el = document.querySelector('[data-t]');
            const bar = document.querySelector('[data-oca-tabbar]')?.getBoundingClientRect().top ?? innerHeight;
            const r = el.getBoundingClientRect();
            window.scrollBy(0, r.top - (bar - r.height) / 2);
        });
    // A state reached by a deadline, or the last one read.
    const until = async (p, fn, want, ms) => {
        const end = Date.now() + ms;
        let got;
        while (Date.now() < end) {
            got = await p.evaluate(fn);
            if (got === want) return got;
            await p.waitForTimeout(100);
        }
        return got;
    };

    try {
        // Each state-bearing user: waiting under the bar, seen above it.
        for (const scene of Object.keys(STATE)) {
            const { p, errors, close } = await open(scene);
            const fn = STATE[scene];
            // The text waits for fonts and an idle moment before it decides; the rest decide on mount.
            await p.waitForTimeout(scene === 'text' ? 2500 : 900);
            const r = await box(p);
            const top = await barTop(p);
            const under = await p.evaluate(fn);
            const draws = await p.evaluate(() => window.__draws);
            // StepPath is taller than the bar, so it is only started under it; the rest sit wholly in the strip it covers.
            const tall = scene === 'steps';
            check(r.top >= top && (tall || r.bottom <= 400.5), `[390x400] ${scene}: the test box is ${Math.round(r.top)} to ${Math.round(r.bottom)}, not under the bar (from ${Math.round(top)})${tall ? '' : ' and in the window'}`);
            check(under === WAIT[scene], `[390x400] ${scene} under the bar reads "${under}", not "${WAIT[scene]}": it counts as seen where the bar covers it`);
            if (scene === 'text') check(draws === 0, `[390x400] text under the bar drew ${draws} times: drawn where no one can see it`);
            // Half of StepPath in the window, but under half of it above the bar: its observer still waits.
            if (tall) {
                await p.evaluate(() => window.scrollBy(0, document.getElementById('spacer').getBoundingClientRect().bottom - (innerHeight - 0.6 * document.querySelector('[data-t]').offsetHeight)));
                const peek = await box(p);
                const h = peek.bottom - peek.top;
                await p.waitForTimeout(600);
                const got = await p.evaluate(fn);
                check((400 - peek.top) / h >= 0.55 && (top - peek.top) / h < 0.45 && got === 'armed', `[390x400] StepPath ${Math.round(((400 - peek.top) / h) * 100)}% in the window and ${Math.round(((top - peek.top) / h) * 100)}% above the bar reads "${got}", not "armed"`);
            }
            // 20px of it above the bar: short of the 10 or 12% of what is seen that they wait for, inside the old
            // margins of the window (40 and 48px), so an observer that does not leave the bar out shows here.
            if (['reveal', 'wipe', 'inview'].includes(scene)) {
                await p.evaluate(() => window.scrollBy(0, document.getElementById('spacer').getBoundingClientRect().bottom - (document.querySelector('[data-oca-tabbar]').getBoundingClientRect().top - 20)));
                await p.waitForTimeout(600);
                const got = await p.evaluate(fn);
                const at = await box(p);
                check(got === WAIT[scene] && Math.abs(at.top - (top - 20)) < 1, `[390x400] ${scene} 20px above the bar (at ${Math.round(at.top)}) reads "${got}", not "${WAIT[scene]}"`);
            }
            await intoView(p);
            const above = await until(p, fn, SEEN[scene], 4000);
            check(above === SEEN[scene] && errors.length === 0, `[390x400] ${scene} moved above the bar reads "${above}", not "${SEEN[scene]}" (${errors[0] ?? 'no page errors'})`);
            await close();
        }
        // The scheduler runs no frames for a scene under the bar, and runs them above it.
        {
            const { p, close } = await open('sched');
            await p.waitForTimeout(600);
            const a = await p.evaluate(() => window.__frames);
            await p.waitForTimeout(500);
            const under = (await p.evaluate(() => window.__frames)) - a;
            await intoView(p);
            await p.waitForTimeout(500);
            const b = await p.evaluate(() => window.__frames);
            await p.waitForTimeout(500);
            const above = (await p.evaluate(() => window.__frames)) - b;
            check(under === 0 && above > 5, `[390x400] the scheduler ran ${under} frames for a scene under the bar and ${above} above it`);
            await close();
        }
        // HalftoneCanvas asks for no frame under the bar, counted from mount, and plays its intro once it is
        // moved above it, after longer under the bar than the intro lasts: its clock starts on screen.
        {
            const { p, close } = await open('halftone');
            await p.waitForTimeout(2500);
            const under = await p.evaluate(() => window.__rafs);
            await intoView(p);
            let above = 0;
            for (const end = Date.now() + 4000; Date.now() < end && above <= 5; await p.waitForTimeout(100)) above = (await p.evaluate(() => window.__rafs)) - under;
            check(under === 0 && above > 5, `[390x400] HalftoneCanvas asked for ${under} frames under the bar from mount and ${above} above it after 2.5 s there; its intro must play on screen`);
            await close();
        }
        // lane-lock's case: vote's share, 56px of text at 807 in an 844 window, the bar from 787.
        {
            const { p, errors, close } = await open('text', { height: 844, flags: 'px=48&up=37' });
            await p.waitForTimeout(2500);
            const r = await p.evaluate(() => document.querySelector('.oca-ptext').getBoundingClientRect().toJSON());
            const top = await barTop(p);
            const under = await p.evaluate(STATE.text);
            const draws = await p.evaluate(() => window.__draws);
            check(r.top >= top && under === 'wait' && draws === 0, `[390x844] the share at ${Math.round(r.top)} to ${Math.round(r.bottom)}, under the bar from ${Math.round(top)}: reads "${under}" with ${draws} draws, not waiting unseen`);
            await intoView(p);
            const above = await until(p, STATE.text, 'gather', 4000);
            check(above === 'gather' && errors.length === 0, `[390x844] the share scrolled above the bar reads "${above}", not gathering`);
            await close();
        }
        // With no bar, an element 50px above the window's edge is on screen, as it always was.
        for (const [scene, want] of [
            ['text', 'place'],
            ['reveal', 'none'],
            ['wipe', 'none'],
            ['steps', 'drawn'],
        ]) {
            const { p, close } = await open(scene, { flags: 'nobar' });
            await p.waitForTimeout(scene === 'text' ? 2500 : 900);
            const got = await p.evaluate(STATE[scene]);
            check(got === want, `[390x400 no bar] ${scene} 50px above the window's edge reads "${got}", not "${want}" as before the bar was known`);
            await close();
        }
        // A shared observer made before the bar: the bar comes, then a Wipe under it, which must wait.
        {
            const { p, close } = await open('late');
            await p.waitForTimeout(400);
            await p.evaluate(() => window.__bar(true));
            await p.waitForTimeout(400);
            await p.evaluate(() => window.__second(true));
            await p.waitForTimeout(1200);
            const got = await p.evaluate(() => document.querySelector('[data-t]').closest('.oca-wipe').dataset.wipe ?? 'none');
            check(got === 'pending', `[390x400] a Wipe added under a bar that came after the first Wipe reads "${got}", not "pending": the shared observer kept its old margin`);
            await close();
        }
        // The bar's height, published from its box: at 390 its own height; from md 0; gone with the bar.
        {
            const { p, close } = await open('reveal');
            const at390 = await p.evaluate(() => [document.documentElement.style.getPropertyValue('--oca-tabbar-h'), document.querySelector('[data-oca-tabbar]').getBoundingClientRect().height]);
            await p.setViewportSize({ width: 800, height: 400 });
            await p.waitForTimeout(300);
            const at800 = await p.evaluate(() => document.documentElement.style.getPropertyValue('--oca-tabbar-h'));
            await p.setViewportSize({ width: 390, height: 400 });
            await p.waitForTimeout(300);
            await p.evaluate(() => window.__bar(false));
            await p.waitForTimeout(300);
            const gone = await p.evaluate(() => document.documentElement.style.getPropertyValue('--oca-tabbar-h'));
            check(at390[1] > 40 && parseFloat(at390[0]) === at390[1], `[390] the bar publishes --oca-tabbar-h "${at390[0]}" for a ${at390[1]}px bar`);
            check(at800 === '0px' && gone === '', `the bar's height reads "${at800}" from md (want 0px) and "${gone}" once it is gone (want nothing)`);
            await close();
        }
        // Two bars at once: the published height stays while either is mounted, and goes with the last.
        {
            const { p, close } = await open('two');
            await p.waitForTimeout(300);
            const read = () => p.evaluate(() => document.documentElement.style.getPropertyValue('--oca-tabbar-h'));
            const both = await read();
            const count = await p.evaluate(() => document.querySelectorAll('[data-oca-tabbar]').length);
            await p.evaluate(() => window.__bar(false));
            await p.waitForTimeout(300);
            const left = await read();
            await p.evaluate(() => window.__second(false));
            await p.waitForTimeout(300);
            const none = await read();
            check(count === 2 && parseFloat(both) > 40 && left === both && none === '', `two bars: "${both}" with ${count} mounted, "${left}" when the first unmounts (want "${both}"), "${none}" when both are gone (want nothing)`);
            await close();
        }
        // An observer remade when the bar comes lets the old one go: one callback when the element comes in, not two.
        {
            const { p, close } = await open('remake');
            await p.waitForTimeout(400);
            const a = await p.evaluate(() => window.__calls);
            await p.evaluate(() => window.__bar(true));
            await p.waitForTimeout(400);
            const b = await p.evaluate(() => window.__calls);
            await p.evaluate(() => document.querySelector('[data-t]').scrollIntoView({ block: 'center' }));
            await p.waitForTimeout(500);
            const c = await p.evaluate(() => window.__calls);
            check(a === 1 && b - a === 1 && c - b === 1, `visibleObserver: ${a} record at first, ${b - a} when the bar came, ${c - b} when the element came into view (want 1, 1, 1)`);
            await close();
        }
        // Each shell's room under its content is the bar's own height, so a page's end is clear of it.
        for (const scene of ['focus', 'focus-tool', 'rail']) {
            const { p, close } = await open(scene);
            await p.waitForTimeout(300);
            const r = await p.evaluate(() => {
                const room = document.getElementById('main-content')?.closest('[class*="max-md:pb-"]');
                return { bar: document.querySelector('[data-oca-tabbar]')?.getBoundingClientRect().height ?? 0, room: room ? parseFloat(getComputedStyle(room).paddingBottom) : null };
            });
            check(r.bar > 40 && r.room !== null && Math.abs(r.room - r.bar) < 0.5, `[390] ${scene}: the room under the content is ${r.room}px for a ${r.bar}px bar`);
            await close();
        }
        // A narrow page with no bar has no bottom scroll padding; one with a bar has the bar's height and 12px.
        {
            const none = await open('reveal', { flags: 'nobar' });
            const without = await none.p.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
            await none.close();
            const some = await open('reveal');
            await some.p.waitForTimeout(300);
            const [withBar, h] = await some.p.evaluate(() => [getComputedStyle(document.documentElement).scrollPaddingBottom, document.querySelector('[data-oca-tabbar]').getBoundingClientRect().height]);
            await some.close();
            check(without === 'auto', `[390] a page with no bar has scroll-padding-bottom ${without}, not auto`);
            check(parseFloat(withBar) === h + 12, `[390] a page with a ${h}px bar has scroll-padding-bottom ${withBar}, not ${h + 12}px`);
        }
        // The heading being read is in the upper 35% of what is seen (80 to 120 here), not of the window under the
        // bar (80 to 140) and not a band narrowed by a percent taken of the whole window (80 to 83).
        for (const [gap, want] of [
            [108, 'h-a'],
            [80, 'h-b'],
        ]) {
            const { p, close } = await open('heading', { flags: `gap=${gap}` });
            await p.waitForTimeout(600);
            const got = await p.evaluate(() => document.getElementById('active').textContent);
            const b = await p.evaluate(() => document.getElementById('h-b').getBoundingClientRect().top);
            check(got === want, `[390x400] useActiveHeading reads "${got}" with B at ${Math.round(b)} (want ${want}: the band is 80 to 120 of the 343px seen)`);
            await close();
        }
        // The padding and the room exactly, from the bar's own box: with script (the published height) and without
        // it (the fallback, which must hold the bar's hairline and safe area), at no inset and at a 34px one.
        for (const [name, o] of [
            ['the server page, no script', { page: ssrLight }],
            ['the server page, no script, dark', { page: ssrDark }],
            ['focus', {}],
        ]) {
            for (const safe of [0, 34]) {
                const { p, close } = await open(name.split(' ')[0], { ...o, safe });
                await p.waitForTimeout(300);
                const r = await p.evaluate(() => {
                    const room = document.getElementById('main-content')?.closest('[class*="max-md:pb-"]');
                    return {
                        bar: document.querySelector('[data-oca-tabbar]').getBoundingClientRect().height,
                        pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
                        room: room ? parseFloat(getComputedStyle(room).paddingBottom) : null,
                    };
                });
                check(Math.abs(r.bar - (57 + safe)) < 0.5 && Math.abs(r.pad - (r.bar + 12)) < 0.5 && Math.abs(r.room - r.bar) < 0.5, `[390, safe area ${safe}] ${name}: a ${r.bar}px bar (want ${57 + safe}) has scroll-padding-bottom ${r.pad}px (want ${r.bar + 12}) and room ${r.room}px (want ${r.bar})`);
                await close();
            }
        }
        // Focus: Tab down twenty buttons in a shell; the one in focus is never under the bar, the last one at the
        // page's end included (the shell's room under its content is the bar's own height).
        const walks = [
            ['focus', {}],
            ['focus dark', { flags: 'dark' }],
            ['focus-tool', {}],
            ['focus-tool dark', { flags: 'dark' }],
            ['the server page, no script', { page: ssrLight }],
            ['the server page, no script, dark', { page: ssrDark }],
        ];
        for (const [name, o] of walks) {
            const { p, close } = await open(name.split(' ')[0], o);
            const top = await barTop(p);
            const under = [];
            let seen = 0;
            for (let i = 0; i < 40 && seen < 20; i++) {
                await p.keyboard.press('Tab');
                const f = await p.evaluate(() => ({ b: document.activeElement?.dataset.b, bottom: document.activeElement?.getBoundingClientRect().bottom }));
                if (f.b === undefined) continue;
                seen++;
                if (f.bottom > top + 0.5) under.push(`${+f.b + 1} ends at ${Math.round(f.bottom)}`);
            }
            check(top < 400 && seen === 20 && under.length === 0, `[390x400] ${name}: tabbing down, ${under.length} of ${seen} focused buttons end under the bar (from ${Math.round(top)}): ${under.slice(0, 3).join('; ')}`);
            await close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} tabbar failure(s)`);
    process.exit(1);
}
console.log(`✓ tabbar: ${checks} checks in Chrome at 390; nothing under the phone's TabBar counts as seen, the bar's height is published once, and focus stays above it`);
