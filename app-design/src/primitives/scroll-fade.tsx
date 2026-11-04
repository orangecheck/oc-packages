import { useCallback, useEffect, useRef, useState, type FocusEvent, type HTMLAttributes } from 'react';

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
    /**
     * Its name while it hides something and so takes focus: it is then a region with this label.
     * Without one it takes the nearest heading before it, as a docs table under its section's title.
     */
    label?: string;
}

/** The text of the nearest heading before an element, in reading order. */
// A heading's own words: not its link to itself (a docs heading's "#", read "Link to this section") or what it
// hides from a screen reader. A heading that is all link (an autolinked one) keeps that link's words.
function headingText(h: Element): string | undefined {
    const own = h.cloneNode(true) as Element;
    own.querySelectorAll('a[href^="#"], [aria-hidden="true"]').forEach((n) => n.remove());
    const words = (n: Node) => n.textContent?.replace(/#\s*$/, '').replace(/\s+/g, ' ').trim();
    return words(own) || words(h) || undefined;
}

function headingBefore(el: Element): string | undefined {
    for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) {
            const h = sib.matches('h1, h2, h3, h4, h5, h6') ? sib : [...sib.querySelectorAll('h1, h2, h3, h4, h5, h6')].pop();
            const text = h && headingText(h);
            if (text) return text;
        }
    }
    return undefined;
}

export function ScrollFade({ fade = 'var(--card)', className, innerClassName, label, children, ...props }: ScrollFadeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ left: false, right: false });
    const [heading, setHeading] = useState<string>();
    const scrolls = edges.left || edges.right;
    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const left = el.scrollLeft > 1;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
    }, []);
    // The browser leaves a part-hidden focus where it is: Shift+Tab onto a
    // first column of a table scrolled right showed a sliver of the ring.
    // Bring all of it in, clear of the edge fades (32px, 40px) and the ring.
    const reveal = useCallback((e: FocusEvent<HTMLDivElement>) => {
        const el = ref.current;
        const t = e.target;
        if (!el || t === el || !(t instanceof Element) || !t.matches(':focus-visible')) return;
        // After the frame: the browser's own scroll for a hidden focus comes after this event.
        requestAnimationFrame(() => {
            const box = el.getBoundingClientRect();
            const r = t.getBoundingClientRect();
            const left = r.left - (box.left + 36);
            const right = r.right - (box.right - 44);
            if (left < 0) el.scrollLeft += left;
            else if (right > 0) el.scrollLeft += Math.min(right, left);
        });
    }, []);
    useEffect(() => {
        if (scrolls && !label && ref.current) setHeading(headingBefore(ref.current));
    }, [scrolls, label]);
    const name = label ?? heading;
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
                onFocus={reveal}
                // While it hides something, a keyboard can reach it to scroll.
                tabIndex={scrolls ? 0 : undefined}
                role={scrolls && name ? 'region' : undefined}
                aria-label={scrolls && name ? name : undefined}
                className={cn(
                    // Positioned, so sr-only text deep in a wide row scrolls and clips with the row.
                    // The ring is drawn inside the edge: a rounded, clipped frame (a code block's) would cut an outside one away.
                    'relative overflow-x-auto overscroll-x-contain rounded-[inherit] outline-none focus-visible:[outline:2px_solid_var(--ring)] focus-visible:[outline-offset:-2px]',
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
