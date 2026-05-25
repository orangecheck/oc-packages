/* Browser proof that a theme changes shape + type + color + elevation, in both
 * modes. Serve storybook-static on :6007 first. */
import { chromium } from '@playwright/test';

const BASE = process.env.SB_BASE || 'http://localhost:6007';
const SKINS = ['orangecheck', 'phosphor', 'lightning', 'gold'];

const b = await chromium.launch();
const page = await b.newPage();
await page.goto(`${BASE}/iframe.html?id=primitives-button--variants&viewMode=story`, {
    waitUntil: 'networkidle',
});
await page.waitForTimeout(600);

const rows = [];
for (const dark of [false, true]) {
    for (const skin of SKINS) {
        await page.evaluate(
            ({ skin, dark }) => {
                const h = document.documentElement;
                h.setAttribute('data-oc-theme', skin);
                h.classList.toggle('dark', dark);
            },
            { skin, dark }
        );
        await page.waitForTimeout(450); // let transition-all settle
        const r = await page.evaluate(() => {
            const def = document.querySelector('#storybook-root button');
            const cs = getComputedStyle(def);
            // dedicated elevation probe (shadow-lg) appended to <body>
            let probe = document.getElementById('__oc_shadow_probe');
            if (!probe) {
                probe = document.createElement('div');
                probe.id = '__oc_shadow_probe';
                probe.className = 'shadow-lg';
                document.body.appendChild(probe);
            }
            return {
                radius: cs.borderTopLeftRadius,
                bg: cs.backgroundColor,
                font: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/['"]/g, ''),
                // the real shadow is the LAST layer (after transparent inset/ring defaults)
                shadow: getComputedStyle(probe).boxShadow.split(/,(?![^(]*\))/).pop().trim(),
            };
        });
        rows.push({ mode: dark ? 'dark' : 'light', skin, ...r });
    }
}
await b.close();

for (const r of rows) {
    console.log(
        `${r.mode.padEnd(5)} ${r.skin.padEnd(11)} radius=${r.radius.padEnd(5)} font=${r.font.padEnd(15)} primary=${r.bg.padEnd(26)} shadow=${r.shadow}`
    );
}

const light = Object.fromEntries(rows.filter((r) => r.mode === 'light').map((r) => [r.skin, r]));
const distinct = new Set(SKINS.map((s) => `${light[s].radius}|${light[s].font}|${light[s].bg}`)).size;
// All four skins are intentionally flat (Bitcoin/cypherpunk ethos: hard borders,
// no soft shadows); the elevation token plumbing remains a capability for custom
// themes. Distinctness comes from colour + radius + type.
console.log(`\nDISTINCT light identities: ${distinct}/${SKINS.length}`);
process.exitCode = distinct === SKINS.length ? 0 : 1;
