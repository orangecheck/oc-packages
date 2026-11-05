import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

import { visibleObserver } from '../lib/viewport';

/*
 * What the blocks share: whether the reader asked for stillness, and
 * whether a block is on screen in a tab someone is looking at.
 */

const REDUCE = '(prefers-reduced-motion: reduce)';

/** True when the reader asked for reduced motion; follows the setting live. On the server, false. */
export function usePrefersStill(): boolean {
    return useSyncExternalStore(
        (cb) => {
            if (typeof window === 'undefined' || !window.matchMedia) return () => {};
            const mq = window.matchMedia(REDUCE);
            mq.addEventListener('change', cb);
            return () => mq.removeEventListener('change', cb);
        },
        () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCE).matches),
        () => false
    );
}

/**
 * True while at least `threshold` of the element is on screen and the tab is
 * shown. Without an observer it counts as seen, so nothing waits forever.
 */
export function useOnScreen(ref: RefObject<Element | null>, threshold = 0.35): boolean {
    const [inView, setInView] = useState(false);
    const [shown, setShown] = useState(true);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (typeof IntersectionObserver === 'undefined') {
            setInView(true);
            return;
        }
        const io = visibleObserver(([e]) => setInView(Boolean(e?.isIntersecting && e.intersectionRatio >= threshold)), {
            threshold: [0, threshold],
        });
        io.observe(el);
        return () => io.disconnect();
    }, [ref, threshold]);
    useEffect(() => {
        const read = () => setShown(!document.hidden);
        read();
        document.addEventListener('visibilitychange', read);
        return () => document.removeEventListener('visibilitychange', read);
    }, []);
    return inView && shown;
}
