import { cn } from '../lib/cn';
import mark240 from '../../art/dither-mark-240.png';
import mark480 from '../../art/dither-mark-480.png';
import mark960 from '../../art/dither-mark-960.png';
import ink240 from '../../art/dither-mark-ink-240.png';
import ink480 from '../../art/dither-mark-ink-480.png';
import ink960 from '../../art/dither-mark-ink-960.png';
import brand240 from '../../art/dither-mark-brand-240.png';
import brand480 from '../../art/dither-mark-brand-480.png';
import brand960 from '../../art/dither-mark-brand-960.png';

/*
 * The isometric check in a two-tone ordered dither, baked from the mark's own
 * faces (./art, scripts/art/bake.mjs). PNG only: for 1-bit art the PNG is a
 * fifth to a twelfth of the AVIF at every size. The PNGs are inlined, so the
 * mark needs no asset pipeline and no request; one mark carries 0.7 KB (sm),
 * 1.8 KB (md) or 2.7 KB (lg) of HTML, 3.4 KB with every width when a class
 * sizes it, and twice that when it follows the theme. Each fixed width is
 * drawn from the art's own 1x and 2x, pixel for pixel, so the dither stays
 * crisp.
 */

// The build inlines each PNG as base64; a bundler that resolves it to a URL instead (Storybook) passes the URL.
const png = (v: string) => (v.startsWith('iVBORw0KGgo') ? `data:image/png;base64,${v}` : v);

// Which art a ground takes: the ink top face on a light ground (paper, white), the peach one on a dark one, and
// ink alone on brand orange, where the mark's orange sides would vanish.
const ART = {
    light: { 240: png(ink240), 480: png(ink480), 960: png(ink960) },
    dark: { 240: png(mark240), 480: png(mark480), 960: png(mark960) },
    brand: { 240: png(brand240), 480: png(brand480), 960: png(brand960) },
} as const;

type Baked = keyof (typeof ART)['light'];

// A fixed size: its width in CSS pixels, and the baked widths that draw it at 1x and 2x.
const SIZE: Record<'sm' | 'md' | 'lg', { width: number; art: Baked[] }> = {
    sm: { width: 120, art: [240] },
    md: { width: 240, art: [240, 480] },
    lg: { width: 480, art: [480, 960] },
};

export interface DitherMarkProps {
    /** A fixed width: 120, 240 or 480px. Ignored when `sizes` is given. */
    size?: keyof typeof SIZE;
    /**
     * The width the mark draws at, as an `<img sizes>` list, when a class
     * sizes it (`className="w-40 md:w-60"` with `sizes="(min-width: 768px) 240px, 160px"`).
     */
    sizes?: string;
    /** The ground under it: `light` (paper, white), `dark` (ink, burnt), `brand` (orange), or `theme`, light or dark with the page. */
    ground?: 'light' | 'dark' | 'brand' | 'theme';
    /** Its name for a screen reader; without one it is decoration. */
    title?: string;
    className?: string;
}

export function DitherMark({ size = 'md', sizes, ground = 'theme', title, className }: DitherMarkProps) {
    const fixed = sizes ? undefined : SIZE[size];
    const widths: Baked[] = fixed ? fixed.art : [240, 480, 960];
    const width = fixed?.width ?? 480;
    const image = (g: keyof typeof ART, shown: string) => (
        <img
            key={g}
            data-ground={g}
            alt={title ?? ''}
            src={ART[g][widths[0]!]}
            srcSet={widths.map((w) => `${ART[g][w]} ${w}w`).join(', ')}
            sizes={sizes ?? `${width}px`}
            // The intrinsic 2:1 box, so nothing moves while it decodes.
            width={width}
            height={width / 2}
            className={cn('h-auto w-full [image-rendering:pixelated]', shown)}
        />
    );
    return (
        <span data-dither-mark={fixed ? size : 'sized'} className={cn('inline-flex shrink-0', className)} style={fixed ? { width: fixed.width } : undefined}>
            {ground === 'theme' ? [image('light', 'block dark:hidden'), image('dark', 'hidden dark:block')] : image(ground, 'block')}
        </span>
    );
}
