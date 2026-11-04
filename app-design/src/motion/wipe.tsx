import { createElement, useEffect, useRef, type CSSProperties, type ElementType, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { visibleBottom, visibleObserver, type VisibleObserver } from '../lib/viewport';
import { prefersStill, useMotionSetting } from './env';

/*
 * Reveal's clip-path sibling: the block opens the first time it scrolls into
 * view. 'frame' opens a framed panel out to its full bleed (a statement
 * banner); 'center' opens it from a point at its middle; 'left' and 'up' wipe
 * it in from an edge. As with Reveal, content already on screen at load is
 * left alone, and nothing is hidden without script or under reduced motion.
 *
 * The prototype's /how steps showed the cheapest way to do this: CSS state on
 * the element and one IntersectionObserver for all of them. Every Wipe on a
 * page shares one observer, and each leaves it once shown.
 */

/** Any other attribute (id, aria-*, data-*) goes on the root. */
export interface WipeProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    as?: ElementType;
    from?: 'frame' | 'center' | 'left' | 'up';
    /** Milliseconds, for staggering siblings. */
    delay?: number;
    children: ReactNode;
}

const waiting = new Map<Element, () => void>();
let io: VisibleObserver | null = null;

/** Call `fn` once, the first time `el` comes into view. Returns a cancel. */
function onceInView(el: Element, fn: () => void): () => void {
    io ??= visibleObserver(
        (records) => {
            for (const r of records) {
                if (!r.isIntersecting) continue;
                const done = waiting.get(r.target);
                waiting.delete(r.target);
                io?.unobserve(r.target);
                done?.();
            }
        },
        { rootMargin: '0px 0px -12% 0px' }
    );
    waiting.set(el, fn);
    io.observe(el);
    return () => {
        waiting.delete(el);
        io?.unobserve(el);
    };
}

export function Wipe({ as = 'div', from = 'frame', delay = 0, className, style, children, ...rest }: WipeProps): ReactElement {
    const ref = useRef<HTMLElement>(null);
    const setting = useMotionSetting();
    useEffect(() => {
        const el = ref.current;
        if (!el || prefersStill() || typeof IntersectionObserver === 'undefined') return;
        if (el.getBoundingClientRect().top < visibleBottom() * 0.92) return;
        el.dataset.wipe = 'pending';
        return onceInView(el, () => (el.dataset.wipe = 'shown'));
    }, [setting]);
    return createElement(
        as,
        { ...rest, ref, className: cn('oca-wipe', className), style: { ...style, '--oca-wipe-delay': `${delay}ms` } as CSSProperties, 'data-from': from },
        children
    );
}
