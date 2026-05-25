/* Honest live-UI check: does the deployed site actually render OcAppearanceMenu
 * and does clicking a theme switch + persist it? Catches "tokens work but the
 * control is missing/crashing" — which token-parity checks miss.
 * Usage: SITES="https://a,https://b" node scripts/verify-live-ui.mjs */
import { chromium } from '@playwright/test';

const SITES = (process.env.SITES || '').split(',').map((s) => s.trim()).filter(Boolean);
const browser = await chromium.launch();

for (const url of SITES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
    const out = { url, menu: false, opened: false, switched: false, persisted: false, errors: [] };
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2500);
        const trigger = page.locator('button[aria-label="appearance settings"]');
        out.menu = (await trigger.count()) > 0;
        if (out.menu) {
            await trigger.first().click();
            await page.waitForTimeout(300);
            const goldItem = page.locator('[role="menuitemradio"]', { hasText: 'gold' });
            out.opened = (await page.locator('[role="menu"]').count()) > 0 && (await goldItem.count()) > 0;
            if (out.opened) {
                await goldItem.first().click();
                await page.waitForTimeout(400);
                out.switched =
                    (await page.evaluate(() => document.documentElement.getAttribute('data-oc-theme'))) ===
                    'gold';
                out.persisted = await page.evaluate(() => /oc_skin=gold/.test(document.cookie));
            }
        }
    } catch (e) {
        out.errors.push('NAV: ' + e.message);
    }
    out.errors.push(...errors.filter((e) => !/favicon|plausible|404|Failed to load resource|net::ERR/i.test(e)));
    await page.close();
    const ok = out.menu && out.opened && out.switched && out.persisted && out.errors.length === 0;
    console.log(
        `${ok ? '✅' : '❌'} ${url}  menu=${out.menu} open=${out.opened} switch=${out.switched} persist=${out.persisted}` +
            (out.errors.length ? `  ERR: ${out.errors.slice(0, 2).join(' | ')}` : '')
    );
}
await browser.close();
