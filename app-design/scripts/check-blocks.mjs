#!/usr/bin/env node
/*
 * The interactive blocks (./blocks) doing what they promise, in Chrome:
 *
 * - SignInDemo plays by itself only while it is on screen in a shown tab,
 *   pauses where it was otherwise, plays through once and rests with nothing
 *   left running. Its cursor moves by transform, never left/top. Nothing is
 *   said while it plays; the first press stops it for good, and then each
 *   step a reader moves to is said once. Under reduced motion it never
 *   plays: the first step, with 44px step buttons that work. The last step
 *   shows the caller's success picture.
 * - The Slider says its value in words, moves by key, and is a 44px target.
 *   CostDemo's number and the real person's verdict follow the sliders; the
 *   crowd is one element, not a node per account; one sweep crosses it per
 *   change and then nothing runs; none under reduced motion; the total is
 *   said once a change settles.
 * - StepPath draws its line when it comes into view, and is simply drawn
 *   under reduced motion; its steps are a list with the current one marked.
 * - ReceiptCard stacks its amounts on the decimal point.
 * - None of them widens a phone.
 *
 * Run after `yarn build`.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { bundle, compileCss, findChrome, pkg, writePage } from './browser.mjs';

const require = createRequire(import.meta.url);
if (!existsSync(join(pkg, 'dist/blocks.js'))) {
    console.error('✗ blocks: dist is missing; run yarn build first');
    process.exit(1);
}
const chrome = findChrome();
if (!chrome) {
    console.error('✗ blocks: no Chrome found; set OCA_CHROME to one');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ blocks: ${msg}`);
        failures++;
    }
};

const STEP = 900;
const dir = mkdtempSync(join(tmpdir(), 'app-design-blocks-'));
try {
    const src = (f) => join(pkg, 'src', f);
    bundle(dir, {
        blocks:
            `import { createRoot } from 'react-dom/client';\n` +
            `import { SignInDemo, signInDemoSteps, CostDemo, StepPath, ReceiptCard } from '${src('blocks/index.ts')}';\n` +
            `const q = new URLSearchParams(location.search);\n` +
            // Everything the page's one live region says, in order.
            `window.__said = [];\n` +
            `new MutationObserver(() => { const r = document.getElementById('oca-announcer'); if (r && r.textContent) window.__said.push(r.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true });\n` +
            `const steps = signInDemoSteps().map((s) => ({ ...s, duration: ${STEP} }));\n` +
            `const pick = { demo: <SignInDemo steps={steps} success={() => <span data-success="">ok</span>} />, cost: <CostDemo />, path: <StepPath current={2} steps={[{ label: 'One' }, { label: 'Two' }, { label: 'Three' }, { label: 'Four' }]} />,\n` +
            `  receipt: <ReceiptCard unit="sats" rows={[{ label: 'a', amount: 240 }, { label: 'b', amount: 12.5 }, { label: 'c', amount: 0.125 }, { label: 'd', amount: 1200 }]} /> }[q.get('b')];\n` +
            `createRoot(document.getElementById('root')).render(<div className="mx-auto max-w-[60rem] px-4" style={{ paddingTop: q.has('off') ? 3000 : 24, paddingBottom: 1200 }}>{pick}</div>);\n`,
    });
    compileCss(dir, ['blocks']);
    const page = writePage(dir, 'blocks', '<div id="root"></div>', { script: '<script src="blocks.js"></script>' });

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const open = async (b, { off = false, reduced = false, width = 1280 } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const p = await ctx.newPage();
        await p.goto(`${page}?b=${b}${off ? '&off' : ''}`);
        await p.waitForSelector(b === 'demo' ? '[data-demo-mode]' : b === 'cost' ? '[data-cost-demo]' : b === 'path' ? '[data-line]' : 'table');
        return { p, close: () => ctx.close() };
    };
    const demo = (p) => p.evaluate(() => {
        const r = document.querySelector('[data-demo-mode]');
        return { mode: r.dataset.demoMode, step: Number(r.dataset.demoStep) };
    });
    const running = (p, sel) => p.evaluate((s) => document.querySelector(s).getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length, sel);
    // Waits for a condition in the page, up to ms; returns whether it came.
    const until = (p, fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms, polling: 50 }).then(() => true, () => false);

    try {
        // SignInDemo in view: plays through once, says nothing, moves the cursor by transform, rests.
        {
            const { p, close } = await open('demo');
            const moves = [];
            const sample = async () => moves.push(await p.evaluate(() => document.querySelector('[data-demo-cursor]')?.getAttribute('style') ?? ''));
            await sample();
            check(await until(p, () => document.querySelector('[data-demo-mode]').dataset.demoStep === '1', null, STEP * 4), 'SignInDemo in view: never left the first step');
            await sample();
            check(await until(p, () => document.querySelector('[data-success]'), null, STEP * 4), 'SignInDemo: the last step never showed the success picture it was given');
            await p.waitForTimeout(STEP * 2);
            await sample();
            const end = await demo(p);
            check(end.mode === 'auto' && end.step === 2, `SignInDemo: after playing through it is on ${JSON.stringify(end)}, not resting on the last step`);
            check((await running(p, '[data-demo-mode]')) === 0, 'SignInDemo: something still runs after it came to rest');
            const said = await p.evaluate(() => window.__said);
            check(said.length === 0, `SignInDemo: autoplay said ${JSON.stringify(said)}`);
            const live = await p.evaluate(() => document.querySelectorAll('[data-demo-mode] [aria-live]').length);
            check(live === 0, `SignInDemo: ${live} live region(s) inside it`);
            const styles = moves.filter(Boolean);
            check(styles.length >= 2 && styles.every((s) => /transform:\s*translate\(/.test(s) && !/(^|;)\s*(left|top):/.test(s)), `SignInDemo: the cursor does not move by transform alone (${JSON.stringify(styles)})`);
            check(new Set(styles.map((s) => s.match(/translate\([^)]*\)/)?.[0])).size >= 2, `SignInDemo: the cursor never moved (${JSON.stringify(styles)})`);
            await close();
        }
        // Offscreen it waits; in view it plays; a hidden tab holds it where it was.
        {
            const { p, close } = await open('demo', { off: true });
            await p.waitForTimeout(STEP * 2.5);
            const away = await demo(p);
            check(away.step === 0, `SignInDemo offscreen: it played to step ${away.step}`);
            await p.evaluate(() => document.querySelector('[data-demo-mode]').scrollIntoView({ block: 'center' }));
            check(await until(p, () => document.querySelector('[data-demo-mode]').dataset.demoStep === '1', null, STEP * 4), 'SignInDemo: scrolled into view, it never played');
            await p.evaluate(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
                document.dispatchEvent(new Event('visibilitychange'));
            });
            const held = (await demo(p)).step;
            await p.waitForTimeout(100);
            const moving = await running(p, '[data-demo-mode]');
            check(moving === 0, `SignInDemo in a hidden tab: ${moving} animation(s) still run`);
            await p.waitForTimeout(STEP * 3);
            const after = await demo(p);
            check(after.step === held, `SignInDemo in a hidden tab: it moved from step ${held} to ${after.step}`);
            await p.evaluate(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                document.dispatchEvent(new Event('visibilitychange'));
            });
            check(await until(p, (h) => Number(document.querySelector('[data-demo-mode]').dataset.demoStep) > h, held, STEP * 4), 'SignInDemo: shown again, it never picked up');
            await close();
        }
        // The first press stops it for good; then a step a reader moves to is said once.
        {
            const { p, close } = await open('demo');
            const buttons = p.locator('[data-demo-mode] ol button');
            await buttons.nth(2).click();
            const now = await demo(p);
            // A reader's pace: the one live region says a message 100ms after it is set.
            await p.waitForTimeout(300);
            check(now.mode === 'manual' && now.step === 2, `SignInDemo: a press on the third step left it ${JSON.stringify(now)}`);
            await buttons.nth(0).click();
            await p.waitForTimeout(STEP * 3);
            const still = await demo(p);
            check(still.mode === 'manual' && still.step === 0, `SignInDemo after input: it moved by itself to ${JSON.stringify(still)}`);
            const said = await p.evaluate(() => window.__said);
            check(said.length === 2 && said[0] === "You're in, step 3 of 3" && said[1] === 'Enter your email, step 1 of 3', `SignInDemo after input: said ${JSON.stringify(said)}, not each step once`);
            const current = await p.evaluate(() => [...document.querySelectorAll('[data-demo-mode] ol button')].map((b) => b.getAttribute('aria-current')));
            check(current[0] === 'step' && current.filter(Boolean).length === 1, `SignInDemo: aria-current is ${JSON.stringify(current)}`);
            await close();
        }
        // Reduced motion: never plays; the first step, with buttons a thumb can press.
        for (const width of [390, 1280]) {
            const { p, close } = await open('demo', { reduced: true, width });
            await p.waitForTimeout(STEP * 3);
            const s = await demo(p);
            const cursor = await p.locator('[data-demo-cursor]').count();
            const heights = await p.evaluate(() => [...document.querySelectorAll('[data-demo-mode] ol button')].map((b) => b.getBoundingClientRect().height));
            check(s.mode === 'still' && s.step === 0 && cursor === 0, `[${width}] SignInDemo under reduced motion: ${JSON.stringify(s)}, ${cursor} cursor(s)`);
            check(heights.length === 3 && heights.every((h) => h >= 44), `[${width}] SignInDemo step buttons: ${heights.map(Math.round).join('/')}px`);
            await p.locator('[data-demo-mode] ol button').nth(1).click();
            check((await demo(p)).step === 1, `[${width}] SignInDemo under reduced motion: its step button does nothing`);
            await close();
        }

        // CostDemo: words, keys, the number, the verdict, one element for the crowd, one sweep per change.
        {
            const { p, close } = await open('cost');
            const text = () => p.evaluate(() => [...document.querySelectorAll('[role="slider"]')].map((s) => s.getAttribute('aria-valuetext')));
            const read = () => p.evaluate(() => ({ cost: document.querySelector('[data-cost]').textContent, verdict: document.querySelector('[data-verdict]').dataset.verdict }));
            check(JSON.stringify(await text()) === JSON.stringify(['100,000 sats', '30 days']), `Slider words: ${JSON.stringify(await text())}`);
            const crowd = await p.evaluate(() => ({ nodes: document.querySelector('[data-crowd]').querySelectorAll('*').length, canvases: document.querySelectorAll('[data-cost-demo] canvas').length }));
            check(crowd.nodes <= 3 && crowd.canvases === 0, `the crowd is ${crowd.nodes} nodes and ${crowd.canvases} canvases, not one element`);
            check((await running(p, '[data-cost-demo]')) === 0, 'CostDemo: something runs before any change');
            const sliders = p.locator('[role="slider"]');
            await sliders.nth(0).focus();
            await p.keyboard.press('ArrowRight');
            check((await text())[0] === '250,000 sats', `Slider: ArrowRight says ${(await text())[0]}`);
            check((await read()).cost === '2.5', `CostDemo: 1,000 × 250,000 sats reads ${(await read()).cost}, not 2.5`);
            check(await until(p, () => document.querySelector('[data-crowd]').getAnimations({ subtree: true }).some((a) => a.playState === 'running'), null, 1000), 'CostDemo: a change sent no sweep across the crowd');
            check(await until(p, () => document.querySelector('[data-crowd]').getAnimations({ subtree: true }).length === 0, null, 4000), 'CostDemo: the sweep never ended');
            check(await until(p, () => window.__said.length === 1, null, 3000), 'CostDemo: the total was never said');
            const said = await p.evaluate(() => window.__said);
            check(said[0] === '1,000 accounts would need 2.5 BTC held for 30 days', `CostDemo said ${JSON.stringify(said)}`);
            check((await read()).verdict === 'pass', 'CostDemo: at 250,000 sats the real person (500,000 held) does not pass');
            await p.keyboard.press('ArrowRight');
            await p.keyboard.press('ArrowRight');
            const high = await read();
            check(high.verdict === 'fail' && high.cost === '10', `CostDemo at 1,000,000 sats: ${JSON.stringify(high)}`);
            await sliders.nth(1).focus();
            await p.keyboard.press('ArrowLeft');
            check((await text())[1] === '29 days', `Slider: ArrowLeft says ${(await text())[1]}`);
            // The thumb is a thumb's 44px: a press 21px above or below its middle lands on the slider.
            const reach = await p.evaluate(() => {
                const t = document.querySelector('[role="slider"]').getBoundingClientRect();
                const x = t.left + t.width / 2;
                const y = t.top + t.height / 2;
                const root = document.querySelector('[role="slider"]').closest('[data-slider]');
                return [y - 21, y + 21].every((yy) => root.contains(document.elementFromPoint(x, yy)));
            });
            check(reach, 'Slider: a press within 22px of the thumb misses it');
            await close();
        }
        {
            const { p, close } = await open('cost', { reduced: true });
            await p.locator('[role="slider"]').nth(0).focus();
            await p.keyboard.press('ArrowRight');
            await p.waitForTimeout(100);
            check((await running(p, '[data-cost-demo]')) === 0, 'CostDemo under reduced motion: a change still sweeps the crowd');
            await close();
        }

        // StepPath: armed below the fold, drawn when seen; simply drawn under reduced motion.
        {
            const { p, close } = await open('path', { off: true });
            const line = () => p.evaluate(() => document.querySelector('[data-line]').dataset.line);
            check((await line()) === 'armed', `StepPath below the fold: the line is ${await line()}, not waiting`);
            await p.evaluate(() => document.querySelector('[data-line]').scrollIntoView({ block: 'center' }));
            check(await until(p, () => document.querySelector('[data-line]').dataset.line === 'drawing', null, 3000), 'StepPath: seen, it never drew');
            const list = await p.evaluate(() => [...document.querySelectorAll('[data-line] ol > li')].map((li) => [li.dataset.state, li.getAttribute('aria-current')]));
            check(JSON.stringify(list) === JSON.stringify([['done', null], ['done', null], ['current', 'step'], ['upcoming', null]]), `StepPath steps: ${JSON.stringify(list)}`);
            await close();
            const r = await open('path', { off: true, reduced: true });
            await r.p.waitForTimeout(300);
            const drawn = await r.p.evaluate(() => document.querySelector('[data-line]').dataset.line);
            check(drawn === 'drawn', `StepPath under reduced motion: the line is ${drawn}`);
            await r.close();
        }

        // ReceiptCard: the points stack.
        {
            const { p, close } = await open('receipt');
            const cols = await p.evaluate(() =>
                [...document.querySelectorAll('td')].map((td) => {
                    const [int, frac] = td.querySelectorAll('span');
                    return { int: Math.round(int.getBoundingClientRect().right), frac: Math.round(frac.getBoundingClientRect().left) };
                })
            );
            check(new Set(cols.map((c) => c.int)).size === 1 && new Set(cols.map((c) => c.frac)).size === 1, `ReceiptCard: amounts do not line up on the point (${JSON.stringify(cols)})`);
            await close();
        }

        // No block widens a phone.
        for (const b of ['demo', 'cost', 'path', 'receipt']) {
            const { p, close } = await open(b, { width: 390 });
            const w = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
            check(w[0] <= w[1], `[390] ${b}: the page is ${w[0]}px wide in a ${w[1]}px window`);
            await close();
        }
    } finally {
        await browser.close();
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} blocks failure(s)`);
    process.exit(1);
}
console.log(`✓ blocks: ${checks} checks in Chrome; the sign-in demo plays only in view, once, silently, and stops for good on input; sliders speak in words; one sweep per change; the path draws on view; receipts stack on the point; no block widens a phone`);
