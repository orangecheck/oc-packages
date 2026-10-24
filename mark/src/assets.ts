import { MARK_FACES, MARK_POINTS, MARK_TILE, markSvg, type MarkVariant } from './index';

/** PNG widths written to assets/png, in px. The bare mark is half as tall; the tile is square. */
export const PNG_WIDTHS = [16, 24, 32, 40, 48, 64, 80, 96, 128, 256] as const;

const FILES: Array<{ name: string; variant: MarkVariant; color?: string }> = [
    { name: 'orangecheck-mark-brand', variant: 'brand' },
    { name: 'orangecheck-mark-tile', variant: 'tile' },
    { name: 'orangecheck-mark-mono', variant: 'mono' },
    { name: 'orangecheck-mark-mono-black', variant: 'mono', color: '#0A0A0A' },
    { name: 'orangecheck-mark-mono-white', variant: 'mono', color: '#FFFFFF' },
];

/** The standalone SVG files: px-sized, named, one per variant and colour. */
export function assetSvgs() {
    return FILES.map(({ name, variant, color }) => {
        const square = variant === 'tile';
        const svgAt = (w: number, h: number) =>
            markSvg({ variant, color, title: 'orangecheck', width: String(w) }).replace(/height="[^"]*"/, `height="${h}"`);
        return { name, square, svg: `${svgAt(64, square ? 64 : 32)}\n`, svgAt };
    });
}

/** The tile with square corners: an app icon the platform rounds itself (iOS home screen). */
export function squareTileSvg(size: number): string {
    const face = (f: keyof typeof MARK_POINTS) => `<polygon points="${MARK_POINTS[f]}" fill="${MARK_FACES[f]}"/>`;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_TILE.viewBox}" width="${size}" height="${size}">` +
        `<rect width="24" height="24" fill="${MARK_TILE.fill}"/>` +
        `<g transform="${MARK_TILE.transform}">${face('left')}${face('right')}${face('top')}</g></svg>`
    );
}

/**
 * assets/favicon: a site's icon set, drawn from the tile, under the names
 * family sites already link. favicon.ico holds the 16, 32 and 48 px PNGs.
 */
export const FAVICON_PNGS: ReadonlyArray<{ file: string; size: number; square?: true }> = [
    { file: 'favicon-16x16.png', size: 16 },
    { file: 'favicon-32x32.png', size: 32 },
    { file: 'favicon-48x48.png', size: 48 },
    { file: 'apple-touch-icon.png', size: 180, square: true },
    { file: 'android-chrome-192x192.png', size: 192 },
    { file: 'android-chrome-512x512.png', size: 512 },
];
export const FAVICON_ICO_SIZES = [16, 32, 48] as const;

/** favicon.svg: the tile, sized for a tab. */
export function faviconSvg(): string {
    return `${markSvg({ variant: 'tile', width: '32' }).replace(/height="[^"]*"/, 'height="32"')}\n`;
}

/** An .ico holding PNG images (every browser and Windows since Vista read these). */
export function icoFromPngs(images: ReadonlyArray<{ size: number; png: Uint8Array }>): Uint8Array {
    const header = 6 + 16 * images.length;
    const total = header + images.reduce((n, i) => n + i.png.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint16(2, 1, true); // type: icon
    view.setUint16(4, images.length, true);
    let offset = header;
    images.forEach(({ size, png }, i) => {
        const at = 6 + 16 * i;
        view.setUint8(at, size >= 256 ? 0 : size);
        view.setUint8(at + 1, size >= 256 ? 0 : size);
        view.setUint16(at + 4, 1, true); // colour planes
        view.setUint16(at + 6, 32, true); // bits per pixel
        view.setUint32(at + 8, png.length, true);
        view.setUint32(at + 12, offset, true);
        out.set(png, offset);
        offset += png.length;
    });
    return out;
}
