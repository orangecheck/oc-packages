import {
    createElement,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type ElementType,
    type ReactNode,
} from 'react';

import { cn } from '../lib/cn';

/*
 * Motion that tells the story and then gets out of the way. Everything here is
 * off under prefers-reduced-motion, does nothing without script, and costs
 * nothing while offscreen.
 */

function prefersStill(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True once the element has been on screen (or immediately without an observer). */
export function useInView<T extends Element>(rootMargin = '0px 0px -12% 0px') {
    const ref = useRef<T>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === 'undefined') {
            setSeen(true);
            return;
        }
        const io = new IntersectionObserver(
            ([e]) => {
                if (e?.isIntersecting) {
                    setSeen(true);
                    io.disconnect();
                }
            },
            { rootMargin }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [rootMargin, seen]);
    return [ref, seen] as const;
}

/**
 * Rise into place the first time it scrolls into view. Content already on
 * screen at load is left alone, so nothing above the fold flashes.
 */
export function Reveal({
    as = 'div',
    delay = 0,
    className,
    style,
    children,
}: {
    as?: ElementType;
    /** Milliseconds, for staggering siblings. */
    delay?: number;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || prefersStill() || typeof IntersectionObserver === 'undefined') return;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
        el.dataset.reveal = 'pending';
        const io = new IntersectionObserver(
            ([e]) => {
                if (e?.isIntersecting) {
                    el.dataset.reveal = 'shown';
                    io.disconnect();
                }
            },
            { rootMargin: '0px 0px -10% 0px' }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return createElement(
        as,
        { ref, className, style: { ...style, '--reveal-delay': `${delay}ms` } as CSSProperties },
        children
    );
}

/**
 * A tall section whose content stays pinned while you scroll through it, and
 * sets `--p` from 0 to 1 on the way. Children read the variable in CSS, so the
 * scroll never re-renders React. Without script or with reduced motion, `--p`
 * stays 0 and the section is an ordinary block.
 */
export function ScrollStory({
    length = 2,
    className,
    innerClassName,
    children,
}: {
    /** Height in viewports; the pinned part plays over (length − 1) of them. */
    length?: number;
    className?: string;
    innerClassName?: string;
    children: ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [pinned, setPinned] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || prefersStill()) return;
        setPinned(true);
        let raf = 0;
        const update = () => {
            raf = 0;
            const r = el.getBoundingClientRect();
            const travel = r.height - window.innerHeight;
            const p = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
            el.style.setProperty('--p', p.toFixed(4));
        };
        const on = () => {
            if (!raf) raf = requestAnimationFrame(update);
        };
        update();
        window.addEventListener('scroll', on, { passive: true });
        window.addEventListener('resize', on);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('scroll', on);
            window.removeEventListener('resize', on);
        };
    }, []);
    return (
        <div ref={ref} className={cn('relative', className)} style={pinned ? { height: `${length * 100}svh` } : undefined}>
            <div className={cn(pinned && 'sticky top-0 flex min-h-svh items-center', innerClassName)}>{children}</div>
        </div>
    );
}

/** A number that counts up to its value the first time it is seen. */
export function Ticker({
    value,
    duration = 1200,
    format = (n) => Math.round(n).toLocaleString('en-US'),
    className,
}: {
    value: number;
    duration?: number;
    format?: (n: number) => string;
    className?: string;
}) {
    const [ref, seen] = useInView<HTMLSpanElement>();
    const [shown, setShown] = useState(value);
    // Count only a number that starts below the fold; one already on screen
    // keeps its value rather than flashing it, then zero, then counting.
    const animate = useRef<boolean | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el || animate.current !== null) return;
        animate.current = !prefersStill() && el.getBoundingClientRect().top > window.innerHeight * 0.9;
        if (animate.current) setShown(0);
    }, [ref]);
    useEffect(() => {
        if (!seen) return;
        if (!animate.current) {
            setShown(value);
            return;
        }
        let raf = 0;
        const t0 = performance.now();
        const step = (now: number) => {
            const k = Math.min(1, (now - t0) / duration);
            setShown(value * (1 - Math.pow(1 - k, 3)));
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [seen, value, duration]);
    return (
        <span ref={ref} className={cn('oca-tabular', className)}>
            {format(shown)}
        </span>
    );
}
