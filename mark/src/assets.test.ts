import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { assetSvgs, FAVICON_ICO_SIZES, FAVICON_PNGS, faviconSvg, PNG_WIDTHS } from './assets';

const dir = join(__dirname, '..', 'assets');

describe('assets/', () => {
    it('holds exactly the SVGs the mark draws today (run `yarn build && yarn assets` after a change)', () => {
        const want = assetSvgs();
        expect(readdirSync(join(dir, 'svg')).sort()).toEqual(want.map((a) => `${a.name}.svg`).sort());
        for (const { name, svg } of want) expect(readFileSync(join(dir, 'svg', `${name}.svg`), 'utf8')).toBe(svg);
    });

    it('holds every PNG at its size: half as tall for the mark, square for the tile', async () => {
        const names = assetSvgs().filter((a) => a.name !== 'orangecheck-mark-mono');
        const files = readdirSync(join(dir, 'png')).sort();
        expect(files).toEqual(names.flatMap((a) => PNG_WIDTHS.map((w) => `${a.name}-${w}.png`)).sort());
        for (const { name, square } of names) {
            for (const w of PNG_WIDTHS) {
                const meta = await sharp(join(dir, 'png', `${name}-${w}.png`)).metadata();
                expect([meta.width, meta.height]).toEqual([w, square ? w : w / 2]);
            }
        }
    });

    it('holds a favicon set drawn from the tile, under the names sites link', async () => {
        const fav = join(dir, 'favicon');
        expect(readdirSync(fav).sort()).toEqual(['favicon.ico', 'favicon.svg', ...FAVICON_PNGS.map((f) => f.file)].sort());
        expect(readFileSync(join(fav, 'favicon.svg'), 'utf8')).toBe(faviconSvg());
        expect(faviconSvg()).toContain('data-oc-mark="tile"');
        for (const { file, size, square } of FAVICON_PNGS) {
            const img = sharp(join(fav, file));
            const meta = await img.metadata();
            expect([file, meta.width, meta.height]).toEqual([file, size, size]);
            // The home-screen icon is opaque to the corner (the platform rounds it); the rest keep the tile's round corners.
            const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            expect([file, data[3]]).toEqual([file, square ? 255 : 0]);
        }
    });

    it('packs favicon.ico with the 16, 32 and 48 px PNGs', () => {
        const ico = readFileSync(join(dir, 'favicon', 'favicon.ico'));
        expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, FAVICON_ICO_SIZES.length]);
        FAVICON_ICO_SIZES.forEach((size, i) => {
            const at = 6 + 16 * i;
            const [length, offset] = [ico.readUInt32LE(at + 8), ico.readUInt32LE(at + 12)];
            expect(ico[at]).toBe(size);
            expect(ico.subarray(offset, offset + 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            expect(ico.readUInt32BE(offset + 16)).toBe(size); // the PNG's own width
            expect(offset + length).toBeLessThanOrEqual(ico.length);
        });
    });
});
