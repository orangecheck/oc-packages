import type { SVGProps } from 'react';

import { MARK_FACES } from '@orangecheck/mark';

import { cn } from '../lib/cn';
import { pixelMarkFit, type PixelGrid } from './pixel-fit';
import { PIXEL_MARK_OUTLINE, PIXEL_MARKS, PIXEL_WORDS } from './pixel.data';

/*
 * The pixel logo: the check and the wordmark as square cells, baked to SVG
 * paths (scripts/logo). A lockup draws them at whole pixels a cell, so every
 * cell is square at 1x, 2x and 3x, with no font to wait for.
 */

export type { PixelGrid } from './pixel-fit';

export interface PixelMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    /** small: 16 by 8 cells; medium: 24 by 12; art: 32 by 16, for the check drawn large. */
    grid?: PixelGrid | 'art';
    /** The cell in px. */
    cell?: number;
    /** Rendered width in px, in place of `cell`; height follows the 2:1 grid. */
    size?: number;
    /** Accessible name. Omit to render the check as decoration. */
    title?: string;
}

/** The isometric check in square cells, its three faces in the mark's three oranges. */
export function PixelMark({ grid = 'small', cell = 2, size, title, className, ...rest }: PixelMarkProps) {
    const m = PIXEL_MARKS[grid];
    const width = size ?? m.width * cell;
    return (
        <svg
            viewBox={`0 0 ${m.width} ${m.height}`}
            width={width}
            height={width / 2}
            shapeRendering="crispEdges"
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            className={cn('shrink-0', className)}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
            <path d={m.left} fill={MARK_FACES.left} />
            <path d={m.right} fill={MARK_FACES.right} />
            <path d={m.top} fill={MARK_FACES.top} />
        </svg>
    );
}

/** The art check in hairlines: the error page's check, there but not filled in. */
export function PixelMarkOutline({ className, ...rest }: Omit<SVGProps<SVGSVGElement>, 'children'>) {
    const m = PIXEL_MARKS.art;
    return (
        <svg viewBox={`0 0 ${m.width} ${m.height}`} aria-hidden className={cn('shrink-0 overflow-visible', className)} {...rest}>
            <path d={PIXEL_MARK_OUTLINE} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

/** Empty rows over the ascenders: centred beside the check, the x-height sits a cell under the middle, as Inter's does in a line. */
const AIR = 2;

export interface PixelWordmarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    /** small: a six-cell x-height, 63 cells wide; medium: nine, 93 wide. */
    grid?: PixelGrid;
    /** The cell in px: whole pixels keep the cells square. */
    cell?: number;
}

/** "orangecheck" in square cells, in the text colour. */
export function PixelWordmark({ grid = 'small', cell = 2, className, ...rest }: PixelWordmarkProps) {
    const w = PIXEL_WORDS[grid];
    return (
        <svg
            viewBox={`0 ${-AIR} ${w.width} ${w.rows + AIR}`}
            width={w.width * cell}
            height={(w.rows + AIR) * cell}
            role="img"
            aria-label="orangecheck"
            fill="currentColor"
            shapeRendering="crispEdges"
            className={cn('shrink-0', className)}
            {...rest}
        >
            <path d={w.d} />
        </svg>
    );
}

/** The app icon in pixels: the pixel check on the ink tile, its cells whole pixels at the tile's size. */
export function PixelAppIcon({ title, size = 32, className, ...rest }: Omit<SVGProps<SVGSVGElement>, 'children'> & { title?: string; size?: number }) {
    // The classic icon's check spans 0.65 of the tile.
    const { grid, cell } = pixelMarkFit(size * 0.65);
    const m = PIXEL_MARKS[grid];
    const x = Math.round((size - m.width * cell) / 2);
    const y = Math.round((size - m.height * cell) / 2);
    return (
        <svg
            viewBox={`0 0 ${size} ${size}`}
            width={size}
            height={size}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            className={cn('shrink-0', className)}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
            <rect
                width={size}
                height={size}
                rx={(size * 6.25) / 24}
                style={{ fill: 'var(--oca-icon-tile, #0A0A0A)', stroke: 'var(--oca-icon-ring, transparent)' }}
                strokeWidth={size / 48}
            />
            <g transform={`translate(${x} ${y}) scale(${cell})`} shapeRendering="crispEdges">
                <path d={m.left} fill={MARK_FACES.left} />
                <path d={m.right} fill={MARK_FACES.right} />
                <path d={m.top} fill={MARK_FACES.top} />
            </g>
        </svg>
    );
}
