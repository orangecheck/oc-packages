import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * Tiles laid on a sheet: a big numeral, a line of display type, a picture.
 * Square on a page (the page is square); the rounded version is the social
 * card's, drawn by ./og. Five grounds, each with text that clears contrast.
 */

export type BentoTone = 'paper' | 'white' | 'ink' | 'burnt' | 'brand';

// Each tile is its own ground in its own colours, so it reads the same on paper and inside a band.
const GROUND: Record<BentoTone, string> = {
    paper: 'border border-oca-surface-foreground/10 bg-card text-oca-surface-foreground',
    white: 'border border-oca-surface-foreground/10 bg-oca-surface text-oca-surface-foreground',
    ink: 'bg-oca-ink text-oca-ink-foreground',
    burnt: 'bg-oca-burnt text-oca-burnt-foreground',
    brand: 'bg-brand text-brand-foreground',
};
// The numeral: ember on light grounds (display size only), bright orange on dark ones, ink on orange.
const NUMERAL: Record<BentoTone, string> = {
    paper: 'text-oca-accent-display',
    white: 'text-oca-accent-display',
    ink: 'text-oca-orange',
    burnt: 'text-oca-burnt-accent',
    brand: 'text-brand-foreground',
};
// Quiet text: the surface's own muted token (check-contrast holds it on the card and on white), each dark ground's own muted tone.
const QUIET: Record<BentoTone, string> = {
    paper: 'text-oca-surface-muted',
    white: 'text-oca-surface-muted',
    ink: 'text-oca-ink-muted',
    burnt: 'text-oca-burnt-muted',
    brand: 'text-brand-foreground',
};

const SPAN = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' } as const;
const ROWS = { 1: '', 2: 'sm:row-span-2' } as const;
const COLS = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as const;

export function BentoGrid({ columns = 4, className, children }: { columns?: 2 | 3 | 4; className?: string; children: ReactNode }) {
    return <div className={cn('grid auto-rows-[minmax(15rem,auto)] grid-cols-1 gap-3 md:gap-4', COLS[columns], className)}>{children}</div>;
}

export interface BentoTileProps {
    tone?: BentoTone;
    /** A mono label over the tile. */
    label?: ReactNode;
    /** A big numeral, top left. */
    numeral?: ReactNode;
    /** The tile's line, at display size, bottom left. */
    title?: ReactNode;
    /** Smaller words under the title. */
    children?: ReactNode;
    /** A picture, to the right on a wide tile and under the words on a narrow one. */
    art?: ReactNode;
    /**
     * A field of dots in a strip at the left edge (a fifth of the tile), or your own halftone picture in it. The
     * words keep clear of the strip. A picture keeps its own aspect: it fills the strip's height and is cropped at
     * its edge, never squashed into it.
     */
    halftone?: boolean | ReactNode;
    footer?: ReactNode;
    /** Columns it spans from sm up (2 at most on a tablet). */
    span?: 1 | 2 | 3 | 4;
    rows?: 1 | 2;
    className?: string;
}

export function BentoTile({ tone = 'paper', label, numeral, title, children, art, halftone, footer, span = 1, rows = 1, className }: BentoTileProps) {
    return (
        <div data-bento-tone={tone} className={cn('relative isolate flex min-w-0 flex-col overflow-hidden', GROUND[tone], SPAN[span], ROWS[rows], className)}>
            {halftone ? (
                <div aria-hidden data-halftone="" className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[22%] overflow-hidden [&_img]:h-full [&_img]:w-auto [&_img]:max-w-none">
                    {halftone === true ? (
                        <div className="size-full bg-[radial-gradient(circle,var(--color-oca-orange)_1.2px,transparent_1.6px)] bg-[length:9px_9px] [mask-image:linear-gradient(90deg,#000_0%,#000_30%,transparent_100%)]" />
                    ) : (
                        halftone
                    )}
                </div>
            ) : null}
            <div className={cn('flex flex-1 gap-6 p-6 md:p-8', art ? 'flex-col md:flex-row' : 'flex-col', halftone && 'pl-[calc(22%+1rem)] md:pl-[calc(22%+1.5rem)]')}>
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    {label ? (
                        <span className={cn('oca-label leading-none', QUIET[tone])}>
                            {label}
                        </span>
                    ) : null}
                    {numeral !== undefined ? (
                        <span className={cn('oca-tabular text-[clamp(4.5rem,3.2rem+4vw,8rem)] font-light leading-[0.85] tracking-[-0.05em]', NUMERAL[tone])}>
                            {numeral}
                        </span>
                    ) : null}
                    <div className="mt-auto flex flex-col gap-2 pt-4">
                        {title ? (
                            <span
                                className={cn(
                                    rows === 2
                                        ? 'text-[2rem] font-light leading-[1.02] tracking-[-0.035em] md:text-[3.25rem]'
                                        : 'text-[1.375rem] leading-[1.15] tracking-[-0.015em] md:text-[1.75rem]'
                                )}
                            >
                                {title}
                            </span>
                        ) : null}
                        {children ? <div className={cn('text-[0.9375rem] leading-snug', QUIET[tone])}>{children}</div> : null}
                    </div>
                    {footer ? <div className="pt-2">{footer}</div> : null}
                </div>
                {art ? <div className="flex min-w-0 flex-1 items-center justify-center">{art}</div> : null}
            </div>
        </div>
    );
}
