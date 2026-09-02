/**
 * Measure the real vertical rhythm of the <OcSignIn> ceremony on a live page,
 * and screenshot the block.
 *
 * Why this exists: the ceremony's spacing is inline-styled pixel values, not
 * design tokens, so it drifts silently and eyeballing a screenshot does not
 * catch a 4px-vs-14px inconsistency. On 2026-09-02 ochk.io/signin measured
 * 0 / 8 / 14 / 4 — the first OAuth button flush against the PageHeader rule,
 * and the "or" divider glued to the tab row instead of sitting between the
 * two blocks. Numbers found it; the screenshot only confirmed it.
 *
 * Expected after the 2026-09-02 fix (auth-client >= 2.22.1):
 *   headerRuleToFirstButton  32   (page-level mt-8, matches /sudo)
 *   betweenButtons            8   (BUTTON_GAP — siblings group tighter)
 *   lastButtonToDivider      16   (BLOCK_GAP)
 *   dividerToTabs            16   (BLOCK_GAP — equidistant, the whole point)
 *
 * Usage: node scripts/measure-signin-rhythm.mjs [url] [outPng]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'https://ochk.io/signin';
const out = process.argv[3] ?? '/tmp/signin.png';

const browser = await chromium.launch();
const page = await browser.newPage({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 2,
});
// NOT networkidle — the analytics script holds a connection open forever.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
// Provider buttons are fetched client-side from /api/auth/providers.
await page.waitForSelector('[data-oc-signin-providers]', { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);

const measured = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const providers = q('[data-oc-signin-providers]');
    const buttons = [...document.querySelectorAll('[data-oc-signin-provider]')].map((e) =>
        e.getBoundingClientRect()
    );
    const tabs = box(q('[data-oc-signin-tabs]'));
    const header = box(q('h1')?.closest('.space-y-3'));
    const divider = providers
        ? box([...providers.children].find((c) => !c.hasAttribute('data-oc-signin-provider')))
        : null;
    const providersBox = box(providers);
    const r = { buttonCount: buttons.length };
    if (header && providersBox) r.headerRuleToFirstButton = Math.round(providersBox.top - header.bottom);
    if (buttons.length > 1) r.betweenButtons = Math.round(buttons[1].top - buttons[0].bottom);
    if (buttons.length && divider)
        r.lastButtonToDivider = Math.round(divider.top - buttons[buttons.length - 1].bottom);
    if (divider && tabs) r.dividerToTabs = Math.round(tabs.top - divider.bottom);
    return r;
});

console.log(`\n  ${url}`);
console.log('  measured rhythm (px):', JSON.stringify(measured));

// The divider must be equidistant from the block above and the block below.
const { lastButtonToDivider: above, dividerToTabs: below } = measured;
if (typeof above === 'number' && typeof below === 'number') {
    const skew = Math.abs(above - below);
    console.log(
        skew === 0
            ? '  ✓ divider is equidistant'
            : `  ✗ divider is off-centre by ${skew}px (${above} above / ${below} below)`
    );
    if (skew !== 0) process.exitCode = 1;
}
if (measured.headerRuleToFirstButton === 0) {
    console.log('  ✗ first button is flush against the element above it');
    process.exitCode = 1;
}

const block = await page.$('[data-oc-signin]');
if (block) await block.screenshot({ path: out.replace(/\.png$/, '-block.png') });
await page.screenshot({ path: out });
console.log(`  screenshots: ${out}, ${out.replace(/\.png$/, '-block.png')}\n`);
await browser.close();
