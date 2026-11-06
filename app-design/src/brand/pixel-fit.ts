import { PIXEL_MARKS, PIXEL_WORDS } from './pixel.data';

/** A lockup's grid: small, a header's; medium, the smaller lockups'. */
export type PixelGrid = keyof typeof PIXEL_WORDS;

const GRIDS = ['small', 'medium'] as const;

/** Inter's x-height in ems: the height a pixel word stands in for. */
const INTER_X = 0.546;

/**
 * The grid and cell for "orangecheck" in place of a word set at `fontSize`:
 * the drawn x-height nearest Inter's (9px is medium at one pixel a cell, 12px
 * small at two). Cells are whole pixels, square at 1x, 2x and 3x; the small
 * grid never draws at one pixel, where its strokes break up.
 */
export function pixelFit(fontSize: number): { grid: PixelGrid; cell: number } {
    return nearest(fontSize * INTER_X, (grid) => PIXEL_WORDS[grid].xHeight[1] - PIXEL_WORDS[grid].xHeight[0], (grid, cell) => grid === 'small' && cell === 1);
}

/** The grid and whole-pixel cell for a check about `width` wide. */
export function pixelMarkFit(width: number): { grid: PixelGrid; cell: number } {
    return nearest(width, (grid) => PIXEL_MARKS[grid].width);
}

function nearest(target: number, measure: (grid: PixelGrid) => number, skip?: (grid: PixelGrid, cell: number) => boolean) {
    let best: { grid: PixelGrid; cell: number } = { grid: 'medium', cell: 1 };
    let error = Infinity;
    for (let cell = 1; cell <= 8; cell++)
        for (const grid of GRIDS) {
            if (skip?.(grid, cell)) continue;
            const e = Math.abs(measure(grid) * cell - target);
            if (e < error) [best, error] = [{ grid, cell }, e];
        }
    return best;
}
