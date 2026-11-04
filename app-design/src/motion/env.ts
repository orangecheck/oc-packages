/*
 * What a scene asks of the page before it moves: may it move at all, may it
 * follow the pointer, is there time to spare, and which ground it sits on.
 */

import { useEffect, useState } from 'react';

const REDUCE = '(prefers-reduced-motion: reduce)';

export function prefersStill(): boolean {
    return typeof window === 'undefined' || window.matchMedia(REDUCE).matches;
}

/**
 * A number that changes whenever the reduced-motion setting does. A scene's
 * effect lists it, so turning reduced motion on mid-session stops the scene
 * and shows its still at once, not on the next page load.
 */
export function useMotionSetting(): number {
    const [n, setN] = useState(0);
    useEffect(() => {
        const m = window.matchMedia(REDUCE);
        const bump = () => setN((v) => v + 1);
        m.addEventListener('change', bump);
        return () => m.removeEventListener('change', bump);
    }, []);
    return n;
}

/** A mouse or trackpad that hovers: the only pointer a scene follows. */
export function finePointer(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(pointer: fine) and (hover: hover)').matches;
}

/**
 * Run `fn` when the main thread is idle, and within `timeout` ms whatever
 * happens, so first paint and the page's own work go first. Returns a cancel.
 */
export function whenIdle(fn: () => void, timeout = 1500): () => void {
    if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => fn(), { timeout });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(fn, Math.min(timeout, 300));
    return () => window.clearTimeout(id);
}

/**
 * Run `fn` when the main thread is idle, or at once if the scene in `el` has
 * drawn before (data-live): a scene coming back after a change of setting
 * should not wait for idle time to show its new state.
 */
export function whenReady(el: HTMLElement, fn: () => void): () => void {
    if (el.dataset.live === undefined) return whenIdle(fn);
    fn();
    return () => {};
}

/** Dark when the element sits in a `.dark` tree (next-themes puts the class on <html>). */
export function isDark(el: Element): boolean {
    return el.closest('.dark') !== null;
}

const themeListeners = new Set<() => void>();
let themeWatch: MutationObserver | null = null;

/**
 * Call `fn` when the theme class on <html> changes. One observer for every
 * scene, and none once the last one leaves. Returns an unsubscribe.
 */
export function onTheme(fn: () => void): () => void {
    themeListeners.add(fn);
    if (!themeWatch && typeof MutationObserver !== 'undefined') {
        themeWatch = new MutationObserver(() => themeListeners.forEach((f) => f()));
        themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    return () => {
        themeListeners.delete(fn);
        if (!themeListeners.size) {
            themeWatch?.disconnect();
            themeWatch = null;
        }
    };
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (v: number) => {
    const k = clamp01(v);
    return k * k * (3 - 2 * k);
};

/**
 * cubic-bezier(x1, y1, x2, y2) as a function of progress, for the brand's two
 * curves. Solved once into a table, so a frame of thousands of dots reads it
 * rather than solving it per dot.
 */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const x = (s: number) => ((ax * s + bx) * s + cx) * s;
    const y = (s: number) => ((ay * s + by) * s + cy) * s;
    const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
    const solve = (t: number) => {
        let s = t;
        for (let i = 0; i < 8; i++) {
            const d = dx(s);
            if (Math.abs(d) < 1e-6) break;
            s -= (x(s) - t) / d;
        }
        return y(clamp01(s));
    };
    const N = 512;
    const table = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) table[i] = solve(i / N);
    return (t) => {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const f = t * N;
        const i = f | 0;
        return table[i]! + (table[i + 1]! - table[i]!) * (f - i);
    };
}

/** The brand's ease-out, cubic-bezier(.16, 1, .3, 1): things arrive and settle. */
export const easeOut = bezier(0.16, 1, 0.3, 1);
/** The brand's glide, cubic-bezier(.65, 0, .35, 1): things travel. */
export const glide = bezier(0.65, 0, 0.35, 1);

/** A seeded generator, so a scene draws the same picture on every load. */
export function seeded(seed: number): () => number {
    let s = seed >>> 0 || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}
