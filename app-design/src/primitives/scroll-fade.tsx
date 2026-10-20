import { useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * A horizontal scroller that says when there is more. Content that is wider
 * than its box scrolls instead of being clipped, and a soft edge appears on
 * whichever side hides something. Tables, code and tab bars all use it.
 */
export interface ScrollFadeProps extends HTMLAttributes<HTMLDivElement> {
    /** The colour under the scroller, as a CSS value; the edge fades to it. */
    fade?: string;
    /** Classes for the scrolling element itself. */
    innerClassName?: string;
}

export function ScrollFade({ fade = 'var(--card)', className, innerClassName, children, ...props }: ScrollFadeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ left: false, right: false });
    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const left = el.scrollLeft > 1;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        measure();
        // Without ResizeObserver (old engines, jsdom) the edges still follow scrolling.
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, [measure]);
    return (
        <div className={cn('relative min-w-0', className)} {...props}>
            <div
                ref={ref}
                onScroll={measure}
                // While it hides something, a keyboard can reach it to scroll.
                tabIndex={edges.left || edges.right ? 0 : undefined}
                className={cn(
                    // Positioned, so sr-only text deep in a wide row scrolls and clips with the row.
                    'relative overflow-x-auto overscroll-x-contain rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    innerClassName
                )}
            >
                {children}
            </div>
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-150',
                    edges.left ? 'opacity-100' : 'opacity-0'
                )}
                style={{ background: `linear-gradient(to right, ${fade}, transparent)` }}
            />
            <span
                aria-hidden
                className={cn(
                    'pointer-events-none absolute inset-y-0 right-0 w-10 transition-opacity duration-150',
                    edges.right ? 'opacity-100' : 'opacity-0'
                )}
                style={{ background: `linear-gradient(to left, ${fade}, transparent)` }}
            />
        </div>
    );
}
