import { UserRound } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

import { cn } from '../lib/cn';

/*
 * A person, round: their picture when there is one, else their initials on a
 * tint picked from the seed, else a person glyph. Monogram is a project or a
 * site, square on three grounds; this is someone you talk to, so the same
 * contact keeps the same colour in every list. The sizes match Monogram's.
 */

const SIZES = {
    '2xs': 'size-7 text-[0.6875rem] [&_svg]:size-3.5',
    xs: 'size-8 text-[0.75rem] [&_svg]:size-4',
    sm: 'size-9 text-[0.8125rem] [&_svg]:size-4',
    md: 'size-11 text-[0.9375rem] [&_svg]:size-5',
    lg: 'size-14 text-[1.1875rem] [&_svg]:size-6',
} as const;

/** Up to two initials: the first letter of each of the first two words ("Satoshi N" → "SN"). */
function personInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '')
        .join('')
        .toLocaleUpperCase();
}

/** The tint's hue (0–359) for a seed: FNV-1a, so it is stable across renders and builds. */
function avatarHue(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % 360;
}

export function Avatar({
    seed,
    name,
    src,
    size = 'sm',
    className,
}: {
    /** What keeps the tint stable: an address, an account id. */
    seed: string;
    /** The name the person goes by; its initials show when there is no picture. */
    name?: string | null;
    /**
     * Their picture. Pass only an address you are content for the browser to
     * load (a data URL, your own host): loading it tells that host who looked.
     * One that fails to load falls back to the initials.
     */
    src?: string | null;
    size?: keyof typeof SIZES;
    className?: string;
}) {
    const [failed, setFailed] = useState<string | null>(null);
    const box = cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full', SIZES[size], className);
    if (src && failed !== src) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" aria-hidden className={cn(box, 'object-cover')} onError={() => setFailed(src)} />
        );
    }
    const initials = name ? personInitials(name) : '';
    return (
        <span
            aria-hidden
            className={cn(box, 'font-medium leading-none')}
            // The lightness of each comes from tokens.css, so the tint turns with the mode.
            style={
                {
                    '--oca-avatar-h': avatarHue(seed),
                    backgroundColor: 'hsl(var(--oca-avatar-h) 60% var(--oca-avatar-bg-l))',
                    color: 'hsl(var(--oca-avatar-h) 45% var(--oca-avatar-fg-l))',
                } as CSSProperties
            }
        >
            {initials || <UserRound />}
        </span>
    );
}
