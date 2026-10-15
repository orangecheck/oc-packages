import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

/*
 * The deck's photograph: a halftone portrait on an orange sphere that glows
 * near-white behind the subject and saturates at the rim, with a hairline
 * stadium behind it. The dot layer is an image of black dots on transparent,
 * made by scripts/halftone.py from any photo, so the sphere stays CSS and the
 * dots stay crisp at any size.
 */

export const SPHERE_GRADIENT =
    'radial-gradient(circle at 50% 42%, #fff8f3 0%, #ffe2d3 22%, #ffb48d 45%, #ff8a55 68%, #ff6a2c 100%)';

export interface HalftoneSphereProps {
    /** The dot layer (black dots on transparent, already circular). */
    src: string;
    /** Describe the person or subject; empty string marks it decorative. */
    alt: string;
    /** Draw the hairline stadium behind the sphere, as the hero does. */
    stadium?: boolean;
    /** Let the sphere drift a few pixels. Off under reduced motion. */
    float?: boolean;
    className?: string;
    style?: CSSProperties;
}

export function HalftoneSphere({ src, alt, stadium = false, float = false, className, style }: HalftoneSphereProps) {
    return (
        <div className={cn('relative aspect-square w-full', className)} style={style}>
            {stadium ? (
                // Measured from the deck's title slide: a rounded square, its corners
                // 17% of the sphere, level with the sphere's foot, reaching left behind
                // the headline. On phones a ring inside the gutter, since the offset
                // would push the page sideways.
                <div
                    aria-hidden
                    className="oca-stadium pointer-events-none absolute inset-[-6%] rounded-full md:[inset:-12%_14%_0%_-26%] md:rounded-[17%]"
                />
            ) : null}
            <div
                className={cn('relative size-full overflow-hidden rounded-full', float && 'oca-animate-float')}
                style={{ background: SPHERE_GRADIENT }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- a static dot layer, sized by CSS */}
                <img src={src} alt={alt} className="absolute inset-0 size-full select-none" draggable={false} />
            </div>
        </div>
    );
}
