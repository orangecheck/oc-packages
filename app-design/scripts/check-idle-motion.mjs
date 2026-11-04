#!/usr/bin/env node
/*
 * What ./motion costs while nothing happens, in Chrome on SwiftShader:
 *
 * - Every canvas scene draws its motion and then nothing: no draw and no
 *   requestAnimationFrame at rest, so the page asks for no frames at all.
 * - Under reduced motion each draws one still frame (MiniCheck draws none:
 *   it shows the mark), notes and posters stand, scroll stories show their
 *   end, stacks unstick, the marquee stops and nothing wipes.
 * - Offscreen, and in a hidden tab, a scene sleeps; it draws when it is seen.
 * - The portrait's pause holds it still; its pointer lens draws only while
 *   the pointer moves. The crowd draws once per change of the story's --p.
 * - The portrait reads formed only as its loop sleeps: no frame runs and
 *   nothing draws after, with motion, under reduced motion and after a
 *   replay. Its notes come in once the dots gather, while it still forms.
 * - DitherImage is its still until a fine pointer moves over it, then clear
 *   again within about a second; never under reduced motion or on touch.
 * - The headline swap never shows both headlines at once.
 * - Without script the portrait's poster and notes stand.
 *
 * Run after `yarn build` (it reads the CSS as a site compiles it).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle, compileCss, findChrome, pkg, writePage } from './browser.mjs';

const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/motion.js'))) {
    console.error('✗ idle-motion: dist is missing; run yarn build first');
    process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ idle-motion: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ idle-motion: ${msg}`);
        failures++;
    }
};

const PAGE = `
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ParticlePortrait, ParticleText, CrowdDissolve, StorySwap, MiniCheck, StackCards, Marquee, Wipe, DitherImage, ScrollStory, PORTRAIT_ANCHORS, schedule, bustPoints, deckPortraitPoints } from '${join(pkg, 'src/motion/index.ts')}';
const q = new URLSearchParams(location.search);
const s = q.get('s');
// A two-tone still to dither: soft blobs through Bayer 4x4, burnt on paper.
function still() {
    const w = 480, h = 320, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    // A page without a 2D canvas (?nocanvas) gets a blank still.
    if (!x) return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"/>');
    const img = x.createImageData(w, h), B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const l = 0.5 + 0.3 * Math.sin(i / 40) * Math.cos(j / 30), d = l < (B[(j & 3) * 4 + (i & 3)] + 0.5) / 16, o = (j * w + i) * 4;
        img.data[o] = d ? 42 : 238; img.data[o + 1] = d ? 18 : 234; img.data[o + 2] = d ? 6 : 230; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
}
// Two scenes on the loop, the first broken: the second must still get its 30 frames.
function Loop() {
    useEffect(() => {
        window.__good = 0;
        window.__failed = 0;
        const bad = schedule(document.getElementById('bad'), { frame() { throw new Error('a broken scene'); } }, { onError: () => window.__failed++ });
        const good = schedule(document.getElementById('good'), { frame: () => ++window.__good < 30 });
        bad.wake();
        good.wake();
        return () => { bad.stop(); good.stop(); };
    }, []);
    return <div><div id="bad" style={{ height: 40 }} /><div id="good" style={{ height: 40 }} /></div>;
}
// Every console.error the page logs, counted.
window.__logged = 0;
const logError = console.error;
console.error = (...a) => { window.__logged++; logError(...a); };
// Points that read well while the scene builds, then throw in its second frame.
function brokenPoints() {
    const n = 200, x = new Float32Array(n), y = new Float32Array(n), tone = new Float32Array(n).fill(0.5);
    for (let i = 0; i < n; i++) { x[i] = (i % 20) / 20; y[i] = Math.floor(i / 20) / 10; }
    let reads = 0;
    const trap = (a) => new Proxy(a, { get: (t, k) => { if (typeof k === 'string' && /^[0-9]+$/.test(k) && ++reads > n * 5) throw new Error('broken points'); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
    return { count: n, x: trap(x), y, tone, pitch: 0.02 };
}
window.__anchors = PORTRAIT_ANCHORS;
window.__bust = bustPoints;
const notes = [{ at: PORTRAIT_ANCHORS.eye, label: 'First note' }, { at: PORTRAIT_ANCHORS.shoulder, label: 'Second note', side: 'right' }];
const scenes = {
    portrait: () => <ParticlePortrait alt="A person drawn in dots" callouts={notes} style={{ height: 600 }} />,
    text: () => <p style={{ fontSize: 160, lineHeight: 1, textAlign: 'center' }}><ParticleText>80%</ParticleText></p>,
    crowd: () => (
        <ScrollStory length={3}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', width: '100%' }}>
                <StorySwap before={<h2 id="before">Before</h2>} after={<h2 id="after">After</h2>} />
                <CrowdDissolve style={{ aspectRatio: '4 / 3' }} />
            </div>
        </ScrollStory>
    ),
    check: () => <MiniCheck title="Signed in" />,
    stack: () => <StackCards top="1rem">{[1, 2, 3].map((n) => <div key={n} style={{ height: 500, background: '#fff', border: '1px solid #ccc' }}>Card {n}</div>)}</StackCards>,
    marquee: () => <Marquee><span style={{ fontSize: 64, paddingRight: 32 }}>Lumen Notes</span><span style={{ fontSize: 64, paddingRight: 32 }}>Halfway Books</span></Marquee>,
    wipe: () => <Wipe><div id="wiped" style={{ height: 300, background: '#2a1206' }} /></Wipe>,
    loop: () => <Loop />,
    // A Wipe from its middle, carrying its own id and label.
    wipecenter: () => <Wipe from="center" id="wiped-center" aria-label="A statement"><div style={{ height: 300, background: '#2a1206' }} /></Wipe>,
    // Scenes whose first layout can fail: text sampled through getImageData, and a dither over a cross-origin still.
    fails: () => (
        <div>
            <p style={{ fontSize: 120 }}><ParticleText>80%</ParticleText></p>
            <DitherImage src={still()} width={480} height={320} alt="" style={{ width: 480 }} />
        </div>
    ),
    broken: () => <ParticlePortrait alt="A picture that fails" points={brokenPoints()} poster={<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>} callouts={notes} style={{ height: 600 }} />,
    deck: () => <ParticlePortrait alt="The deck portrait" points={deckPortraitPoints} style={{ height: 600 }} />,
    // Every ./motion scene on one page, as a site's test renders them. (ScrollStory is foundation's, in
    // components/motion.tsx, which guards its own matchMedia; the swap and the crowd stand without it.)
    all: () => (
        <div>
            <ParticlePortrait alt="A person drawn in dots" callouts={notes} style={{ height: 600 }} />
            <p style={{ fontSize: 120 }}><ParticleText>80%</ParticleText></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', width: '100%' }}>
                <StorySwap before={<h2>Before</h2>} after={<h2>After</h2>} />
                <CrowdDissolve style={{ aspectRatio: '4 / 3' }} />
            </div>
            <MiniCheck title="Signed in" />
            <StackCards top="1rem">{[1, 2, 3].map((n) => <div key={n} style={{ height: 300 }}>Card {n}</div>)}</StackCards>
            <Marquee><span style={{ fontSize: 64, paddingRight: 32 }}>Lumen Notes</span></Marquee>
            <Wipe><div style={{ height: 200, background: '#2a1206' }} /></Wipe>
            <DitherImage src={still()} width={480} height={320} alt="" style={{ width: 480 }} />
        </div>
    ),
    // A crowd either side of the switch to the narrow grid, at its end (no story drives it).
    crowds: () => (
        <div>
            <CrowdDissolve style={{ aspectRatio: '4 / 3', width: 600 }} />
            <CrowdDissolve style={{ aspectRatio: '4 / 3', width: 360 }} />
        </div>
    ),
    dither: () => <DitherImage src={q.get('src') ?? still()} width={480} height={320} alt="" dark="#2a1206" light="#eeeae6" style={{ width: 480 }} />,
};
const above = s === 'crowd' || s === 'stack' ? 200 : s === 'wipe' || s === 'wipecenter' ? 1200 : q.has('off') ? 3000 : 0;
const root = createRoot(document.getElementById('root'));
root.render(<div><div style={{ height: above }} />{scenes[s]()}<div style={{ height: 2400 }} /></div>);
window.__unmount = () => root.unmount();
`;

// Count every draw (each starts with a clear) on a canvas in the page, and every frame the page's code asks
// for; the page's own tick, on the untouched rAF, proves frames are being made at all.
const COUNTERS =
    // ?dark: the page on a dark ground, as next-themes marks it.
    `<script>if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('dark');` +
    // ?nomm: a DOM without matchMedia (jsdom); ?nocanvas: one without a 2D canvas either.
    `if (location.search.includes('nomm')) Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true });` +
    `if (location.search.includes('nocanvas')) HTMLCanvasElement.prototype.getContext = () => null;` +
    // ?taint: every getImageData throws as a tainted canvas does.
    `if (location.search.includes('taint')) CanvasRenderingContext2D.prototype.getImageData = () => { throw new DOMException('tainted', 'SecurityError'); };` +
    // ResizeObservers alive (observing and not yet disconnected), to see a scene let go of its own.
    `window.__ro = 0; const RO = window.ResizeObserver; window.ResizeObserver = class extends RO { constructor(cb) { super(cb); window.__ro++; this.__on = true; } disconnect() { if (this.__on) { this.__on = false; window.__ro--; } super.disconnect(); } };` +
    // Pointer listeners held on elements, to see a scene that stops let go of its own.
    `const held = []; window.__held = (sel) => held.filter((h) => h.t instanceof Element && h.t.closest(sel)).length;` +
    `const on = EventTarget.prototype.addEventListener, off = EventTarget.prototype.removeEventListener; const at = (t, type, fn) => held.findIndex((h) => h.t === t && h.type === type && h.fn === fn);` +
    `EventTarget.prototype.addEventListener = function (type, fn, o) { if (type.startsWith('pointer') && fn && at(this, type, fn) < 0) held.push({ t: this, type, fn }); return on.call(this, type, fn, o); };` +
    `EventTarget.prototype.removeEventListener = function (type, fn, o) { const i = at(this, type, fn); if (i >= 0) held.splice(i, 1); return off.call(this, type, fn, o); };` +
    // Each canvas keeps the squares it filled since its last clear: the frame on show.
    `window.__draws = 0; window.__rafs = 0; const clear = CanvasRenderingContext2D.prototype.clearRect;` +
    `CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.isConnected) window.__draws++; this.canvas.__rects = []; return clear.apply(this, a); };` +
    `const fill = CanvasRenderingContext2D.prototype.fillRect; CanvasRenderingContext2D.prototype.fillRect = function (...a) { (this.canvas.__rects ??= []).push(a); return fill.apply(this, a); };` +
    `const put = CanvasRenderingContext2D.prototype.putImageData; CanvasRenderingContext2D.prototype.putImageData = function (...a) { if (this.canvas.isConnected) window.__draws++; return put.apply(this, a); };` +
    `const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__rafs++; return raf((t) => { window.__cbs++; cb(t); }); };` +
    // The moment a scene last read formed: the frames run and the draws so far.
    `window.__cbs = 0; window.__formedAt = null;` +
    `new MutationObserver((rs) => { for (const r of rs) if (r.target.dataset.phase === 'formed' && r.oldValue !== 'formed') window.__formedAt = { cbs: window.__cbs, draws: window.__draws }; })` +
    `.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-phase'], attributeOldValue: true });` +
    `window.__ticks = 0; (function tick() { window.__ticks++; raf(tick); })();</script>`;

const dir = mkdtempSync(join(tmpdir(), 'app-design-idle-motion-'));
try {
    bundle(dir, { motion: PAGE });
    compileCss(dir, ['motion']);
    const url = writePage(dir, 'motion', '<div id="root"></div>', { head: COUNTERS, script: '<script src="motion.js"></script>' });
    // The server's markup, from the build, for the page without script.
    process.env.NODE_ENV = 'production';
    const { createElement: h } = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const M = require(join(pkg, 'dist/motion.js'));
    const serverPage = writePage(
        dir,
        'server',
        renderToStaticMarkup(
            h(
                'div',
                null,
                h(M.ParticlePortrait, { alt: 'A person drawn in dots', callouts: [{ at: M.PORTRAIT_ANCHORS.eye, label: 'First note' }], style: { height: 600 } }),
                h(M.StorySwap, { before: h('h2', null, 'Before'), after: h('h2', null, 'After') }),
                h(M.CrowdDissolve, { style: { aspectRatio: '4 / 3', width: 600 } }),
                h(M.CrowdDissolve, { style: { aspectRatio: '4 / 3', width: 360 } })
            )
        )
    );
    // The same markup on a dark page: the posters must draw a positive in light ink, not the paper frame inverted.
    const serverDark = serverPage.replace(/server\.html$/, 'server-dark.html');
    writeFileSync(fileURLToPath(serverDark), readFileSync(fileURLToPath(serverPage), 'utf8').replace('<html data-oc-app="ochk">', '<html data-oc-app="ochk" class="dark">'));
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });

    const read = (p) => p.evaluate(() => ({ draws: window.__draws, rafs: window.__rafs, ticks: window.__ticks }));
    // What the page did over a stretch in which it made 10 frames or more: a stalled page proves nothing.
    const over = async (p, ms) => {
        const a = await read(p);
        await p.waitForTimeout(ms);
        while ((await read(p)).ticks - a.ticks < 10) await p.waitForTimeout(100);
        const b = await read(p);
        return { draws: b.draws - a.draws, rafs: b.rafs - a.rafs };
    };
    // Frames, not seconds, end the motion, and a CI runner draws slowly: wait for a stretch with no draw and no frame asked.
    const settle = async (p, maxMs = 20000) => {
        const start = Date.now();
        while (Date.now() - start < maxMs) {
            const d = await over(p, 600);
            if (d.draws === 0 && d.rafs === 0) return true;
        }
        return false;
    };
    // After the scene last read formed: the frames that ran and the draws, which a page waiting for formed must not see.
    const sinceFormed = (p) => p.evaluate(() => window.__formedAt && { cbs: window.__cbs - window.__formedAt.cbs, draws: window.__draws - window.__formedAt.draws });
    const formedLast = (f) => (f ? `${f.cbs} frames ran and ${f.draws} draws after it read formed` : 'it never read formed');
    const open = async (scene, { reduce = false, width = 1280, height = 900, js = true, off = false, touch = false, flags = '' } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js, hasTouch: touch, isMobile: touch });
        const p = await ctx.newPage();
        const errors = [];
        p.on('pageerror', (e) => errors.push(e.message));
        await p.goto(`${url}?s=${scene}${off ? '&off' : ''}${flags ? `&${flags}` : ''}`);
        return { p, errors, close: () => ctx.close() };
    };
    const hide = (p, hidden) =>
        p.evaluate((h) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
            document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);

    try {
        // ParticlePortrait: it gathers, the notes come in, the wave passes, and then the page asks for nothing.
        {
            const { p, close } = await open('portrait');
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            // The notes stand once the dots gather, while the light still passes: not only once the loop sleeps.
            const notesAt = await p
                .waitForFunction(() => getComputedStyle(document.querySelector('.oca-note-label')).opacity === '1', null, { timeout: 8000, polling: 100 })
                .then(() => p.getAttribute('.oca-portrait', 'data-phase'), () => 'never');
            check(notesAt === 'forming', `portrait: its notes stood at phase ${notesAt}, not while it still forms`);
            const idle = await settle(p);
            const drew = await p.evaluate(() => window.__draws);
            check(drew > 30, `portrait: its motion drew ${drew} frames`);
            check(idle, 'portrait: after its motion it never stops drawing or asking for frames');
            check((await p.getAttribute('.oca-portrait', 'data-phase')) === 'formed', 'portrait: once settled its phase is not formed');
            const formed = await sinceFormed(p);
            check(formed?.cbs === 0 && formed?.draws === 0, `portrait: ${formedLast(formed)}`);
            const noteOpacity = await p.evaluate(() => getComputedStyle(document.querySelector('.oca-note-label')).opacity);
            check(noteOpacity === '1', `portrait: a note's label is at opacity ${noteOpacity} once formed`);
            check((await p.getAttribute('.oca-portrait-control', 'aria-label')) === 'Replay animation', 'portrait: once settled the control does not offer a replay');
            // The lens: draws while the pointer moves, nothing once it rests or leaves.
            const box = await p.locator('.oca-portrait-stage').boundingBox();
            const before = await p.evaluate(() => window.__draws);
            for (let i = 0; i <= 10; i++) await p.mouse.move(box.x + box.width / 2 - 100 + i * 20, box.y + 200, { steps: 2 });
            const resting = await settle(p);
            check((await p.evaluate(() => window.__draws)) - before > 3, 'portrait: the pointer moving over it drew nothing');
            check(resting, 'portrait: with the pointer at rest it never stops');
            check((await p.evaluate(() => window.__held('.oca-portrait'))) > 0, 'portrait: no pointer listener on it for the lens');
            await p.mouse.move(box.x + box.width + 400, box.y + 100, { steps: 3 });
            check(await settle(p), 'portrait: after the pointer left it never stops');
            // A replay passes the light again: forming while it plays, formed as it sleeps, with no frame after.
            await p.click('.oca-portrait-control');
            const replaying = await p.waitForFunction(() => document.querySelector('.oca-portrait').dataset.phase === 'forming', null, { timeout: 3000, polling: 100 }).then(() => true, () => false);
            check(replaying, 'portrait: a replay plays while its phase still reads formed');
            check(await settle(p), 'portrait: after a replay it never settles');
            const replayed = await sinceFormed(p);
            check(replayed?.cbs === 0 && replayed?.draws === 0, `portrait after a replay: ${formedLast(replayed)}`);
            await close();
        }
        // Paused mid-gather: nothing drawn, nothing asked; playing again finishes and sleeps.
        {
            const { p, close } = await open('portrait');
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            await p.click('.oca-portrait-control');
            check((await p.getAttribute('.oca-portrait-control', 'aria-label')) === 'Play animation', 'portrait: the pause control does not turn into play');
            // The lens may ease out for a moment as the pointer reaches the button; then nothing at all.
            const stilled = await settle(p, 3000);
            const held = await over(p, 1000);
            check(stilled && held.draws === 0 && held.rafs === 0, `portrait paused mid-gather: ${held.draws} draws and ${held.rafs} frames asked`);
            check((await p.getAttribute('.oca-portrait', 'data-phase')) !== 'formed', 'portrait: paused at once, yet it formed (the pause came too late to test)');
            await p.click('.oca-portrait-control');
            check(await settle(p), 'portrait: after play it never settles');
            await close();
        }
        // A hidden tab: it stops asking for frames, and goes on when shown.
        {
            const { p, close } = await open('portrait');
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            await hide(p, true);
            await p.waitForTimeout(200);
            const away = await over(p, 1000);
            await hide(p, false);
            const back = await over(p, 600);
            check(away.draws === 0 && away.rafs === 0 && back.draws > 0, `portrait in a hidden tab: ${away.draws} draws and ${away.rafs} frames while hidden, ${back.draws} once shown`);
            await close();
        }
        // Offscreen: it sleeps, then plays when it comes into view.
        {
            const { p, close } = await open('portrait', { off: true });
            await p.waitForTimeout(2500);
            const away = await over(p, 1000);
            await p.evaluate(() => document.querySelector('.oca-portrait').scrollIntoView());
            const seen = await over(p, 800);
            check(away.draws === 0 && away.rafs === 0 && seen.draws > 0, `portrait offscreen: ${away.draws} draws and ${away.rafs} frames while away, ${seen.draws} once in view`);
            await close();
        }
        // Reduced motion: one still frame, the notes standing, no control.
        {
            const { p, close } = await open('portrait', { reduce: true });
            // Polled on a timer: its one frame both draws and forms it, and a wait polled by frames would count as one after.
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000, polling: 100 });
            await p.waitForTimeout(800);
            const still = await p.evaluate(() => ({
                draws: window.__draws,
                control: getComputedStyle(document.querySelector('.oca-portrait-control')).display,
                note: getComputedStyle(document.querySelector('.oca-note-label')).opacity,
            }));
            check(still.draws === 1, `portrait under reduced motion: ${still.draws} draws, not one`);
            check(still.control === 'none', 'portrait under reduced motion: the pause control shows with nothing to pause');
            check(still.note === '1', `portrait under reduced motion: a note is at opacity ${still.note}`);
            check(await settle(p), 'portrait under reduced motion: it keeps asking for frames');
            const formed = await sinceFormed(p);
            check(formed?.cbs === 0 && formed?.draws === 0, `portrait under reduced motion: ${formedLast(formed)}`);
            await close();
        }
        // Without script: the server's markup alone shows the settled poster and the notes; the crowd shows its end.
        {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
            const p = await ctx.newPage();
            await p.goto(serverPage);
            const r = await p.evaluate(() => ({
                poster: getComputedStyle(document.querySelector('.oca-portrait-poster')).opacity,
                path: document.querySelector('.oca-portrait-poster path')?.getAttribute('d')?.length ?? 0,
                note: getComputedStyle(document.querySelector('.oca-note-label')).opacity,
                crowd: getComputedStyle(document.querySelector('.oca-crowd-poster')).opacity,
                swap: getComputedStyle(document.querySelector('[data-swap="after"]')).clipPath,
            }));
            check(r.poster === '1' && r.path > 1000, `no script: the portrait poster is at opacity ${r.poster} with a ${r.path}-character path`);
            check(r.note === '1', `no script: a note is at opacity ${r.note}`);
            check(r.crowd === '1', `no script: the crowd's end-state poster is at opacity ${r.crowd}`);
            check(r.swap === 'none', `no script: the story's end headline is clipped (${r.swap})`);
            // Each ground shows its own frame of the portrait, and the crowd's end: a grid of ghosts and the backed few.
            for (const [url, dark] of [
                [serverPage, false],
                [serverDark, true],
            ]) {
                await p.goto(url);
                const g = await p.evaluate(() => {
                    const shown = (sel) => getComputedStyle(document.querySelector(sel)).display !== 'none';
                    return {
                        ink: shown('.oca-portrait-ink'),
                        light: shown('.oca-portrait-light'),
                        colour: getComputedStyle(document.querySelector('.oca-portrait-poster')).color,
                        ghosts: document.querySelector('.oca-crowd-poster rect')?.getAttribute('fill') ?? '',
                        crowdColour: getComputedStyle(document.querySelector('.oca-crowd-poster')).color,
                        // Per crowd, the poster its width shows and the backed figures in it.
                        shown: [...document.querySelectorAll('.oca-crowd')].map((c) => {
                            const on = [...c.querySelectorAll('.oca-crowd-poster')].filter((s) => getComputedStyle(s).display !== 'none');
                            return on.map((s) => `${s.dataset.size}:${s.querySelectorAll('g svg').length}`).join();
                        }),
                    };
                });
                const lum = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, v) => a + Number(v), 0) / 3;
                const ground = dark ? 'dark' : 'light';
                check(g.ink === !dark && g.light === dark, `no script, ${ground} page: the portrait poster shows ink ${g.ink}, light ${g.light}`);
                check(dark ? lum(g.colour) > 200 && lum(g.crowdColour) > 200 : lum(g.colour) < 80 && lum(g.crowdColour) < 80, `no script, ${ground} page: the posters draw in ${g.colour} and ${g.crowdColour}`);
                check(/^url\(#.+-place\)$/.test(g.ghosts), `no script, ${ground} page: the crowd poster's ghosts are '${g.ghosts}'`);
                check(g.shown.join(' ') === 'wide:8 narrow:8', `no script, ${ground} page: the crowds show ${g.shown.join(' ')}, not the wide grid at 600px and the narrow at 360, 8 backed each`);
            }
            await ctx.close();
        }

        // Layout: the controls are 44px targets; beside the picture on a desk the notes are labels on leaders,
        // on a phone numbered marks with the notes listed under it; nothing widens a phone.
        for (const [width, height] of [
            [390, 844],
            [1440, 900],
        ]) {
            const { p, close } = await open('portrait', { width, height });
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            const r = await p.evaluate(() => {
                const shown = (sel) => {
                    const el = document.querySelector(sel);
                    return Boolean(el && el.getClientRects().length && getComputedStyle(el).display !== 'none');
                };
                const c = document.querySelector('.oca-portrait-control').getBoundingClientRect();
                return { control: [c.width, c.height], labels: shown('.oca-note-label'), legend: shown('.oca-portrait-legend'), wide: document.documentElement.scrollWidth };
            });
            check(r.control[0] >= 44 && r.control[1] >= 44, `[${width}] portrait: the pause control is ${r.control.map(Math.round).join('x')}px, under 44`);
            check(width < 600 ? !r.labels && r.legend : r.labels && !r.legend, `[${width}] portrait notes: labels shown ${r.labels}, list shown ${r.legend}`);
            check(r.wide <= width, `[${width}] portrait: the page is ${r.wide}px wide`);
            await close();
        }
        {
            const { p, close } = await open('marquee', { width: 390, height: 844 });
            const r = await p.evaluate(() => ({ c: document.querySelector('.oca-marquee-control').getBoundingClientRect().toJSON(), wide: document.documentElement.scrollWidth }));
            check(r.c.width >= 44 && r.c.height >= 44 && r.wide <= 390, `[390] marquee: control ${Math.round(r.c.width)}x${Math.round(r.c.height)}px, page ${r.wide}px wide`);
            await close();
        }

        // ParticleText: on screen at load it turns to dots in place and draws once; the text stays the text.
        {
            const { p, close } = await open('text');
            await p.waitForFunction(() => document.querySelector('.oca-ptext[data-live]'), null, { timeout: 8000 });
            check(await settle(p), 'text: on screen at load it never stops drawing');
            const t = await p.evaluate(() => ({ draws: window.__draws, text: document.querySelector('.oca-ptext').textContent, hidden: document.querySelector('.oca-ptext canvas').getAttribute('aria-hidden') }));
            check(t.draws === 1, `text on screen at load: ${t.draws} draws, not one`);
            check(t.text === '80%' && t.hidden === 'true', `text: the words are "${t.text}" and the canvas aria-hidden is ${t.hidden}`);
            await close();
        }
        // Below the fold: nothing until seen, then the gather, then sleep.
        {
            const { p, close } = await open('text', { off: true });
            await p.waitForTimeout(2500);
            const away = await over(p, 800);
            await p.evaluate(() => document.querySelector('.oca-ptext').scrollIntoView({ block: 'center' }));
            const idle = await settle(p);
            const drew = await p.evaluate(() => window.__draws);
            check(away.draws === 0 && away.rafs === 0, `text offscreen: ${away.draws} draws and ${away.rafs} frames while away`);
            check(drew > 10 && idle, `text: in view it drew ${drew} frames and ${idle ? 'slept' : 'never slept'}`);
            await close();
        }
        {
            const { p, close } = await open('text', { reduce: true, off: true });
            await p.evaluate(() => document.querySelector('.oca-ptext').scrollIntoView({ block: 'center' }));
            await p.waitForFunction(() => document.querySelector('.oca-ptext[data-live]'), null, { timeout: 8000 });
            await p.waitForTimeout(800);
            check((await p.evaluate(() => window.__draws)) === 1, 'text under reduced motion: not one still frame');
            await close();
        }

        // CrowdDissolve: the scroll is its clock. At rest nothing; each scroll step one draw at most.
        {
            const { p, close } = await open('crowd');
            await p.waitForFunction(() => document.querySelector('.oca-crowd[data-live]'), null, { timeout: 8000 });
            check(await settle(p), 'crowd: at rest it keeps drawing or asking for frames');
            const story = await p.evaluate(() => document.querySelector('.oca-crowd').closest('[style*="height"]').getBoundingClientRect().height);
            const travel = story - 900;
            const a = await p.evaluate(() => window.__draws);
            const steps = [0.1, 0.3, 0.45, 0.55, 0.7];
            for (const k of steps) {
                await p.evaluate((y) => window.scrollTo(0, y), 200 + travel * k);
                await p.waitForTimeout(250);
            }
            const quiet = await settle(p);
            const drew = (await p.evaluate(() => window.__draws)) - a;
            check(drew >= steps.length && drew <= steps.length * 3, `crowd: ${steps.length} scroll steps drew ${drew} frames`);
            check(quiet, 'crowd: after the scroll stops it keeps drawing');
            await close();
        }
        // The canvas crowd's grid follows its box: 10 x 6 at 600px, 6 x 5 under 480 (read from the squares drawn,
        // grouped where the gap between figures is wider than three cells).
        {
            const { p, close } = await open('crowds');
            await p.waitForFunction(() => document.querySelectorAll('.oca-crowd[data-live]').length === 2, null, { timeout: 8000 });
            check(await settle(p), 'crowds at their end: they keep drawing');
            const grids = await p.evaluate(() =>
                [...document.querySelectorAll('.oca-crowd canvas')].map((c) => {
                    const cell = Math.min(...c.__rects.map((r) => r[2]));
                    const bands = (v) => [...new Set(v)].sort((a, b) => a - b).filter((x, i, u) => i === 0 || x - u[i - 1] > 3 * cell).length;
                    return `${bands(c.__rects.map((r) => r[0]))}x${bands(c.__rects.map((r) => r[1]))}`;
                })
            );
            check(grids.join(' ') === '10x6 6x5', `crowd on the canvas: grids ${grids.join(' ')} at 600px and 360px, not 10x6 and 6x5`);
            await close();
        }
        // The swap: never both headlines at once, sampled through the crossing.
        {
            const { p, close } = await open('crowd');
            await p.waitForFunction(() => document.querySelector('.oca-swap[data-state="before"]'), null, { timeout: 8000 });
            const story = await p.evaluate(() => document.querySelector('.oca-swap').closest('[style*="height"]').getBoundingClientRect().height);
            await p.evaluate((y) => window.scrollTo(0, y), 200 + (story - 900) * 0.7);
            const both = await p.evaluate(
                () =>
                    new Promise((done) => {
                        // A state shows when its clip leaves more than a sliver of it.
                        const shown = (el) => {
                            const m = getComputedStyle(el).clipPath.match(/inset\(([\d.]+)%?(?:px)?\s+([\d.]+)%?(?:px)?\s+([\d.]+)%?/);
                            if (!m) return getComputedStyle(el).clipPath === 'none';
                            return 100 - Number(m[1]) - Number(m[3]) > 4;
                        };
                        const els = [...document.querySelectorAll('.oca-swap-state')];
                        let overlap = 0;
                        const t0 = performance.now();
                        const tick = () => {
                            if (els.every(shown)) overlap++;
                            if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
                            else done(overlap);
                        };
                        tick();
                    })
            );
            check(both === 0, `swap: both headlines showed together in ${both} sampled frames`);
            check((await p.getAttribute('.oca-swap', 'data-state')) === 'after', 'swap: past its point it did not swap');
            await close();
        }
        {
            const { p, close } = await open('crowd', { reduce: true });
            await p.waitForFunction(() => document.querySelector('.oca-crowd[data-live]'), null, { timeout: 8000 });
            await p.waitForTimeout(600);
            const r = await p.evaluate(() => ({ draws: window.__draws, state: document.querySelector('.oca-swap').dataset.state }));
            check(r.draws === 1 && r.state === 'after', `crowd under reduced motion: ${r.draws} draws and the swap at ${r.state}`);
            await p.evaluate(() => window.scrollTo(0, 600));
            await p.waitForTimeout(400);
            check((await p.evaluate(() => window.__draws)) === 1, 'crowd under reduced motion: scrolling drew again');
            await close();
        }

        // MiniCheck: about a second of dots, then the mark, then nothing; under reduced motion only the mark.
        {
            const { p, close } = await open('check');
            await p.waitForFunction(() => document.querySelector('.oca-minicheck[data-state="solid"]'), null, { timeout: 15000 });
            check(await settle(p), 'check: after it lands it keeps drawing');
            check((await p.evaluate(() => window.__draws)) > 10, 'check: its dots never flew');
            await close();
        }
        {
            const { p, close } = await open('check', { reduce: true });
            await p.waitForTimeout(1200);
            const r = await p.evaluate(() => ({ draws: window.__draws, mark: getComputedStyle(document.querySelector('.oca-minicheck-mark')).opacity }));
            check(r.draws === 0 && r.mark === '1', `check under reduced motion: ${r.draws} draws, the mark at opacity ${r.mark}`);
            await close();
        }

        // StackCards: nothing at rest; --p only follows the scroll; under reduced motion an ordinary column.
        {
            const { p, close } = await open('stack');
            check(await settle(p), 'stack: at rest it asks for frames');
            await p.evaluate(() => window.scrollTo(0, 450));
            await p.waitForTimeout(300);
            const covered = await p.evaluate(() => Number(document.querySelector('.oca-stack-panel').style.getPropertyValue('--p')));
            check(covered > 0.2 && covered <= 1, `stack: the first card's cover is ${covered} with the second over it`);
            check(await settle(p), 'stack: after the scroll stops it asks for frames');
            await close();
        }
        {
            const { p, close } = await open('stack', { reduce: true });
            const pos = await p.evaluate(() => getComputedStyle(document.querySelector('.oca-stack-item')).position);
            check(pos === 'static', `stack under reduced motion: the cards are ${pos}, not an ordinary column`);
            await close();
        }

        // DitherImage: only the still until a fine pointer comes over it; live while it moves; then, within a
        // second or so, clear again (exactly the still) and asking for nothing. Never under reduced motion or touch.
        {
            const { p, close } = await open('dither');
            await p.waitForTimeout(800);
            // Everything since the page loaded, read just before the first pointer: a dither started at mount shows here.
            const before = await read(p);
            const box = await p.locator('.oca-dither').boundingBox();
            for (let i = 0; i <= 10; i++) await p.mouse.move(box.x + 60 + i * 30, box.y + 160, { steps: 2 });
            const moved = await p.evaluate(() => window.__draws);
            const t0 = Date.now();
            const idle = await settle(p, 6000);
            const took = Date.now() - t0;
            const clear = await p.evaluate(() => {
                const c = document.querySelector('.oca-dither canvas');
                const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let lit = 0;
                for (let i = 3; i < d.length; i += 4) lit += d[i] ? 1 : 0;
                return lit;
            });
            check(before.draws === 0 && before.rafs === 0, `dither: before any pointer it drew ${before.draws} and asked ${before.rafs} frames`);
            check(moved > 3, `dither: a pointer moving over it drew ${moved} frames`);
            check(idle, 'dither: after the pointer stopped it never settled');
            check(clear === 0, `dither: settled, ${clear} live pixels still cover the still`);
            await close();
        }
        // A finger on a hybrid screen whose primary pointer is fine: the dither waits for a mouse or a pen.
        {
            const { p, close } = await open('dither');
            await p.waitForTimeout(600);
            const box = await p.locator('.oca-dither').boundingBox();
            for (let i = 0; i <= 6; i++) {
                const at = { pointerType: 'touch', clientX: box.x + 60 + i * 40, clientY: box.y + 160, bubbles: i > 0 };
                await p.dispatchEvent('.oca-dither', i === 0 ? 'pointerenter' : 'pointermove', at);
            }
            await p.waitForTimeout(400);
            check((await p.evaluate(() => window.__draws)) === 0, 'dither: a finger on a fine-pointer device started the live dither');
            await close();
        }
        for (const [label, opts] of [
            ['reduced motion', { reduce: true }],
            ['a touch screen', { touch: true }],
        ]) {
            const { p, close } = await open('dither', opts);
            await p.waitForTimeout(600);
            const box = await p.locator('.oca-dither').boundingBox();
            for (let i = 0; i <= 6; i++) await p.mouse.move(box.x + 60 + i * 40, box.y + 160, { steps: 2 });
            await p.waitForTimeout(400);
            check((await p.evaluate(() => window.__draws)) === 0, `dither under ${label}: the live dither drew`);
            await close();
        }

        // Reduced motion switched on mid-session: what was moving stops at once and shows its still.
        {
            const { p, close } = await open('portrait');
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            const a = await p.evaluate(() => window.__draws);
            await p.emulateMedia({ reducedMotion: 'reduce' });
            // At once: the finished frame and the notes within a moment, not on the next idle callback.
            await p.waitForTimeout(250);
            const phase = await p.getAttribute('.oca-portrait', 'data-phase');
            const stilled = await settle(p, 3000);
            const drew = (await p.evaluate(() => window.__draws)) - a;
            check(stilled && drew <= 3 && phase === 'formed', `portrait, reduced motion switched on mid-gather: ${drew} more draws, settled ${stilled}, phase ${phase} after 250 ms`);
            await close();
        }
        {
            const { p, close } = await open('check');
            await p.waitForFunction(() => document.querySelector('.oca-minicheck[data-state="flying"]'), null, { timeout: 8000 });
            await p.emulateMedia({ reducedMotion: 'reduce' });
            await p.waitForTimeout(300);
            const a = await p.evaluate(() => window.__draws);
            await p.waitForTimeout(1200);
            const r = await p.evaluate(() => ({ draws: window.__draws, state: document.querySelector('.oca-minicheck').dataset.state }));
            check(r.draws === a && r.state === 'still', `check, reduced motion switched on mid-flight: ${r.draws - a} more draws, state ${r.state}`);
            await close();
        }
        {
            const { p, close } = await open('wipe');
            await p.waitForFunction(() => document.querySelector('.oca-wipe[data-wipe="pending"]'), null, { timeout: 8000 });
            await p.emulateMedia({ reducedMotion: 'reduce' });
            await p.waitForTimeout(100);
            const clip = await p.evaluate(() => getComputedStyle(document.querySelector('.oca-wipe')).clipPath);
            check(clip === 'none', `wipe, reduced motion switched on while it waited: its content is clipped (${clip})`);
            await close();
        }
        {
            const { p, close } = await open('dither');
            await p.waitForTimeout(600);
            const box = await p.locator('.oca-dither').boundingBox();
            for (let i = 0; i <= 4; i++) await p.mouse.move(box.x + 60 + i * 30, box.y + 160, { steps: 2 });
            await p.emulateMedia({ reducedMotion: 'reduce' });
            await settle(p, 4000);
            const a = await p.evaluate(() => window.__draws);
            for (let i = 0; i <= 6; i++) await p.mouse.move(box.x + 60 + i * 40, box.y + 120, { steps: 2 });
            await p.waitForTimeout(400);
            check((await p.evaluate(() => window.__draws)) === a, 'dither, reduced motion switched on: the pointer still drives the live dither');
            await close();
        }

        // One scene that throws stops only itself: the others keep their frames, and the page still hears of it.
        {
            const { p, close } = await open('loop');
            await p.waitForTimeout(1500);
            const r = await p.evaluate(() => ({ good: window.__good, failed: window.__failed, logged: window.__logged }));
            check(r.good === 30, `scheduler: beside a scene that throws, another got ${r.good} of its 30 frames`);
            check(r.failed === 1 && r.logged === 1, `scheduler: a broken scene was handed back ${r.failed} times and logged ${r.logged} times, not once each`);
            check(await settle(p), 'scheduler: with a broken scene on it the loop never stops');
            await close();
        }
        // A portrait whose drawing throws drops to its poster and notes, logs once, and asks for nothing more.
        {
            const { p, close } = await open('broken');
            const fell = await p.waitForFunction(() => document.querySelector('.oca-portrait[data-fallback]'), null, { timeout: 8000 }).then(
                () => true,
                () => false
            );
            check(fell, 'portrait that throws: it never fell back to its poster');
            const quiet = await settle(p, 3000);
            // The poster and the notes fade in: read them once their transitions have run.
            await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
            const r = await p.evaluate(() => ({
                poster: getComputedStyle(document.querySelector('.oca-portrait-poster')).opacity,
                canvas: getComputedStyle(document.querySelector('.oca-portrait-canvas')).opacity,
                note: getComputedStyle(document.querySelector('.oca-note-label')).opacity,
                logged: window.__logged,
                held: window.__held('.oca-portrait'),
            }));
            check(
                quiet && r.poster === '1' && r.canvas === '0' && r.note === '1' && r.logged === 1,
                `portrait that throws: poster ${r.poster}, canvas ${r.canvas}, note ${r.note}, logged ${r.logged}, settled ${quiet}`
            );
            check(r.held === 0, `portrait that throws: ${r.held} pointer listeners left on it`);
            await close();
        }
        // Each ground draws its own positive. The still under reduced motion is the settled frame: on each ground
        // exactly the dots stored for it, dense by the dark hair on paper and by the lit eye on a dark ground.
        {
            const seen = {};
            for (const ground of ['light', 'dark']) {
                const { p, close } = await open('portrait', { reduce: true, flags: ground === 'dark' ? 'dark' : '' });
                await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
                seen[ground] = await p.evaluate(async (bit) => {
                    const pts = await window.__bust();
                    const c = document.querySelector('.oca-portrait-canvas');
                    const b = c.getBoundingClientRect();
                    const side = Math.min(b.width, b.height);
                    const near = ([ax, ay]) =>
                        c.__rects.filter(([x, y, w, h]) => Math.hypot(x + w / 2 - (b.width - side) / 2 - ax * side, y + h / 2 - (b.height - side) / 2 - ay * side) < 0.05 * side).length;
                    return { drawn: c.__rects.length, stored: pts.grounds.filter((g) => g & bit).length, all: pts.count, hair: near(window.__anchors.hair), eye: near(window.__anchors.eye) };
                }, ground === 'dark' ? 2 : 1);
                const r = seen[ground];
                check(r.drawn === r.stored && r.stored < r.all, `portrait on a ${ground} ground: ${r.drawn} dots drawn, not the ${r.stored} of ${r.all} stored for it`);
                await close();
            }
            const { light, dark } = seen;
            check(
                light.hair > 2 * dark.hair && dark.eye > 2 * light.eye,
                `portrait: not a positive on each ground (by the hair ${light.hair} dots on paper and ${dark.hair} on dark, by the eye ${light.eye} and ${dark.eye})`
            );
        }
        // The deck portrait, kept as an option, still loads and draws.
        {
            const { p, close } = await open('deck');
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
            check(await settle(p), 'deck portrait: after its motion it never settles');
            await close();
        }

        // A DOM without matchMedia (jsdom has none), and one without a 2D canvas either: every scene renders
        // without an error and stands still; with no canvas the portrait keeps its poster.
        for (const [label, flags] of [
            ['without matchMedia', 'nomm'],
            ['without matchMedia or a 2D canvas', 'nomm&nocanvas'],
        ]) {
            const { p, errors, close } = await open('all', { flags });
            await p.waitForTimeout(2500);
            const quiet = await settle(p, 6000);
            const r = await p.evaluate(() => {
                const fig = document.querySelector('.oca-portrait');
                return {
                    phase: fig?.dataset.phase,
                    check: document.querySelector('.oca-minicheck')?.dataset.state,
                    live: fig?.dataset.live !== undefined,
                    fallback: fig?.dataset.fallback !== undefined,
                    logged: window.__logged,
                };
            });
            check(errors.length === 0 && r.logged === 0, `${label}: ${errors.length} page errors and ${r.logged} logged (${errors[0] ?? ''})`);
            check(quiet && r.phase === 'formed' && r.check === 'still', `${label}: the scenes did not stand still (settled ${quiet}, portrait ${r.phase}, check ${r.check})`);
            if (flags.includes('nocanvas')) check(!r.live && r.fallback, `${label}: the portrait did not keep its poster (live ${r.live}, fallback ${r.fallback})`);
            await close();
        }

        // Marquee: runs in view, stops offscreen, on its button, and under reduced motion.
        {
            const { p, close } = await open('marquee');
            await p.waitForTimeout(500);
            const state = () => p.evaluate(() => getComputedStyle(document.querySelector('.oca-marquee-track')).animationPlayState);
            check((await state()) === 'running', 'marquee: not running in view');
            check((await p.getAttribute('.oca-marquee-copy:nth-child(2)', 'aria-hidden')) === 'true', 'marquee: the second copy is read aloud');
            await p.evaluate(() => window.scrollTo(0, 2000));
            await p.waitForTimeout(400);
            check((await state()) === 'paused', 'marquee: still running offscreen');
            await p.evaluate(() => window.scrollTo(0, 0));
            await p.waitForTimeout(400);
            await p.click('.oca-marquee-control');
            await p.mouse.move(1, 899);
            await p.waitForTimeout(200);
            check((await state()) === 'paused', 'marquee: its pause button did not stop it');
            await close();
        }
        {
            const { p, close } = await open('marquee', { reduce: true });
            const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.oca-marquee-track')).animationName);
            check(anim === 'none', `marquee under reduced motion: animation ${anim}`);
            await close();
        }

        // Wipe: below the fold it waits clipped, opens when seen; under reduced motion it never hides.
        {
            const { p, close } = await open('wipe');
            await p.waitForTimeout(400);
            const pending = await p.getAttribute('.oca-wipe', 'data-wipe');
            await p.evaluate(() => document.querySelector('.oca-wipe').scrollIntoView({ block: 'center' }));
            await p.waitForFunction(() => document.querySelector('.oca-wipe').dataset.wipe === 'shown', null, { timeout: 4000 }).catch(() => {});
            check(pending === 'pending' && (await p.getAttribute('.oca-wipe', 'data-wipe')) === 'shown', `wipe: ${pending} below the fold, then not shown in view`);
            await close();
        }
        {
            const { p, close } = await open('wipe', { reduce: true });
            await p.waitForTimeout(400);
            check((await p.getAttribute('.oca-wipe', 'data-wipe')) === null, 'wipe under reduced motion: it hid content');
            await close();
        }
        // Wipe from the centre: clipped to a point below the fold, open in view; its id and label on the root.
        {
            const { p, close } = await open('wipecenter');
            await p.waitForTimeout(400);
            const before = await p.evaluate(() => {
                const w = document.querySelector('.oca-wipe');
                return { state: w.dataset.wipe, clip: getComputedStyle(w).clipPath, id: w.id, label: w.getAttribute('aria-label') };
            });
            await p.evaluate(() => document.querySelector('.oca-wipe').scrollIntoView({ block: 'center' }));
            await p.waitForFunction(() => document.querySelector('.oca-wipe').dataset.wipe === 'shown', null, { timeout: 4000 }).catch(() => {});
            await p.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
            const clip = await p.evaluate(() => getComputedStyle(document.querySelector('.oca-wipe')).clipPath);
            check(before.state === 'pending' && /^inset\(50%/.test(before.clip) && clip === 'inset(0px)', `wipe from the centre: ${before.state} at ${before.clip}, then ${clip}`);
            check(before.id === 'wiped-center' && before.label === 'A statement', `wipe: its id and label did not reach the root (${before.id}, ${before.label})`);
            await close();
        }
        // StackCards: a list of steps, and data-flat lays it out as a column for a full-page screenshot.
        {
            const { p, close } = await open('stack');
            const r = await p.evaluate(() => {
                const s = document.querySelector('.oca-stack');
                const items = [...s.children].map((c) => c.tagName).join();
                s.dataset.flat = '';
                return { tag: s.tagName, items, flat: getComputedStyle(s.firstElementChild).position };
            });
            check(r.tag === 'OL' && r.items === 'LI,LI,LI', `stack: rendered ${r.tag} of ${r.items}, not a list of steps`);
            check(r.flat === 'static', `stack with data-flat: the cards are ${r.flat}, not a column`);
            await close();
        }
        // A first layout that throws (text read through a tainted getImageData) fails that scene to its words,
        // logs once, and lets go of everything; the dither over the same taint draws nothing and logs nothing.
        {
            const { p, errors, close } = await open('fails', { flags: 'taint' });
            await p.waitForTimeout(2500);
            const box = await p.locator('.oca-dither').boundingBox();
            // The text's failure clears its canvas once; from here the dither must draw nothing.
            const a = await p.evaluate(() => window.__draws);
            for (let i = 0; i <= 8; i++) await p.mouse.move(box.x + 60 + i * 30, box.y + 160, { steps: 2 });
            await settle(p, 3000);
            const r = await p.evaluate(() => ({ live: document.querySelector('.oca-ptext').dataset.live !== undefined, draws: window.__draws, logged: window.__logged }));
            await p.evaluate(() => window.__unmount());
            const ro = await p.evaluate(() => window.__ro);
            check(errors.length === 0 && r.logged === 1, `a first layout that throws: ${errors.length} page errors (${errors[0] ?? ''}), logged ${r.logged}, not once`);
            check(!r.live && r.draws === a && ro === 0, `a first layout that throws: text live ${r.live}, the dither drew ${r.draws - a}, ${ro} ResizeObservers left after unmount`);
            await close();
        }
        // A cross-origin still served without CORS (a real second origin: a route() would answer CORS itself):
        // the dither reads it with CORS, so it never loads for reading and nothing taints; the plain image still
        // shows, no error escapes, nothing is logged, and nothing is left after unmount.
        {
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
            const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'image/png' }).end(png));
            await new Promise((done) => server.listen(0, '127.0.0.1', done));
            const { p, errors, close } = await open('dither', { flags: `src=${encodeURIComponent(`http://127.0.0.1:${server.address().port}/still.png`)}` });
            await p.waitForTimeout(2500);
            const box = await p.locator('.oca-dither').boundingBox();
            const a = await p.evaluate(() => window.__draws);
            for (let i = 0; i <= 8; i++) await p.mouse.move(box.x + 60 + i * 30, box.y + 160, { steps: 2 });
            await p.waitForTimeout(600);
            const drew = (await p.evaluate(() => window.__draws)) - a;
            const shown = await p.evaluate(() => document.querySelector('.oca-dither img').complete && document.querySelector('.oca-dither img').naturalWidth > 0);
            const logged = await p.evaluate(() => window.__logged);
            await p.evaluate(() => window.__unmount());
            const ro = await p.evaluate(() => window.__ro);
            check(errors.length === 0 && drew === 0 && shown && logged === 0 && ro === 0, `cross-origin still without CORS: ${errors.length} page errors (${errors[0] ?? ''}), ${drew} dither draws, still shown ${shown}, logged ${logged}, ${ro} ResizeObservers left`);
            await close();
            server.close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} idle-motion failure(s)`);
    process.exit(1);
}
console.log(`✓ idle-motion: ${checks} checks in Chrome; every scene draws its motion and then asks for no frames, sleeps offscreen and hidden, stands still under reduced motion`);
