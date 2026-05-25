/* Pilot-migration verification: prove the migrated oc-stamp-web (served locally
 * via `next start`) is a pixel no-op vs production for the default skin, and that
 * the skin system works in the real app. */
import { chromium } from '@playwright/test';

const LOCAL = process.env.LOCAL_URL || 'http://localhost:3100';
const PROD = process.env.PROD_URL || 'https://stamp.ochk.io';

const browser = await chromium.launch();

async function probe(url) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    const data = await page.evaluate(() => {
        const h = document.documentElement;
        const cs = getComputedStyle(h);
        const btn = document.querySelector('button, a[class*="bg-primary"], .bg-primary');
        const bcs = btn ? getComputedStyle(btn) : null;
        return {
            primary: cs.getPropertyValue('--primary').trim(),
            radius: cs.getPropertyValue('--radius').trim(),
            background: cs.getPropertyValue('--background').trim(),
            font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''),
            ocFontSans: cs.getPropertyValue('--oc-font-sans').trim().slice(0, 24),
        };
    });
    const real = errors.filter((e) => !/favicon|plausible|404|Failed to load resource/i.test(e));
    await page.close();
    return { data, errors: real };
}

const local = await probe(LOCAL);
const prod = await probe(PROD);

console.log('LOCAL (migrated):', JSON.stringify(local.data));
console.log('PROD  (current) :', JSON.stringify(prod.data));
console.log('local console errors:', local.errors.length ? local.errors.slice(0, 3) : 'none');

// Parity: default skin tokens must match production.
const parity =
    local.data.primary === prod.data.primary &&
    local.data.radius === prod.data.radius &&
    local.data.background === prod.data.background;
console.log('DEFAULT-SKIN PARITY (primary+radius+background match prod):', parity);

// Skin switching works in the real app?
const page = await browser.newPage();
await page.goto(LOCAL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);
const skins = {};
for (const skin of ['orangecheck', 'phosphor', 'lightning', 'gold']) {
    const v = await page.evaluate((s) => {
        document.documentElement.setAttribute('data-oc-theme', s);
        const cs = getComputedStyle(document.documentElement);
        return cs.getPropertyValue('--primary').trim() + ' / r=' + cs.getPropertyValue('--radius').trim();
    }, skin);
    skins[skin] = v;
}
await page.close();
await browser.close();

console.log('SKIN SWITCH (real app):');
for (const [k, v] of Object.entries(skins)) console.log('  ', k.padEnd(11), v);
const distinct = new Set(Object.values(skins)).size;
console.log(`distinct skins: ${distinct}/4`);

process.exitCode = parity && local.errors.length === 0 && distinct === 4 ? 0 : 1;
