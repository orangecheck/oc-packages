/*
 * Browser APIs a test DOM (vitest's jsdom) or an old engine may lack. A
 * missing one reads as the quiet answer: no match for a media query (so no
 * motion preference is assumed and a scheme listener is skipped), still for
 * reduced motion, and in view and visible for observers.
 */

/** True when the query matches; false where matchMedia is missing. */
export function mediaMatches(query: string): boolean {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Reduced motion, read as true where it cannot be asked: missing means still. */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
