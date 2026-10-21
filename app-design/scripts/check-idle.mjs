#!/usr/bin/env node
/*
 * What a page costs while nothing happens, in Chrome:
 *
 * - The halftone portrait draws its intro, then nothing until the pointer
 *   moves over it, and nothing again once the pointer rests or leaves; its
 *   breath is a CSS animation. Under reduced motion it draws once. Offscreen
 *   it stops, and draws when it comes into view.
 * - A Diagram fetches mermaid only once it comes within a screen of view,
 *   and its placeholder holds the height it will draw: exactly with a
 *   `size`, from a guess at the source without one.
 *
 * Run after `yarn build`.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundle, compileCss, findChrome, pkg, writePage } from './browser.mjs';

const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/chrome.js'))) {
    console.error('✗ idle: dist is missing; run yarn build first');
    process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ idle: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ idle: ${msg}`);
        failures++;
    }
};

// The docs' sign-in guide's sequence, drawn at 834×623 by mermaid.
const ATTEST = `sequenceDiagram
    autonumber
    participant C as Client
    participant W as Wallet<br/>(BIP-322)
    participant S as Server
    C->>S: GET /api/challenge?addr=bc1q…
    S-->>C: { message, nonce, expiresAt }
    C->>W: user signs canonical message
    W-->>C: signature
    C->>S: POST /api/auth/signin<br/>{ message, signature, expectedNonce }
    S->>S: verify BIP-322 · upsert account · mint cookie
    S-->>C: 200 { ok, account }<br/>Set-Cookie: oc_session=…`;

const dir = mkdtempSync(join(tmpdir(), 'app-design-idle-'));
try {
    const src = (f) => join(pkg, 'src', f);
    bundle(dir, {
        halftone:
            `import { createRoot } from 'react-dom/client';\n` +
            `import { HalftoneCanvas } from '${src('brand/halftone-canvas.tsx')}';\n` +
            `const off = new URLSearchParams(location.search).has('off');\n` +
            `createRoot(document.getElementById('root')).render(<div style={{ paddingTop: off ? 3000 : 40, paddingLeft: 40, paddingBottom: 400 }}><div id="art" style={{ width: 360, height: 360, background: '#ff7030' }}><HalftoneCanvas alt="A portrait" /></div></div>);\n`,
        diagram:
            `import { createRoot } from 'react-dom/client';\n` +
            `import { Diagram } from '${src('components/docs.tsx')}';\n` +
            `window.__loads = 0;\n` +
            `const mermaid = { initialize() {}, render: async () => ({ svg: '<svg width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" /></svg>' }) };\n` +
            `const load = () => { window.__loads++; return Promise.resolve(mermaid); };\n` +
            `createRoot(document.getElementById('root')).render(<div className="p-6"><div style={{ height: 3000 }} /><Diagram chart="graph LR; a-->b" caption="Flow" load={load} /></div>);\n`,
        // Diagrams that draw at a known size, held back until the check has read the placeholder.
        hold:
            `import { createRoot } from 'react-dom/client';\n` +
            `import { Diagram } from '${src('components/docs.tsx')}';\n` +
            `const ATTEST = ${JSON.stringify(ATTEST)};\n` +
            `const drawn = { wide: [1512, 645], scaled: [834, 623], narrow: [229, 496], guessed: [834, 623] };\n` +
            `let go; const gate = new Promise((r) => (go = r)); window.__go = () => go();\n` +
            `const mermaid = { initialize() {}, render: async (id, chart) => { await gate; const [w, h] = drawn[chart.startsWith('sequenceDiagram') ? 'guessed' : chart.split(' ')[1]]; return { svg: '<svg width="100%" viewBox="0 0 ' + w + ' ' + h + '" style="max-width: ' + w + 'px;"><rect width="' + w + '" height="' + h + '" /></svg>' }; } };\n` +
            `const load = () => Promise.resolve(mermaid);\n` +
            `createRoot(document.getElementById('root')).render(<div className="mx-auto max-w-[46rem] px-4">` +
            `{['wide', 'scaled', 'narrow'].map((k) => <div key={k} data-k={k}><Diagram chart={'graph ' + k} load={load} size={drawn[k]} /></div>)}` +
            `<div data-k="guessed"><Diagram chart={ATTEST} load={load} /></div></div>);\n`,
    });
    compileCss(dir, ['halftone', 'diagram', 'hold']);
    // Every draw starts with a clear: count them. And count the page's frames, so a quiet canvas is told from a stalled page.
    const counter =
        `<script>window.__draws = 0; const clear = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function (...a) { window.__draws++; return clear.apply(this, a); };` +
        `window.__ticks = 0; (function tick() { window.__ticks++; requestAnimationFrame(tick); })();</script>`;
    const halftone = writePage(dir, 'halftone', '<div id="root"></div>', { head: counter, script: '<script src="halftone.js"></script>' });
    const diagram = writePage(dir, 'diagram', '<div id="root"></div>', { script: '<script src="diagram.js"></script>' });
    const hold = writePage(dir, 'hold', '<div id="root"></div>', { script: '<script src="hold.js"></script>' });

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const draws = (p) => p.evaluate(() => window.__draws);
    const ticks = (p) => p.evaluate(() => window.__ticks);
    // Draws over a stretch in which the page itself ran 10 frames or more: a stalled page proves nothing.
    const over = async (p, ms) => {
        const [a, t] = [await draws(p), await ticks(p)];
        await p.waitForTimeout(ms);
        while ((await ticks(p)) - t < 10) await p.waitForTimeout(100);
        return (await draws(p)) - a;
    };
    // Frames, not seconds, end the motion, and a CI runner draws slowly: wait for a quiet stretch.
    const settle = async (p, maxMs = 15000) => {
        const start = Date.now();
        while (Date.now() - start < maxMs) if ((await over(p, 600)) === 0) return true;
        return false;
    };
    try {
        // In view, motion allowed.
        {
            const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await p.goto(halftone);
            await p.waitForTimeout(2600);
            const idle = await settle(p);
            const intro = await draws(p);
            const breath = await p.evaluate(() => getComputedStyle(document.querySelector('#art canvas')).animationName);
            check(intro > 10, `halftone: the intro drew ${intro} frames`);
            check(idle, `halftone: after its intro it never stops drawing (${intro} frames and counting)`);
            check(breath === 'oca-breathe', `halftone: the breath is not the CSS animation (${breath})`);
            const art = await p.locator('#art').boundingBox();
            const before = await draws(p);
            for (let i = 0; i <= 12; i++) await p.mouse.move(art.x + 60 + i * 20, art.y + 180, { steps: 2 });
            const resting = await settle(p);
            const lens = (await draws(p)) - before;
            check(lens > 5, `halftone: the pointer moving over it drew ${lens} frames`);
            check(resting, 'halftone: with the pointer at rest it never stops drawing');
            await p.mouse.move(art.x + art.width + 300, art.y + 180, { steps: 4 });
            check(await settle(p), 'halftone: after the pointer left it never stops drawing');
            await p.close();
        }
        // Reduced motion: one still frame.
        {
            const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
            const p = await ctx.newPage();
            await p.goto(halftone);
            await p.waitForTimeout(1500);
            const n = await draws(p);
            check(n === 1, `halftone under reduced motion: ${n} draws, not one`);
            await ctx.close();
        }
        // Offscreen: it stops, then draws when it comes into view.
        {
            const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await p.goto(`${halftone}?off`);
            await p.waitForTimeout(800);
            const away = await over(p, 1200);
            await p.evaluate(() => document.getElementById('art').scrollIntoView());
            const seen = await over(p, 600);
            check(away === 0 && seen > 0, `halftone offscreen: ${away} frames while away, ${seen} once in view`);
            await p.close();
        }
        // A Diagram far down the page: mermaid waits until it is near.
        {
            const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await p.goto(diagram);
            await p.waitForTimeout(800);
            const before = await p.evaluate(() => window.__loads);
            await p.evaluate(() => window.scrollTo(0, 1500));
            await p.waitForFunction(() => document.querySelector('figure svg'), null, { timeout: 3000 }).catch(() => {});
            const after = await p.evaluate(() => ({ loads: window.__loads, drawn: Boolean(document.querySelector('figure svg')) }));
            check(before === 0, `Diagram: mermaid was fetched ${before} time(s) with the diagram three screens away`);
            check(after.loads === 1 && after.drawn, `Diagram: within a screen of view, fetched ${after.loads} time(s), drawn ${after.drawn}`);
            await p.close();
        }
        // The placeholder holds the drawn height: given a size, exactly, at a phone's width and a desk's.
        for (const [width, height] of [
            [390, 844],
            [1440, 900],
        ]) {
            const p = await browser.newPage({ viewport: { width, height: 4000 } });
            await p.goto(hold);
            await p.waitForSelector('[data-k="guessed"] [role="status"]');
            const heights = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-k]')].map((d) => [d.dataset.k, d.getBoundingClientRect().height])));
            const before = await heights();
            await p.evaluate(() => window.__go());
            await p.waitForFunction(() => document.querySelectorAll('figure svg').length === 4);
            const after = await heights();
            for (const k of ['wide', 'scaled', 'narrow']) {
                check(Math.abs(before[k] - after[k]) <= 1, `[${width}] Diagram size: the placeholder held ${Math.round(before[k])}px, the drawing took ${Math.round(after[k])}px (${k})`);
            }
            // Without a size, a guess from the source: within a tenth for the sign-in guide's sequence, drawn at its own size on a phone.
            if (width < 640) {
                const off = Math.abs(before.guessed - after.guessed) / after.guessed;
                check(off <= 0.1, `[${width}] Diagram guess: ${Math.round(before.guessed)}px held for a ${Math.round(after.guessed)}px drawing`);
            }
            await p.close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} idle failure(s)`);
    process.exit(1);
}
console.log(`✓ idle: ${checks} checks in Chrome; the halftone draws only while something moves, once under reduced motion, never offscreen; mermaid only near view, a diagram's height held`);
