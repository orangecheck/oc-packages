#!/usr/bin/env node
/*
 * Writes assets/: the mark as standalone SVG files and PNGs at fixed sizes,
 * for clients that cannot run JavaScript (native apps, game engines, email).
 * Built from dist/, so run `yarn build` first. The SVG list is also what
 * assets.test.ts checks the committed files against.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { assetSvgs, PNG_WIDTHS } from '../dist/assets.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'svg'), { recursive: true });
mkdirSync(join(out, 'png'), { recursive: true });

for (const { name, svg } of assetSvgs()) writeFileSync(join(out, 'svg', `${name}.svg`), svg);
for (const { name, square, svgAt } of assetSvgs()) {
    if (name === 'orangecheck-mark-mono') continue; // currentColor has no colour outside a page
    for (const w of PNG_WIDTHS) {
        const h = square ? w : w / 2;
        await sharp(Buffer.from(svgAt(w, h))).png({ compressionLevel: 9 }).toFile(join(out, 'png', `${name}-${w}.png`));
    }
}
console.log(`assets: ${assetSvgs().length} SVGs, ${(assetSvgs().length - 1) * PNG_WIDTHS.length} PNGs`);
