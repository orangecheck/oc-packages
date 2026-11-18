import type { SVGProps } from 'react';

import { MARK_FACES, MARK_MONO_OPACITY, MARK_PIXEL, MARK_PIXEL_RUNS, MARK_PIXEL_TILE, MARK_POINTS, MARK_TILE, MARK_VIEWBOX, type MarkVariant } from './index';

export {
    MARK_FACES,
    MARK_MIN_PX,
    MARK_MONO_OPACITY,
    MARK_PIXEL,
    MARK_PIXEL_RUNS,
    MARK_PIXEL_TILE,
    MARK_POINTS,
    MARK_TILE,
    MARK_VIEWBOX,
    markDataUri,
    markElement,
    markPixelRuns,
    markSvg,
} from './index';
export type { MarkSvgOptions, MarkVariant } from './index';

export interface OrangecheckMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height'> {
    variant?: MarkVariant;
    /** An accessible name. Without one the mark is decoration, hidden from assistive technology. */
    title?: string;
    /** Width as a CSS length or px number, `1.6em` by default (the tile `1.5em`); the height follows. */
    size?: string | number;
    /** Draw it in pixels: crisp at 32 px wide and its multiples (the tile at 48 px and its multiples). */
    pixel?: boolean;
    /** Mono only: every face at full strength, one flat shape (forced colours). */
    flat?: boolean;
    /** The mono colour, `currentColor` by default. */
    color?: string;
}

const ORDER = ['left', 'right', 'top'] as const;

function fiveEighths(size: string | number): string | number {
    if (typeof size === 'number') return (size * 5) / 8;
    const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(size.trim());
    return m ? `${(Number(m[1]) * 5) / 8}${m[2]}` : 'auto';
}

/** The orangecheck mark. Mono takes the text colour; brand is for dark grounds; the tile reads anywhere. */
export function OrangecheckMark({ variant = 'mono', title, size, color = 'currentColor', flat = false, pixel = false, ...rest }: OrangecheckMarkProps) {
    const width = size ?? (variant === 'tile' ? '1.5em' : '1.6em');
    const a11y = title ? { role: 'img' } : { 'aria-hidden': true, focusable: false };
    const crisp = pixel ? { 'data-oc-pixel': '', shapeRendering: 'crispEdges' } : {};
    const polys = ORDER.map((face) => {
        const fill =
            variant === 'mono'
                ? { fill: color, fillOpacity: flat || MARK_MONO_OPACITY[face] === 1 ? undefined : MARK_MONO_OPACITY[face] }
                : { fill: MARK_FACES[face] };
        return pixel ? (
            <g key={face} {...fill}>
                {MARK_PIXEL_RUNS[face].map(([x, y, w]) => (
                    <rect key={`${x},${y}`} x={x} y={y} width={w} height={1} />
                ))}
            </g>
        ) : (
            <polygon key={face} points={MARK_POINTS[face]} {...fill} />
        );
    });
    if (variant === 'tile') {
        const tile = pixel ? MARK_PIXEL_TILE : MARK_TILE;
        const side = tile.viewBox.split(' ')[2];
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={tile.viewBox} width={width} height={width} data-oc-mark="tile" {...crisp} {...a11y} {...rest}>
                {title ? <title>{title}</title> : null}
                <rect width={side} height={side} rx={tile.radius} fill={tile.fill} />
                <g transform={tile.transform}>{polys}</g>
            </svg>
        );
    }
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox={pixel ? MARK_PIXEL.viewBox : MARK_VIEWBOX}
            width={width}
            height={fiveEighths(width)}
            data-oc-mark={variant}
            {...crisp}
            {...a11y}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
            {polys}
        </svg>
    );
}
