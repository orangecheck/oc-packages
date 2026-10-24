import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { assetSvgs, PNG_WIDTHS } from './assets';

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
});
