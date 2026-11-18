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

import { assetSvgs, FAVICON_ICO_SIZES, FAVICON_PNGS, faviconSvg, heightAt, icoFromPngs, squareTileSvg } from '../dist/assets.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'svg'), { recursive: true });
mkdirSync(join(out, 'png'), { recursive: true });
mkdirSync(join(out, 'favicon'), { recursive: true });

for (const { name, svg } of assetSvgs()) writeFileSync(join(out, 'svg', `${name}.svg`), svg);
// currentColor has no colour outside a page, so the plain mono SVG has no PNGs.
for (const { name, square, widths, svgAt } of assetSvgs()) {
    for (const w of widths) {
        await sharp(Buffer.from(svgAt(w, heightAt(square, w)))).png({ compressionLevel: 9 }).toFile(join(out, 'png', `${name}-${w}.png`));
    }
}
// A site's icon set, from the tile.
const tile = assetSvgs().find((a) => a.name === 'orangecheck-mark-tile');
const tilePng = (size, square) => sharp(Buffer.from(square ? squareTileSvg(size) : tile.svgAt(size, size))).png({ compressionLevel: 9 }).toBuffer();
writeFileSync(join(out, 'favicon', 'favicon.svg'), faviconSvg());
for (const { file, size, square } of FAVICON_PNGS) writeFileSync(join(out, 'favicon', file), await tilePng(size, square));
const ico = await Promise.all(FAVICON_ICO_SIZES.map(async (size) => ({ size, png: await tilePng(size) })));
writeFileSync(join(out, 'favicon', 'favicon.ico'), icoFromPngs(ico));

console.log(`assets: ${assetSvgs().length} SVGs, ${assetSvgs().reduce((n, a) => n + a.widths.length, 0)} PNGs, ${FAVICON_PNGS.length + 2} favicon files`);
