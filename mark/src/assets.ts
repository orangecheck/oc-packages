import { markSvg, type MarkVariant } from './index';

/** PNG widths written to assets/png, in px. The bare mark is half as tall; the tile is square. */
export const PNG_WIDTHS = [16, 24, 32, 48, 64, 96, 128, 256] as const;

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
