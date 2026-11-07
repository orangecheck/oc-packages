import { useEffect, useRef, useState, type ComponentType } from 'react';

import { cn } from '../lib/cn';
import { mediaMatches, prefersReducedMotion } from '../lib/env';
import { png } from '../lib/png';
import type { DitherImageProps } from '../motion/dither-image';
import field1x from '../../art/dither-field.png';
import field2x from '../../art/dither-field-2x.png';
import mark480 from '../../art/dither-mark-480.png';
import mark960 from '../../art/dither-mark-960.png';

/*
 * Closing's art="dither": the family's check in ordered dither, rising out of
 * the dither field at the band's foot. Both are baked PNGs inlined as data
 * URIs (the field 1.5 and 2.8 KB, the mark 0.8 and 1.2 KB), so the band needs
 * no asset pipeline and no request. The 2x of each is its srcset's only
 * candidate, so the 1x is written once, in src.
 */

/**
 * The field, against the section's own box: its foot, on the art's side,
 * fading up and towards the words. The Frame between is not positioned, so
 * the field reaches the band's edge past the frame's rule. On a phone it runs
 * the band's width under the check. From md it is 62% of the band and clear
 * for its first third: the words end at 54 to 57% of the band at every width,
 * and the field shows from 58.5%.
 */
export function ClosingField() {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- the baked PNG as is; next/image would re-encode the dither
        <img
            data-oca-field=""
            src={png(field1x)}
            srcSet={`${png(field2x)} 2x`}
            alt=""
            width={1200}
            height={320}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute right-0 bottom-0 -z-10 h-auto w-full opacity-60 [image-rendering:pixelated] [mask-composite:intersect] [mask-image:linear-gradient(to_top,#000_25%,transparent_90%),linear-gradient(to_right,transparent_5%,#000_45%)] md:w-[62%] md:[mask-image:linear-gradient(to_top,#000_25%,transparent_90%),linear-gradient(to_right,transparent_33%,#000_68%)]"
        />
    );
}

const MARK = 'w-full max-w-[30rem] [image-rendering:pixelated]';
const STILL = { src: png(mark480), srcSet: `${png(mark960)} 2x`, width: 480, height: 240, alt: '' } as const;

/**
 * The check: the baked still, and under a fine pointer DitherImage over the
 * same box, where the dither comes alive as the pointer passes. ./motion is
 * not imported here: its DitherImage is fetched by a dynamic import once the
 * page has loaded and the main thread is idle, and only where it can run (a
 * fine pointer that hovers, motion allowed). So the server and a phone draw
 * only the still, nothing is preloaded, and nothing moves at load. A plain
 * import(), not next/dynamic: the package's next peer is optional, and the
 * still is server-rendered either way.
 */
export function ClosingMark() {
    const still = useRef<HTMLSpanElement>(null);
    const [live, setLive] = useState<{ Image: ComponentType<DitherImageProps>; dark: string } | null>(null);
    useEffect(() => {
        const el = still.current;
        if (!el || prefersReducedMotion() || !mediaMatches('(pointer: fine) and (hover: hover)')) return;
        let gone = false;
        let cancel = () => {};
        const load = () => {
            import('../motion/dither-image').then(
                // The trail draws the mark's faces in the band's orange, read from its token rather than the palette module.
                (m) => {
                    if (!gone) setLive({ Image: m.DitherImage, dark: getComputedStyle(el).getPropertyValue('--oca-burnt-accent').trim() });
                },
                // A chunk that fails to load leaves the still, which is the picture.
                () => {}
            );
        };
        const idle = () => {
            if (typeof window.requestIdleCallback === 'function') {
                const id = window.requestIdleCallback(load, { timeout: 2000 });
                cancel = () => window.cancelIdleCallback(id);
            } else {
                const id = window.setTimeout(load, 300);
                cancel = () => window.clearTimeout(id);
            }
        };
        if (document.readyState === 'complete') idle();
        else window.addEventListener('load', idle, { once: true });
        return () => {
            gone = true;
            window.removeEventListener('load', idle);
            cancel();
        };
    }, []);
    // The live dither, on the band's own ground at the still's grain: 160 cells across.
    if (live) return <live.Image {...STILL} cells={160} dark={live.dark || undefined} className={MARK} />;
    return (
        <span ref={still} data-oca-still="" className={cn('block', MARK)} style={{ aspectRatio: `${STILL.width} / ${STILL.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the baked PNG as is */}
            <img {...STILL} loading="lazy" decoding="async" className="block size-full" />
        </span>
    );
}
