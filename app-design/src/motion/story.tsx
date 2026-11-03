import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { prefersStill, useMotionSetting } from './env';

/*
 * The ScrollStory contract, read from inside: ScrollStory sets `--p` (0 to 1)
 * on its own element as the page scrolls through it, without a React render.
 * A part inside watches its ancestors' style for that change, so it hears the
 * new value in the same frame and costs nothing while the page is still.
 * Under reduced motion, or with no story around it, the end state stands.
 */

/**
 * Call `fn` with the story's progress now and whenever it changes: a number,
 * or null when no ancestor sets `--p` (no story, or one that does not play).
 * Returns a stop.
 */
export function watchStory(el: Element, fn: (p: number | null) => void): () => void {
    let last: number | null | undefined;
    const check = () => {
        const v = getComputedStyle(el).getPropertyValue('--p').trim();
        const p = v === '' ? null : Number(v);
        if (p !== last) {
            last = p;
            fn(p);
        }
    };
    const mo = new MutationObserver(check);
    for (let a = el.parentElement; a; a = a.parentElement) mo.observe(a, { attributes: true, attributeFilter: ['style'] });
    check();
    return () => mo.disconnect();
}

export interface StorySwapProps {
    /** What the reader sees first. */
    before: ReactNode;
    /** What replaces it once the story passes `at`; the end state, shown alone without motion. */
    after: ReactNode;
    /** The story's progress (0 to 1) at which the swap happens. */
    at?: number;
    className?: string;
    style?: CSSProperties;
}

/**
 * Two states of a headline in one place, swapped as a ScrollStory passes
 * `at`: the old one wipes out, then the new one wipes in. Never both at once.
 * Both stay in the document, so a screen reader reads the story in order and
 * the block keeps the height of the taller.
 */
export function StorySwap({ before, after, at = 0.62, className, style }: StorySwapProps) {
    const ref = useRef<HTMLDivElement>(null);
    const setting = useMotionSetting();
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const set = (state: 'before' | 'after') => {
            if (el.dataset.state && el.dataset.state !== state) el.dataset.moved = '';
            el.dataset.state = state;
        };
        if (prefersStill()) {
            set('after');
            return;
        }
        // The story sets --p in its own effect, after this one: give it a frame before deciding there is none.
        let raf = 0;
        const stop = watchStory(el, (p) => {
            cancelAnimationFrame(raf);
            if (p !== null) set(p >= at ? 'after' : 'before');
            else raf = requestAnimationFrame(() => set('after'));
        });
        return () => {
            cancelAnimationFrame(raf);
            stop();
        };
    }, [at, setting]);
    return (
        <div ref={ref} className={cn('oca-swap', className)} style={style}>
            <div className="oca-swap-state" data-swap="before">
                {before}
            </div>
            <div className="oca-swap-state" data-swap="after">
                {after}
            </div>
        </div>
    );
}
