import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

export interface DitherGroundProps {
    /** A baked 1-bit picture, one pixel a dither cell, ink on clear (a site's own, or ./art). */
    src: string;
    /** Its size in cells. */
    width: number;
    height: number;
    /** CSS px a cell: a whole number, so every cell stays square and sharp at any DPR. */
    cell?: number;
    /** Where it sits in the section, as a background-position: `50% 50%` centres it. */
    at?: string;
    className?: string;
    style?: CSSProperties;
}

/**
 * A dithered picture as a section's ground: still, drawn once at a fixed cell
 * size and never scaled, so a phone sees the middle of it at the same grain a
 * desk sees all of it. It fills the nearest positioned ancestor; the ground
 * shows wherever the picture is clear. Decoration only.
 */
export function DitherGround({ src, width, height, cell = 2, at = '50% 50%', className, style }: DitherGroundProps) {
    return (
        <div
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 bg-no-repeat [image-rendering:pixelated]', className)}
            style={{ backgroundImage: `url(${src})`, backgroundSize: `${width * cell}px ${height * cell}px`, backgroundPosition: at, ...style }}
        />
    );
}
