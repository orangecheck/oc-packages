import { createElement, useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { prefersStill } from './env';

/*
 * Reveal's clip-path sibling: the block opens the first time it scrolls into
 * view. 'frame' opens a framed panel out to its full bleed (a statement
 * banner); 'left' and 'up' wipe it in from an edge. As with Reveal, content
 * already on screen at load is left alone, and nothing is hidden without
 * script or under reduced motion.
 */

export interface WipeProps {
    as?: ElementType;
    from?: 'frame' | 'left' | 'up';
    /** Milliseconds, for staggering siblings. */
    delay?: number;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}

export function Wipe({ as = 'div', from = 'frame', delay = 0, className, style, children }: WipeProps) {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || prefersStill() || typeof IntersectionObserver === 'undefined') return;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        el.dataset.wipe = 'pending';
        const io = new IntersectionObserver(
            ([e]) => {
                if (e?.isIntersecting) {
                    el.dataset.wipe = 'shown';
                    io.disconnect();
                }
            },
            { rootMargin: '0px 0px -12% 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return createElement(
        as,
        { ref, className: cn('oca-wipe', className), style: { ...style, '--oca-wipe-delay': `${delay}ms` } as CSSProperties, 'data-from': from },
        children
    );
}
