#!/usr/bin/env node
/*
 * What a page costs while nothing happens, in Chrome:
 *
 * - The halftone portrait draws its intro, then nothing until the pointer
 *   moves over it, and nothing again once the pointer rests or leaves; its
 *   breath is a CSS animation. Under reduced motion it draws once. Offscreen
 *   it stops, and draws when it comes into view.
 * - A Diagram fetches mermaid only once it comes within a screen of view.
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
    });
    compileCss(dir, ['halftone', 'diagram']);
    // Every draw starts with a clear: count them.
    const counter = `<script>window.__draws = 0; const clear = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function (...a) { window.__draws++; return clear.apply(this, a); };</script>`;
    const halftone = writePage(dir, 'halftone', '<div id="root"></div>', { head: counter, script: '<script src="halftone.js"></script>' });
    const diagram = writePage(dir, 'diagram', '<div id="root"></div>', { script: '<script src="diagram.js"></script>' });

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const draws = (p) => p.evaluate(() => window.__draws);
    const over = async (p, ms) => {
        const a = await draws(p);
        await p.waitForTimeout(ms);
        return (await draws(p)) - a;
    };
    try {
        // In view, motion allowed.
        {
            const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
            await p.goto(halftone);
            await p.waitForTimeout(2600);
            const intro = await draws(p);
            const idle = await over(p, 1200);
            const breath = await p.evaluate(() => getComputedStyle(document.querySelector('#art canvas')).animationName);
            check(intro > 10, `halftone: the intro drew ${intro} frames`);
            check(idle === 0, `halftone: idle, it drew ${idle} frames in 1.2s`);
            check(breath === 'oca-breathe', `halftone: the breath is not the CSS animation (${breath})`);
            const art = await p.locator('#art').boundingBox();
            for (let i = 0; i <= 12; i++) await p.mouse.move(art.x + 60 + i * 20, art.y + 180, { steps: 2 });
            const lens = await over(p, 300);
            check(lens > 5, `halftone: the pointer moving over it drew ${lens} frames`);
            await p.waitForTimeout(1500);
            const resting = await over(p, 800);
            check(resting === 0, `halftone: with the pointer at rest it drew ${resting} frames in 0.8s`);
            await p.mouse.move(art.x + art.width + 300, art.y + 180, { steps: 4 });
            await p.waitForTimeout(1500);
            const gone = await over(p, 800);
            check(gone === 0, `halftone: after the pointer left it drew ${gone} frames in 0.8s`);
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
console.log(`✓ idle: ${checks} checks in Chrome; the halftone draws only while something moves, once under reduced motion, never offscreen; mermaid only near view`);
