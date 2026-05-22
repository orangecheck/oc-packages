/* WCAG contrast gate: for every skin × mode, convert the token colors to sRGB
 * (via canvas) and compute contrast ratios for the load-bearing text/UI pairs.
 * Flags anything below AA. Serve storybook-static on :6007 first. */
import { chromium } from '@playwright/test';

const BASE = process.env.SB_BASE || 'http://localhost:6007';
const SKINS = ['orangecheck', 'midnight', 'phosphor', 'aurora'];
// pair: [fgVar, bgVar, label, minRatio]  (4.5 = AA text, 3.0 = AA large/UI)
const PAIRS = [
    ['--foreground', '--background', 'body text', 4.5],
    ['--card-foreground', '--card', 'card text', 4.5],
    ['--muted-foreground', '--background', 'muted text', 4.5],
    ['--primary-foreground', '--primary', 'button label', 4.5],
    ['--primary', '--background', 'primary accent', 3.0],
    ['--secondary-foreground', '--secondary', 'secondary btn', 4.5],
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/iframe.html?id=primitives-button--variants&viewMode=story`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(800);

const fails = [];
for (const dark of [false, true]) {
    for (const skin of SKINS) {
        const rows = await page.evaluate(
            ({ skin, dark, PAIRS }) => {
                const h = document.documentElement;
                h.setAttribute('data-oc-theme', skin);
                h.classList.toggle('dark', dark);
                const cs = getComputedStyle(h);
                const cv = document.createElement('canvas');
                cv.width = cv.height = 1;
                const ctx = cv.getContext('2d', { willReadFrequently: true });
                const toRGB = (varName) => {
                    const val = cs.getPropertyValue(varName).trim();
                    ctx.clearRect(0, 0, 1, 1);
                    ctx.fillStyle = '#000';
                    ctx.fillStyle = val; // browser parses oklch → sRGB
                    ctx.fillRect(0, 0, 1, 1);
                    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
                    return [r, g, b];
                };
                const lin = (c) => {
                    c /= 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                };
                const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
                const ratio = (a, b) => {
                    const la = lum(a),
                        lb = lum(b);
                    const hi = Math.max(la, lb),
                        lo = Math.min(la, lb);
                    return (hi + 0.05) / (lo + 0.05);
                };
                return PAIRS.map(([fg, bg, label, min]) => ({
                    label,
                    min,
                    ratio: Math.round(ratio(toRGB(fg), toRGB(bg)) * 100) / 100,
                }));
            },
            { skin, dark, PAIRS }
        );
        const bad = rows.filter((r) => r.ratio < r.min);
        const tag = `${dark ? 'dark ' : 'light'} ${skin.padEnd(11)}`;
        console.log(
            tag,
            rows.map((r) => `${r.label}=${r.ratio}${r.ratio < r.min ? '✗' : ''}`).join('  ')
        );
        bad.forEach((b) => fails.push(`${tag} ${b.label} ${b.ratio} < ${b.min}`));
    }
}
await browser.close();

console.log(`\nCONTRAST FAILURES (below AA): ${fails.length}`);
fails.forEach((f) => console.log('  ✗', f));
process.exitCode = fails.length ? 1 : 0;
