import type { SVGProps } from 'react';

import { MARK_FACES, MARK_MONO_OPACITY, MARK_POINTS, MARK_TILE, MARK_VIEWBOX, type MarkVariant } from './index';

export { MARK_FACES, MARK_MIN_PX, MARK_MONO_OPACITY, MARK_POINTS, MARK_TILE, MARK_VIEWBOX, markDataUri, markElement, markSvg } from './index';
export type { MarkSvgOptions, MarkVariant } from './index';

export interface OrangecheckMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'width' | 'height'> {
    variant?: MarkVariant;
    /** An accessible name. Without one the mark is decoration, hidden from assistive technology. */
    title?: string;
    /** Width as a CSS length or px number, `1.5em` by default (the tile `1.25em`); the height follows. */
    size?: string | number;
    /** The mono colour, `currentColor` by default. */
    color?: string;
}

const ORDER = ['left', 'right', 'top'] as const;

function half(size: string | number): string | number {
    if (typeof size === 'number') return size / 2;
    const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(size.trim());
    return m ? `${Number(m[1]) / 2}${m[2]}` : 'auto';
}

/** The orangecheck mark. Mono takes the text colour; brand is for dark grounds; the tile reads anywhere. */
export function OrangecheckMark({ variant = 'mono', title, size, color = 'currentColor', ...rest }: OrangecheckMarkProps) {
    const width = size ?? (variant === 'tile' ? '1.25em' : '1.5em');
    const a11y = title ? { role: 'img' } : { 'aria-hidden': true, focusable: false };
    const polys = ORDER.map((face) =>
        variant === 'mono' ? (
            <polygon key={face} points={MARK_POINTS[face]} fill={color} fillOpacity={MARK_MONO_OPACITY[face] === 1 ? undefined : MARK_MONO_OPACITY[face]} />
        ) : (
            <polygon key={face} points={MARK_POINTS[face]} fill={MARK_FACES[face]} />
        )
    );
    if (variant === 'tile') {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={MARK_TILE.viewBox} width={width} height={width} data-oc-mark="tile" {...a11y} {...rest}>
                {title ? <title>{title}</title> : null}
                <rect width="24" height="24" rx={MARK_TILE.radius} fill={MARK_TILE.fill} />
                <g transform={MARK_TILE.transform}>{polys}</g>
            </svg>
        );
    }
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox={MARK_VIEWBOX} width={width} height={half(width)} data-oc-mark={variant} {...a11y} {...rest}>
            {title ? <title>{title}</title> : null}
            {polys}
        </svg>
    );
}
