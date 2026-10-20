#!/usr/bin/env node
/*
 * appColors (src/tokens) is the palette for places CSS cannot reach: OG
 * images, canvas and WebGL, charts, email. Light and dark are generated from
 * tokens.css into src/tokens/palette.ts, so the committed file must be what
 * the generator writes today, and the built module must carry every colour.
 * The hand-written brand values must equal their variables. Run after
 * `yarn build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPalette, PALETTE_FILE, renderPalette } from './gen-palette.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist/tokens.js');
if (!existsSync(dist)) {
    console.error('✗ mirror: dist/tokens.js is missing; run yarn build first');
    process.exit(1);
}
const { appColors } = createRequire(import.meta.url)(dist);
const palette = buildPalette();

let failures = 0;
let checked = 0;
const fail = (msg) => {
    console.error(`✗ mirror: ${msg}`);
    failures++;
};

if (readFileSync(PALETTE_FILE, 'utf8') !== renderPalette(palette)) {
    fail('src/tokens/palette.ts disagrees with tokens.css; run node scripts/gen-palette.mjs');
}
for (const mode of ['light', 'dark']) {
    for (const [key, hex] of Object.entries(palette[mode])) {
        checked++;
        if (appColors[mode][key] !== hex) fail(`appColors.${mode}.${key} is ${appColors[mode][key]}, tokens.css says ${hex}`);
    }
}
for (const [key, value] of Object.entries(appColors.brand)) {
    checked++;
    // orangeDeep → --oca-orange-deep, in light mode.
    const want = palette.light[key];
    if (!want) fail(`appColors.brand.${key} has no variable in tokens.css`);
    else if (want !== String(value).toLowerCase()) fail(`appColors.brand.${key} is ${value}, tokens.css says ${want}`);
}
if (checked < 150) fail(`only ${checked} colours mirrored; the palette lost tokens`);

if (failures) {
    console.error(`\n${failures} mirror failure(s)`);
    process.exit(1);
}
console.log(`✓ mirror: ${checked} colours, every token in light and dark, match tokens.css`);
