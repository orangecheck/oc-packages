import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

/*
 * A project, app or site as a tile: its first letter on one of the deck's three
 * grounds, under a faint dot screen. The ground is picked from the seed, so the
 * same thing keeps the same tile everywhere it appears.
 */

const GROUNDS = [
    {
        className: 'text-oca-ink',
        background: 'linear-gradient(145deg, var(--oca-orange-light), var(--oca-orange-deep))',
        dot: 'rgb(10 10 10 / 0.22)',
    },
    {
        // Lifted at the top edge so the tile keeps its shape on a dark card.
        className: 'text-white ring-1 ring-inset ring-white/15',
        background: 'linear-gradient(145deg, #3d3d3d, #0d0d0d 70%)',
        dot: 'rgb(255 255 255 / 0.16)',
    },
    {
        className: 'text-oca-ink',
        background: 'linear-gradient(145deg, #fff1df, var(--oca-peach))',
        dot: 'rgb(234 88 11 / 0.22)',
    },
] as const;

const SIZES = {
    sm: 'size-9 rounded-[0.7rem] text-[0.9375rem]',
    md: 'size-11 rounded-[0.85rem] text-[1.125rem]',
    lg: 'size-14 rounded-[1.05rem] text-[1.5rem]',
} as const;

/** The letter a name is known by: its first letter or digit, upper-cased. */
export function monogramLetter(name: string): string {
    const match = name.match(/[\p{L}\p{N}]/u);
    return match ? match[0].toLocaleUpperCase() : '·';
}

/** Which ground a seed lands on: FNV-1a, so it is stable across renders and builds. */
export function monogramGround(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % GROUNDS.length;
}

export function Monogram({
    name,
    seed,
    size = 'md',
    className,
    style,
}: {
    name: string;
    /** What keeps the tile stable, such as a project key or a domain. Defaults to the name. */
    seed?: string;
    size?: keyof typeof SIZES;
    className?: string;
    style?: CSSProperties;
}) {
    const ground = GROUNDS[monogramGround(seed ?? name)] ?? GROUNDS[0];
    return (
        <span
            aria-hidden
            className={cn(
                'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden font-semibold leading-none tracking-[-0.02em]',
                SIZES[size],
                ground.className,
                className
            )}
            style={{ background: ground.background, ...style }}
        >
            <span
                className="absolute inset-0"
                style={{
                    backgroundImage: `radial-gradient(circle, ${ground.dot} 0.9px, transparent 1.2px)`,
                    backgroundSize: '6px 6px',
                    maskImage: 'radial-gradient(90% 90% at 100% 100%, black, transparent 75%)',
                }}
            />
            <span className="relative">{monogramLetter(name)}</span>
        </span>
    );
}
