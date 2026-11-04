#!/usr/bin/env node
/*
 * The interactive blocks (./blocks) doing what they promise, in Chrome:
 *
 * - SignInDemo plays by itself only while it is on screen in a shown tab,
 *   pauses where it was otherwise, plays through once and rests with nothing
 *   left running. Its cursor moves by transform, never left/top. Nothing is
 *   said while it plays; the first press, Tab or focus stops it for good on
 *   the step it was on, and then each step a reader moves to is said once.
 *   Try again, a real button outside the pictured window, plays it from the
 *   start and leaves focus on the first step. Under reduced motion it never
 *   plays: the first step, with 44px step buttons that work. The last step
 *   shows the caller's success picture.
 * - The Slider says its value in words, moves by key and is a 44px target;
 *   focused from the keyboard, it and a step button draw a ring at least
 *   2px wide. CostDemo steps through the site's stops in the site's words; its number
 *   and the real person's verdict follow the sliders, and the site's own
 *   cost and sentences replace the defaults; the crowd is one element, not a
 *   node per account; one sweep crosses it per change and then nothing runs;
 *   none under reduced motion; the total is said once a change settles.
 * - A bento tile's halftone stays clear of its words. Its heading is its
 *   title or its label, at the level given, drawn as the line it replaces;
 *   a tile has none unless asked.
 * - StepPath draws its line when it comes into view, and is simply drawn
 *   under reduced motion, also when served and hydrated; its steps are a
 *   list with the current one marked; its labels stay inside its box.
 * - ReceiptCard stacks its amounts on the decimal point.
 * - DitherMark draws the baked PNG its srcSet names, at its own width, in the
 *   ground's art, light and dark, at 1x and 2x, with no layout shift.
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
            `import { createRoot, hydrateRoot } from 'react-dom/client';\n` +
            `import { renderToString } from 'react-dom/server';\n` +
            `import { useEffect } from 'react';\n` +
            `import { SignInDemo, signInDemoSteps, CostDemo, StepPath, ReceiptCard, BentoTile, DitherMark } from '${src('blocks/index.ts')}';\n` +
            `const q = new URLSearchParams(location.search);\n` +
            `if (q.has('dark')) document.documentElement.classList.add('dark');\n` +
            // Every layout shift the page makes, summed.
            `window.__shift = 0;\n` +
            `new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__shift += e.value))).observe({ type: 'layout-shift', buffered: true });\n` +
            // Everything the page's one live region says, in order.
            `window.__said = [];\n` +
            `new MutationObserver((ms) => { const r = document.getElementById('oca-announcer'); if (r && r.textContent && ms.some((m) => r === m.target || r.contains(m.target))) window.__said.push(r.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true });\n` +
            `const steps = signInDemoSteps().map((s) => ({ ...s, screens: s.screens.map((sc) => ({ ...sc, duration: ${STEP} })) }));\n` +
            `const own = { id: 'cd', role: 'group', 'aria-label': 'D', cost: (b) => ({ value: 'C' + b.sats, unit: 'U' + b.days }), labels: { personBody: (b, ok) => 'P' + b.sats + ':' + ok, farmBody: (b) => 'F' + b.days } };\n` +
            `const pick = { demo: <SignInDemo steps={steps} success={() => <span data-success="">ok</span>} />, cost: <CostDemo />, own: <CostDemo {...own} />, path: <StepPath current={2} steps={[{ label: 'Open the app', href: '#1' }, { label: 'Back it', href: '#2' }, { label: 'Get paid', href: '#3' }, { label: 'Own your key, later', href: '#4' }]} />,\n` +
            // The baked mark at each size, sized by a class, and on a dark ground.
            `  dither: <div className="flex flex-col items-start gap-4"><DitherMark size="sm" /><DitherMark size="md" /><DitherMark size="lg" title="orangecheck" /><div style={{ width: 300 }}><DitherMark className="w-full" sizes="300px" /></div><DitherMark size="md" ground="dark" /><DitherMark size="md" ground="brand" /></div>,\n` +
            // Ruling 11's person at the edges of their own coin: 250,000 sats, 180 days.
            `  edge: <CostDemo amounts={[249_999, 250_000, 250_001]} dayStops={[179, 180, 181]} defaultAmountIndex={1} defaultDayIndex={1} />,\n` +
            `  pathlong: <StepPath steps={[{ label: 'Open the app on the phone you already carry' }, { label: 'Back it with a coin you hold' }, { label: 'Get paid when an app asks for you' }, { label: 'Own your key, a little later on' }]} />,\n` +
            `  bento: <div className="grid grid-cols-2"><BentoTile tone="burnt" span={2} halftone numeral="80%" title="of a reward">Coming soon.</BentoTile></div>,\n` +
            // A halftone picture at 2:1, to see it kept at its own aspect and cropped by the strip.
            `  art: <div className="grid grid-cols-2"><BentoTile tone="burnt" span={2} halftone={<img alt="" src={'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="orange"/></svg>')} />} numeral="80%" title="of a reward" /></div>,\n` +
            // One tile three ways: no heading, its title the heading (h3 by default), its label the heading at h4.
            `  headings: <div className="grid grid-cols-1 gap-3">{[{}, { heading: 'title' }, { heading: 'label', as: 'h4' }].map((o, i) => <div key={i} data-t={o.heading ?? 'none'} className="grid"><BentoTile label="Sealed" title="Only the two of you can read it" {...o}>Encrypted end to end.</BentoTile></div>)}</div>,\n` +
            `  receipt: <ReceiptCard id="rc" role="group" aria-label="R" unit="sats" facts={[{ label: 'When', value: 'W' }, { label: 'Paid to', value: 'P' }]} split={[{ pct: 80, label: 'x', value: '192 sats' }, { pct: 20, label: 'y' }]} rows={[{ label: 'a', amount: 240 }, { label: 'b', amount: 12.5 }, { label: 'c', amount: 0.125 }, { label: 'd', amount: 1200 }, { label: 'e', amount: <><s>60</s> 48</> }]} /> }[q.get('b')];\n` +
            // With ?ssr the page is the server's HTML, hydrated, as a site serves it: hooks first see the server's answers.
            `function Hydrated() { useEffect(() => { document.documentElement.dataset.hydrated = ''; }, []); return null; }\n` +
            `const app = <div className="mx-auto max-w-[60rem] px-4" style={{ paddingTop: q.has('off') ? 3000 : 24, paddingBottom: 1200 }}>{pick}<Hydrated /></div>;\n` +
            `const root = document.getElementById('root');\n` +
            `window.__mismatch = [];\n` +
            `if (q.has('ssr')) { root.innerHTML = renderToString(app); hydrateRoot(root, app, { onRecoverableError: (e) => window.__mismatch.push(String(e)) }); } else createRoot(root).render(app);\n`,
    });
    compileCss(dir, ['blocks']);
    const page = writePage(dir, 'blocks', '<div id="root"></div>', { script: '<script src="blocks.js"></script>' });

    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: chrome, args: ['--use-angle=swiftshader', '--font-render-hinting=none'] });
    const open = async (b, { off = false, reduced = false, width = 1280, ssr = false, dark = false, dpr = 1 } = {}) => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dpr, reducedMotion: reduced ? 'reduce' : 'no-preference' });
        const p = await ctx.newPage();
        await p.goto(`${page}?b=${b}${off ? '&off' : ''}${ssr ? '&ssr' : ''}${dark ? '&dark' : ''}`);
        await p.waitForSelector('[data-hydrated]', { state: 'attached' });
        await p.waitForSelector({ demo: '[data-demo-mode]', cost: '[data-cost-demo]', own: '[data-cost-demo]', path: '[data-line]', pathlong: '[data-line]', bento: '[data-bento-tone]', headings: '[data-bento-tone]', art: '[data-halftone] img', dither: '[data-dither-mark]', edge: '[data-cost-demo]' }[b] ?? 'table');
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
            // At rest the cursor is parked on Try again, not idle mid-frame.
            const parked = await p.evaluate(() => {
                const c = document.querySelector('[data-demo-cursor]')?.getBoundingClientRect();
                const b = [...document.querySelectorAll('[data-demo-mode] button')].find((x) => x.textContent === 'Try again')?.getBoundingClientRect();
                return c && b ? { x: c.left, y: c.top, b: [b.left, b.right, b.top, b.bottom] } : null;
            });
            check(parked && parked.x >= parked.b[0] && parked.x <= parked.b[1] && parked.y >= parked.b[2] && parked.y <= parked.b[3], `SignInDemo: at rest the cursor is at ${JSON.stringify(parked)}, not on Try again`);
            check((await running(p, '[data-demo-mode]')) === 0, 'SignInDemo: something still runs after it came to rest');
            const said = await p.evaluate(() => window.__said);
            check(said.length === 0, `SignInDemo: autoplay said ${JSON.stringify(said)}`);
            const live = await p.evaluate(() => document.querySelectorAll('[data-demo-mode] [aria-live]').length);
            check(live === 0, `SignInDemo: ${live} live region(s) inside it`);
            const styles = moves.filter(Boolean);
            check(styles.length >= 2 && styles.every((s) => /transform:\s*translate\(/.test(s) && !/(^|;)\s*(left|top):/.test(s)), `SignInDemo: the cursor does not move by transform alone (${JSON.stringify(styles)})`);
            check(new Set(styles.map((s) => s.match(/translate\([^)]*\)/)?.[0])).size >= 2, `SignInDemo: the cursor never moved (${JSON.stringify(styles)})`);
            // Try again: a real button, outside the pictured window, that plays it from the start.
            const again = p.getByRole('button', { name: 'Try again' });
            const hidden = await again.evaluate((b) => Boolean(b.closest('[aria-hidden="true"]')));
            check((await again.count()) === 1 && !hidden, `SignInDemo: no reachable Try again on the last screen (hidden ${hidden})`);
            await again.focus();
            await p.keyboard.press('Enter');
            const restart = await demo(p);
            const focused = await p.evaluate(() => (document.activeElement === document.querySelector('[data-demo-mode] ol button') ? 'first step' : document.activeElement?.outerHTML.slice(0, 80)));
            check(restart.mode === 'auto' && restart.step === 0, `SignInDemo: Try again left it ${JSON.stringify(restart)}`);
            check(focused === 'first step', `SignInDemo: after Try again focus is on ${focused}, not the first step button`);
            check(await until(p, () => document.querySelector('[data-demo-mode]').dataset.demoStep === '1', null, STEP * 4), 'SignInDemo: Try again did not play it again');
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
            check(said.length === 2 && said[0] === "You're in, step 3 of 3" && said[1] === 'Tap the button, step 1 of 3', `SignInDemo after input: said ${JSON.stringify(said)}, not each step once`);
            const current = await p.evaluate(() => [...document.querySelectorAll('[data-demo-mode] ol button')].map((b) => b.getAttribute('aria-current')));
            check(current[0] === 'step' && current.filter(Boolean).length === 1, `SignInDemo: aria-current is ${JSON.stringify(current)}`);
            await close();
        }
        // A Tab into a playing demo stops it on the step it was on, and the focused step button shows a ring.
        {
            const { p, close } = await open('demo');
            await p.waitForTimeout(300);
            const before = await demo(p);
            await p.keyboard.press('Tab');
            const ring = await p.evaluate(() => {
                const el = document.activeElement;
                const cs = getComputedStyle(el);
                return { current: el.getAttribute('aria-current'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
            });
            await p.waitForTimeout(STEP * 3);
            const after = await demo(p);
            check(before.mode === 'auto' && after.mode === 'manual' && after.step === before.step, `SignInDemo: a Tab left it ${JSON.stringify(after)} (it was ${JSON.stringify(before)})`);
            check(ring.current === 'step' && ring.style !== 'none' && ring.width >= 2, `SignInDemo: the Tab-focused step button's ring is ${ring.style} ${ring.width}px`);
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

        // CostDemo: stops in words, keys, the number, the verdict, one element for the crowd, one sweep per change.
        {
            const { p, close } = await open('cost');
            const text = () => p.evaluate(() => [...document.querySelectorAll('[role="slider"]')].map((s) => s.getAttribute('aria-valuetext')));
            const read = () => p.evaluate(() => ({ cost: document.querySelector('[data-cost]').textContent, verdict: document.querySelector('[data-verdict]').dataset.verdict }));
            const ticks = await p.evaluate(() => [...document.querySelectorAll('[data-cost-demo] [data-slider]')].map((r) => [...r.parentElement.querySelectorAll('[aria-hidden] > span')].map((t) => t.textContent)));
            check(JSON.stringify(await text()) === JSON.stringify(['100,000 sats', '30 days']), `Slider words: ${JSON.stringify(await text())}`);
            await p.keyboard.press('Tab');
            // The ring is drawn on the thumb's square, inside its 44px box.
            const thumb = await p.evaluate(() => {
                const el = document.activeElement;
                const cs = getComputedStyle(el.firstElementChild ?? el);
                const box = el.getBoundingClientRect();
                return { role: el.getAttribute('role'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), w: box.width, h: box.height };
            });
            check(thumb.role === 'slider' && thumb.style !== 'none' && thumb.width >= 2, `Slider: the Tab-focused thumb's ring is ${thumb.style} ${thumb.width}px (focus on ${thumb.role})`);
            check(thumb.w >= 44 && thumb.h >= 44, `Slider: the thumb's own box is ${thumb.w}×${thumb.h}, under 44px`);
            check(JSON.stringify(ticks) === JSON.stringify([['1k', '10k', '100k', '1M', '10M'], ['7d', '30d', '90d', '1y']]), `CostDemo ticks: ${JSON.stringify(ticks)}`);
            // A site that passes no words shows placeholders, never a claim of the package's own (ruling 8).
            const plain = await p.evaluate(() => document.querySelector('[data-cost-demo]').textContent);
            check(!/coin|account|person|clears|costly/i.test(plain) && plain.includes('Label') && plain.includes('Value'), `CostDemo's default words: ${plain}`);
            const crowd = await p.evaluate(() => ({ nodes: document.querySelector('[data-crowd]').querySelectorAll('*').length, canvases: document.querySelectorAll('[data-cost-demo] canvas').length }));
            check(crowd.nodes <= 3 && crowd.canvases === 0, `the crowd is ${crowd.nodes} nodes and ${crowd.canvases} canvases, not one element`);
            check((await running(p, '[data-cost-demo]')) === 0, 'CostDemo: something runs before any change');
            check((await read()).verdict === 'pass' && (await read()).cost === '1', `CostDemo at 100,000 sats: ${JSON.stringify(await read())}`);
            const sliders = p.locator('[role="slider"]');
            await sliders.nth(0).focus();
            await p.keyboard.press('ArrowRight');
            check((await text())[0] === '1,000,000 sats', `Slider: ArrowRight says ${(await text())[0]}`);
            const high = await read();
            check(high.cost === '10' && high.verdict === 'fail', `CostDemo at 1,000,000 sats (the person holds 250,000): ${JSON.stringify(high)}`);
            check(await until(p, () => document.querySelector('[data-crowd]').getAnimations({ subtree: true }).some((a) => a.playState === 'running'), null, 1000), 'CostDemo: a change sent no sweep across the crowd');
            check(await until(p, () => document.querySelector('[data-crowd]').getAnimations({ subtree: true }).length === 0, null, 4000), 'CostDemo: the sweep never ended');
            // Said once a change settles: the total, and the verdict when the person crossed the bar since the last word.
            const said = (n) => until(p, (k) => window.__said.length >= k, n, 3000).then(() => p.evaluate(() => window.__said));
            check((await said(1))[0] === '10 BTC. Under this bar', `CostDemo crossing above the person said ${JSON.stringify(await said(1))}`);
            await p.keyboard.press('ArrowLeft');
            check((await said(2))[1] === '1 BTC. Gets in', `CostDemo crossing back under the person said ${JSON.stringify(await said(2))}`);
            await sliders.nth(1).focus();
            await p.keyboard.press('ArrowRight');
            check((await text())[1] === '90 days' && (await read()).verdict === 'pass', `CostDemo at 90 days: ${(await text())[1]}, ${(await read()).verdict}`);
            await p.keyboard.press('ArrowRight');
            check((await text())[1] === 'a year' && (await read()).verdict === 'fail', `CostDemo at a year (the person holds 180 days): ${(await text())[1]}, ${(await read()).verdict}`);
            check((await said(3))[2] === '1 BTC. Under this bar', `CostDemo crossing by days said ${JSON.stringify(await said(3))}`);
            await sliders.nth(0).focus();
            await p.keyboard.press('ArrowRight');
            check((await said(4))[3] === '10 BTC', `CostDemo with no crossing said ${JSON.stringify(await said(4))}`);
            // At every stop the square's centre, the fill's end and the stop's tick meet (within 1px).
            const meet = async () =>
                p.evaluate(() => {
                    const root = document.querySelector('[data-cost-demo] [data-slider]');
                    const thumb = root.querySelector('[role="slider"]');
                    const square = (thumb.firstElementChild ?? thumb).getBoundingClientRect();
                    const fill = root.querySelector('[data-slider-fill]')?.getBoundingClientRect();
                    const at = Number(root.querySelector('[role="slider"]').getAttribute('aria-valuenow'));
                    const tick = root.parentElement.querySelectorAll('[aria-hidden] > span')[at].getBoundingClientRect();
                    const c = square.left + square.width / 2;
                    return { c, fill: fill ? fill.right : null, tick: tick.left + tick.width / 2 };
                });
            {
                const amount = p.locator('[role="slider"]').nth(0);
                await amount.focus();
                const off = [];
                for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'End']) {
                    await p.keyboard.press(key);
                    const m = await meet();
                    if (m.fill === null || Math.abs(m.c - m.fill) > 1 || Math.abs(m.c - m.tick) > 1) off.push(`${key}: ${JSON.stringify(m)}`);
                }
                check(off.length === 0, `Slider: the square, the fill and the tick part: ${off.join('; ')}`);
            }
            // The thumb is a thumb's 44px: a press 21px above or below its middle lands on the slider.
            const reach = await p.evaluate(() => {
                const t = document.querySelector('[role="slider"]').getBoundingClientRect();
                const x = t.left + t.width / 2;
                const y = t.top + t.height / 2;
                const root = document.querySelector('[role="slider"]').closest('[data-slider]');
                return [y - 21, y + 21].every((yy) => root.contains(document.elementFromPoint(x, yy)));
            });
            check(reach, 'Slider: a press within 22px of the thumb misses it');
            // The band a press lands in is a thumb tall along the whole track, not only around the thumb.
            const band = await p.evaluate(() => {
                const root = document.querySelector('[role="slider"]').closest('[data-slider]');
                const t = document.querySelector('[role="slider"]').getBoundingClientRect();
                const track = root.querySelector('[data-slider-fill]').parentElement.getBoundingClientRect();
                const x = Math.abs(track.left + 4 - (t.left + t.width / 2)) > 40 ? track.left + 4 : track.right - 4;
                const y = track.top + track.height / 2;
                return [y - 21, y + 21].every((yy) => root.contains(document.elementFromPoint(x, yy)));
            });
            check(band, 'Slider: a press 21px above or below the track, away from the thumb, misses the slider');
            await close();
        }
        // Ruling 11's defaults: the real person holds one coin of 250,000 sats for 180 days, and the badge reads
        // "Gets in" at or under that and "Under this bar" above it.
        {
            const { p, close } = await open('edge');
            const badge = () => p.evaluate(() => {
                const v = document.querySelector('[data-verdict]');
                const b = v.lastElementChild;
                return [v.dataset.verdict, b.firstChild.textContent];
            });
            const sliders = p.locator('[role="slider"]');
            const seen = [JSON.stringify(await badge())];
            await sliders.nth(0).focus();
            await p.keyboard.press('ArrowRight');
            seen.push(JSON.stringify(await badge()));
            await p.keyboard.press('ArrowLeft');
            await sliders.nth(1).focus();
            await p.keyboard.press('ArrowRight');
            seen.push(JSON.stringify(await badge()));
            check(
                JSON.stringify(seen) === JSON.stringify([JSON.stringify(['pass', 'Gets in']), JSON.stringify(['fail', 'Under this bar']), JSON.stringify(['fail', 'Under this bar'])]),
                `CostDemo's default person at 250,000 sats / 180 days, then 250,001, then 181 days: ${seen.join(' ')}`
            );
            await close();
        }

        // DitherMark: the baked PNG at each size, light and dark, at 1x and 2x: the picture the srcSet names, at its
        // own width, drawn in two tones (ink alone on brand), the ground's own art, no vector stand-in, and nothing
        // moves as it loads.
        for (const dark of [false, true]) {
            for (const dpr of [1, 2]) {
                const { p, close } = await open('dither', { dark, dpr });
                await p.waitForFunction(() => [...document.querySelectorAll('[data-dither-mark] img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 });
                const marks = await p.evaluate(async () =>
                    Promise.all([...document.querySelectorAll('[data-dither-mark]')].map(async (m) => {
                        const shown = [...m.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().width > 0);
                        const img = shown[0];
                        if (!img) return { kind: m.dataset.ditherMark, shown: 0, svg: m.querySelectorAll('svg').length };
                        const set = img.srcset.split(', ').map((c) => [c.slice(0, c.lastIndexOf(' ')), parseInt(c.slice(c.lastIndexOf(' ') + 1), 10)]);
                        // The file the browser picked, at its own pixels (an <img> with w descriptors reports its CSS width).
                        const file = new Image();
                        file.src = img.currentSrc;
                        await file.decode();
                        const canvas = document.createElement('canvas');
                        canvas.width = file.naturalWidth;
                        canvas.height = file.naturalHeight;
                        const x = canvas.getContext('2d', { willReadFrequently: true });
                        x.drawImage(file, 0, 0);
                        const px = x.getImageData(0, 0, canvas.width, canvas.height).data;
                        let opaque = 0;
                        let warm = 0;
                        const colours = new Set();
                        for (let i = 0; i < px.length; i += 4) {
                            if (px[i + 3] > 200) {
                                opaque++;
                                if (px[i] > 0x60) warm++;
                                colours.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
                            }
                        }
                        const r = img.getBoundingClientRect();
                        return {
                            kind: m.dataset.ditherMark,
                            shown: shown.length,
                            svg: m.querySelectorAll('svg').length,
                            png: img.currentSrc.startsWith('data:image/png;base64,'),
                            ground: img.dataset.ground,
                            natural: file.naturalWidth,
                            aspect: file.naturalWidth / file.naturalHeight,
                            // The 2:1 box the element holds before any picture decodes (width and height map to aspect-ratio).
                            reserved: ((r) => (r ? +r[1] / +r[2] : 0))(getComputedStyle(img).aspectRatio.match(/([\d.]+)\s*\/\s*([\d.]+)/)),
                            candidate: set.find(([u]) => u === img.currentSrc)?.[1] ?? null,
                            widest: Math.max(...set.map(([, w]) => w)),
                            w: Math.round(r.width * 10) / 10,
                            h: Math.round(r.height * 10) / 10,
                            filled: Math.round((opaque / (px.length / 4)) * 100) / 100,
                            colours: colours.size,
                            warm,
                        };
                    }))
                );
                const theme = dark ? 'dark' : 'light';
                const want = [['sm', 120, theme], ['md', 240, theme], ['lg', 480, theme], ['sized', 300, theme], ['md', 240, 'dark'], ['md', 240, 'brand']];
                // The picked file is the candidate its descriptor names, 2:1, and enough pixels for the box at this density.
                // A fixed size carries its own 2x bake, and a 2x screen draws from it pixel for pixel (md never from 240 alone).
                const off = marks.flatMap((m, i) => {
                    const [kind, w, ground] = want[i] ?? [];
                    const fixed = kind !== 'sized';
                    const ok =
                        m.kind === kind && m.shown === 1 && m.svg === 0 && m.png && m.ground === ground && m.natural === m.candidate && m.aspect === 2 && m.reserved === 2 &&
                        (m.natural >= w * dpr || m.natural === m.widest) && (!fixed || (m.widest >= w * 2 && (dpr < 2 || m.natural === w * 2))) &&
                        Math.abs(m.w - w) <= 0.5 && Math.abs(m.h - w / 2) <= 0.5 && m.filled > 0.1 &&
                        // On brand orange the mark is ink alone: no orange or peach pixel. Elsewhere its faces show their colours.
                        (ground === 'brand' ? m.warm === 0 : m.colours >= 2 && m.warm > 0);
                    return ok ? [] : [JSON.stringify(m)];
                });
                check(marks.length === 6 && off.length === 0, `[${dark ? 'dark' : 'light'} ${dpr}x] DitherMark: ${off.join('; ') || `${marks.length} marks`}`);
                const shift = await p.evaluate(() => window.__shift);
                check(shift === 0, `[${dark ? 'dark' : 'light'} ${dpr}x] DitherMark: the page shifted by ${shift} while the marks loaded`);
                await close();
            }
        }

        // The site's own cost and sentences replace the defaults.
        {
            const { p, close } = await open('own');
            const words = await p.evaluate(() => ({ cost: document.querySelector('[data-cost]').parentElement.textContent, person: document.querySelector('[data-verdict] p').textContent, farm: document.querySelector('[data-cost]').closest('div').parentElement.textContent }));
            check(words.cost === 'C100000U30' && words.person === 'P100000:true' && words.farm.includes('F30'), `CostDemo with the site's words: ${JSON.stringify(words)}`);
            const named = await p.evaluate(() => { const r = document.getElementById('cd'); return [r?.dataset.costDemo, r?.getAttribute('role'), r?.getAttribute('aria-label')]; });
            check(JSON.stringify(named) === JSON.stringify(['', 'group', 'D']), `CostDemo: the caller's id, role and name land on ${JSON.stringify(named)}`);
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
            // Served and hydrated: the first effect sees the server's "not still" and arms the line below the fold, so
            // under reduced motion the line must still end drawn; and in motion it still waits, then draws on view.
            const h = await open('path', { off: true, reduced: true, ssr: true });
            await h.p.waitForTimeout(300);
            const still = await h.p.evaluate(() => [document.querySelector('[data-line]').dataset.line, window.__mismatch]);
            check(still[0] === 'drawn' && still[1].length === 0, `StepPath served and hydrated under reduced motion: the line is ${still[0]}, hydration errors ${JSON.stringify(still[1])}`);
            await h.close();
            const m = await open('path', { off: true, ssr: true });
            const armed = await until(m.p, () => document.querySelector('[data-line]').dataset.line === 'armed', null, 1000);
            await m.p.evaluate(() => document.querySelector('[data-line]').scrollIntoView({ block: 'center' }));
            check(armed && (await until(m.p, () => document.querySelector('[data-line]').dataset.line === 'drawing', null, 3000)), `StepPath served and hydrated: armed below the fold ${armed}, but it did not draw on view`);
            await m.close();
        }

        // StepPath's labels stay inside its own box, the end ones too, so a band's overflow clip never cuts one.
        for (const [b, width] of [['path', 320], ['path', 390], ['path', 1280], ['pathlong', 320]]) {
            const { p, close } = await open(b, { width });
            const out = await p.evaluate(() => {
                const box = document.querySelector('[data-line]').getBoundingClientRect();
                const labels = [...document.querySelectorAll('[data-line] li > span:not([aria-hidden])')];
                if (labels.length !== 4) return [`${labels.length} labels found, not 4`];
                return labels
                    .map((e) => [e.textContent, e.getBoundingClientRect()])
                    .filter(([, r]) => r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)
                    .map(([t, r]) => `${t} ${Math.round(r.left)}..${Math.round(r.right)} × ${Math.round(r.top)}..${Math.round(r.bottom)} in ${Math.round(box.left)}..${Math.round(box.right)} × ${Math.round(box.top)}..${Math.round(box.bottom)}`);
            });
            check(out.length === 0, `[${width}] StepPath (${b}): labels outside its box: ${out.join('; ')}`);
            await close();
        }

        // Served and hydrated under reduced motion, the demo rests on its first step.
        {
            const { p, close } = await open('demo', { reduced: true, ssr: true });
            await p.waitForTimeout(STEP * 1.5);
            const s = await demo(p);
            const errors = await p.evaluate(() => window.__mismatch);
            check(s.mode === 'still' && s.step === 0 && errors.length === 0, `SignInDemo served and hydrated under reduced motion: ${JSON.stringify(s)}, hydration errors ${JSON.stringify(errors)}`);
            await close();
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
            check(cols.length === 5 && new Set(cols.map((c) => c.int)).size === 1 && new Set(cols.map((c) => c.frac)).size === 1, `ReceiptCard: amounts, a node among them, do not line up on the point (${JSON.stringify(cols)})`);
            // The facts above the rows, a share read in sats, the caller's id, role and name on the card.
            const card = await p.evaluate(() => {
                const r = document.getElementById('rc');
                const facts = r?.querySelector('[data-facts]');
                return {
                    role: r?.getAttribute('role'),
                    name: r?.getAttribute('aria-label'),
                    facts: facts ? [...facts.querySelectorAll('dt')].map((d) => d.textContent + '=' + d.nextElementSibling.textContent) : [],
                    above: facts && r.querySelector('table') ? facts.getBoundingClientRect().bottom <= r.querySelector('table').getBoundingClientRect().top : false,
                    shares: [...(r?.querySelectorAll('figure dt') ?? [])].map((d) => d.textContent),
                    struck: r?.querySelector('td s')?.textContent,
                };
            });
            check(
                JSON.stringify(card) === JSON.stringify({ role: 'group', name: 'R', facts: ['When=W', 'Paid to=P'], above: true, shares: ['192 sats', '20%'], struck: '60' }),
                `ReceiptCard: ${JSON.stringify(card)}`
            );
            await close();
        }

        // A bento tile's halftone stays clear of its words.
        for (const width of [390, 1280]) {
            const { p, close } = await open('bento', { width });
            const r = await p.evaluate(() => {
                const dots = document.querySelector('[data-halftone]').getBoundingClientRect();
                const words = [...document.querySelectorAll('[data-bento-tone] span, [data-bento-tone] div')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
                return { dots: Math.round(dots.right), words: Math.round(Math.min(...words.map((e) => e.getBoundingClientRect().left))) };
            });
            check(r.words >= r.dots, `[${width}] bento: the words start at ${r.words}px, inside the halftone that ends at ${r.dots}px`);
            // The dots are drawn square, never stretched to the strip.
            const cell = await p.evaluate(() => getComputedStyle(document.querySelector('[data-halftone] > div')).backgroundSize);
            check(/^(\d+(?:\.\d+)?)px \1px$/.test(cell), `[${width}] bento: the dot cell is ${cell}, not square`);
            await close();
            // A picture in the strip keeps its own aspect (2:1 here), and the strip crops it.
            const a = await open('art', { width });
            await a.p.waitForFunction(() => document.querySelector('[data-halftone] img').complete);
            const art = await a.p.evaluate(() => {
                const strip = document.querySelector('[data-halftone]');
                const img = strip.querySelector('img').getBoundingClientRect();
                const box = strip.getBoundingClientRect();
                const words = [...document.querySelectorAll('[data-bento-tone] span')].filter((e) => e.textContent.trim() && !e.closest('[data-halftone]'));
                return { w: img.width, h: img.height, clip: getComputedStyle(strip).overflow, strip: box.right, words: Math.min(...words.map((e) => e.getBoundingClientRect().left)) };
            });
            check(Math.abs(art.w - art.h * 2) <= 1, `[${width}] bento: a 2:1 picture is drawn ${art.w.toFixed(1)}×${art.h.toFixed(1)}, squashed`);
            check(art.clip === 'hidden' && art.words >= art.strip, `[${width}] bento: the strip's overflow is ${art.clip}, not hidden, or the words start at ${Math.round(art.words)}px inside the strip that ends at ${Math.round(art.strip)}px`);
            await a.close();
        }

        // A tile's heading: its title or its label at the level given, drawn exactly as the plain tile's line; none unless asked.
        for (const width of [390, 1280]) {
            const { p, close } = await open('headings', { width });
            const r = await p.evaluate(() => {
                const read = (t) => {
                    const tile = document.querySelector(`[data-t="${t}"]`);
                    const at = tile.getBoundingClientRect();
                    const line = (el) => {
                        const b = el.getBoundingClientRect();
                        const s = getComputedStyle(el);
                        return { tag: el.tagName.toLowerCase(), box: [b.left - at.left, b.top - at.top, b.width, b.height].map((v) => Math.round(v * 2) / 2).join(' '), style: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing, s.textTransform, s.color, s.margin].join(' | ') };
                    };
                    return { headings: tile.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]').length, label: line(tile.querySelector('.oca-label')), title: line(tile.querySelector('.mt-auto > :first-child')) };
                };
                return { none: read('none'), title: read('title'), label: read('label') };
            });
            check(r.none.headings === 0 && r.none.label.tag === 'span' && r.none.title.tag === 'span', `[${width}] BentoTile with no heading: ${r.none.headings} heading(s), its label a ${r.none.label.tag} and its title a ${r.none.title.tag}`);
            check(r.title.headings === 1 && r.title.title.tag === 'h3' && r.title.label.tag === 'span', `[${width}] BentoTile heading="title": its title is a ${r.title.title.tag} and its label a ${r.title.label.tag}, not an h3 and a span`);
            check(r.label.headings === 1 && r.label.label.tag === 'h4' && r.label.title.tag === 'span', `[${width}] BentoTile heading="label" as="h4": its label is a ${r.label.label.tag} and its title a ${r.label.title.tag}, not an h4 and a span`);
            for (const t of ['title', 'label']) {
                for (const part of ['label', 'title']) {
                    const [a, b] = [r.none[part], r[t][part]];
                    check(a.box === b.box && a.style === b.style, `[${width}] BentoTile heading="${t}": its ${part} is drawn at ${b.box} in ${b.style}, the plain tile's at ${a.box} in ${a.style}`);
                }
            }
            await close();
        }

        // No block widens a phone.
        for (const b of ['demo', 'cost', 'path', 'receipt', 'bento']) {
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
