/* Headless-browser verification: load every Storybook story, fail on console/
 * page errors, assert CSS actually applied, and screenshot each. Run against a
 * locally served storybook-static. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.SB_BASE || 'http://localhost:6007';
const idx = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'));
const ids = Object.keys(idx.entries);

fs.mkdirSync('/tmp/sb-shots', { recursive: true });

const browser = await chromium.launch();
const results = [];

for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.message || String(e))));
    try {
        await page.goto(`${BASE}/iframe.html?id=${id}&viewMode=story`, {
            waitUntil: 'networkidle',
            timeout: 25000,
        });
        await page.waitForTimeout(500);
        const info = await page.evaluate(() => {
            const root = document.getElementById('storybook-root') || document.getElementById('root');
            let anyStyled = false;
            let sampleBg = 'none';
            if (root) {
                const all = root.querySelectorAll('*');
                for (const el of all) {
                    const cs = getComputedStyle(el);
                    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                        anyStyled = true;
                        sampleBg = cs.backgroundColor;
                        break;
                    }
                }
            }
            return { children: root ? root.childElementCount : 0, anyStyled, sampleBg };
        });
        await page.screenshot({ path: `/tmp/sb-shots/${id.replace(/[^a-z0-9-]/gi, '_')}.png` });
        const real = errors.filter(
            (e) => !/favicon|404 \(Not Found\)|Failed to load resource/i.test(e)
        );
        results.push({ id, ...info, errors: real });
    } catch (e) {
        results.push({ id, children: 0, anyStyled: false, errors: ['NAV: ' + e.message] });
    }
    await page.close();
}
await browser.close();

const bad = results.filter((r) => r.errors.length || r.children === 0 || !r.anyStyled);
console.log(`TOTAL ${results.length} · OK ${results.length - bad.length} · ISSUES ${bad.length}`);
for (const b of bad) {
    console.log(
        `  ✗ ${b.id} children=${b.children} styled=${b.anyStyled} ${b.errors.slice(0, 2).join(' | ')}`
    );
}
if (bad.length === 0) console.log('ALL STORIES RENDERED, STYLED, ERROR-FREE');
process.exitCode = bad.length ? 1 : 0;
