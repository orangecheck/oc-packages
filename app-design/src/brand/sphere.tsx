import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

/*
 * The deck's photograph: a halftone portrait on an orange ball, lit from the
 * upper left, with a hairline stadium behind it. The dot layer is an image of
 * black dots on transparent, made by scripts/halftone.py, so the ball stays CSS
 * and the dots stay crisp at any size.
 */

export const SPHERE_GRADIENT =
    'radial-gradient(86% 86% at 36% 32%, #fff7f0 0%, #ffdec8 14%, #ffa069 34%, #ff7030 56%, #f65210 78%, #de4006 100%)';

const SPHERE_DEPTH = 'inset -14px -22px 44px rgb(150 40 0 / 0.16), 0 36px 70px -34px rgb(234 88 11 / 0.45)';

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

function Ball({ src, alt, float }: { src: string; alt: string; float: boolean }) {
    return (
        <div
            className={cn('relative size-full overflow-hidden rounded-full', float && 'oca-animate-float')}
            style={{ background: SPHERE_GRADIENT, boxShadow: SPHERE_DEPTH }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- a static dot layer, sized by CSS */}
            <img src={src} alt={alt} className="absolute inset-0 size-full select-none" draggable={false} />
        </div>
    );
}

export function HalftoneSphere({ src, alt, stadium = false, float = false, className, style }: HalftoneSphereProps) {
    if (!stadium) {
        return (
            <div className={cn('relative aspect-square w-full', className)} style={style}>
                <Ball src={src} alt={alt} float={float} />
            </div>
        );
    }
    // Measured from the deck's title slide against the ball's width S: the stadium
    // starts 0.255 S left of and 0.127 S above the ball, is 1.11 S wide, and ends
    // level with its foot. Both live inside this box, so nothing reaches the text.
    return (
        <div className={cn('relative aspect-[1.255/1.127] w-full', className)} style={style}>
            <div aria-hidden className="oca-stadium pointer-events-none absolute left-0 top-0 h-full w-[88.4%] rounded-[32%]" />
            <div className="absolute bottom-0 right-0 aspect-square w-[79.7%]">
                <Ball src={src} alt={alt} float={float} />
            </div>
        </div>
    );
}
