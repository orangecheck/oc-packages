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
 * - DitherImage is its still until a fine pointer moves over it, then clear
 *   again within about a second; never under reduced motion or on touch.
 * - The headline swap never shows both headlines at once.
 * - Without script the portrait's poster and notes stand.
 *
 * Run after `yarn build` (it reads the CSS as a site compiles it).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { ParticlePortrait, ParticleText, CrowdDissolve, StorySwap, MiniCheck, StackCards, Marquee, Wipe, DitherImage, ScrollStory, PORTRAIT_ANCHORS, schedule } from '${join(pkg, 'src/motion/index.ts')}';
const q = new URLSearchParams(location.search);
const s = q.get('s');
// A two-tone still to dither: soft blobs through Bayer 4x4, burnt on paper.
function still() {
    const w = 480, h = 320, c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), img = x.createImageData(w, h), B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
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
        window.__errors = [];
        window.addEventListener('error', (e) => window.__errors.push(e.message));
        const bad = schedule(document.getElementById('bad'), { frame() { throw new Error('a broken scene'); } });
        const good = schedule(document.getElementById('good'), { frame: () => ++window.__good < 30 });
        bad.wake();
        good.wake();
        return () => { bad.stop(); good.stop(); };
    }, []);
    return <div><div id="bad" style={{ height: 40 }} /><div id="good" style={{ height: 40 }} /></div>;
}
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
    dither: () => <DitherImage src={still()} width={480} height={320} alt="" dark="#2a1206" light="#eeeae6" style={{ width: 480 }} />,
};
const above = s === 'crowd' || s === 'stack' ? 200 : s === 'wipe' ? 1200 : q.has('off') ? 3000 : 0;
createRoot(document.getElementById('root')).render(<div><div style={{ height: above }} />{scenes[s]()}<div style={{ height: 2400 }} /></div>);
`;

// Count every draw (each starts with a clear) on a canvas in the page, and every frame the page's code asks
// for; the page's own tick, on the untouched rAF, proves frames are being made at all.
const COUNTERS =
    `<script>window.__draws = 0; window.__rafs = 0; const clear = CanvasRenderingContext2D.prototype.clearRect;` +
    `CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.isConnected) window.__draws++; return clear.apply(this, a); };` +
    `const put = CanvasRenderingContext2D.prototype.putImageData; CanvasRenderingContext2D.prototype.putImageData = function (...a) { if (this.canvas.isConnected) window.__draws++; return put.apply(this, a); };` +
    `const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__rafs++; return raf(cb); };` +
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
                h(M.CrowdDissolve, { style: { aspectRatio: '4 / 3', width: 600 } })
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
    const open = async (scene, { reduce = false, width = 1280, height = 900, js = true, off = false, touch = false } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduce ? 'reduce' : 'no-preference', javaScriptEnabled: js, hasTouch: touch, isMobile: touch });
        const p = await ctx.newPage();
        await p.goto(`${url}?s=${scene}${off ? '&off' : ''}`);
        return { p, close: () => ctx.close() };
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
            const idle = await settle(p);
            const drew = await p.evaluate(() => window.__draws);
            check(drew > 30, `portrait: its motion drew ${drew} frames`);
            check(idle, 'portrait: after its motion it never stops drawing or asking for frames');
            check((await p.getAttribute('.oca-portrait', 'data-phase')) === 'formed', 'portrait: the notes never came in (phase not formed)');
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
            await p.mouse.move(box.x + box.width + 400, box.y + 100, { steps: 3 });
            check(await settle(p), 'portrait: after the pointer left it never stops');
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
            await p.waitForFunction(() => document.querySelector('.oca-portrait[data-live]'), null, { timeout: 8000 });
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
                        backed: document.querySelectorAll('.oca-crowd-poster use').length,
                    };
                });
                const lum = (c) => c.match(/\d+/g).slice(0, 3).reduce((a, v) => a + Number(v), 0) / 3;
                const ground = dark ? 'dark' : 'light';
                check(g.ink === !dark && g.light === dark, `no script, ${ground} page: the portrait poster shows ink ${g.ink}, light ${g.light}`);
                check(dark ? lum(g.colour) > 200 && lum(g.crowdColour) > 200 : lum(g.colour) < 80 && lum(g.crowdColour) < 80, `no script, ${ground} page: the posters draw in ${g.colour} and ${g.crowdColour}`);
                check(/^url\(#.+-place\)$/.test(g.ghosts) && g.backed === 8, `no script, ${ground} page: the crowd poster has ghosts '${g.ghosts}' and ${g.backed} backed figures`);
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
            const before = await over(p, 600);
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
            await p.emulateMedia({ reducedMotion: 'reduce' });
            const a = await p.evaluate(() => window.__draws);
            const stilled = await settle(p, 6000);
            const drew = (await p.evaluate(() => window.__draws)) - a;
            const phase = await p.getAttribute('.oca-portrait', 'data-phase');
            check(stilled && drew <= 3 && phase === 'formed', `portrait, reduced motion switched on mid-gather: ${drew} more draws, settled ${stilled}, phase ${phase}`);
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
            const r = await p.evaluate(() => ({ good: window.__good, errors: window.__errors }));
            check(r.good === 30, `scheduler: beside a scene that throws, another got ${r.good} of its 30 frames`);
            // A file: page hears a cross-script error as "Script error.", without its message: count it.
            check(r.errors.length === 1, `scheduler: the throw reached the page ${r.errors.length} times, not once`);
            check(await settle(p), 'scheduler: with a broken scene on it the loop never stops');
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
