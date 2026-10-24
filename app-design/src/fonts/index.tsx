/*
 * The fonts the first screen paints in, at the stylesheet's own address.
 * `new URL(…, import.meta.url)` is how a bundler emits a file and gives its
 * address: the same file, the same hashed address the CSS has.
 */

/**
 * Vercel's skew protection makes Next add `?dpl=<deployment>` to every asset
 * the stylesheet names; a preload without it is a second, unused fetch. Next
 * defines NEXT_DEPLOYMENT_ID for the build whenever it adds the query.
 */
function deployment(): string {
    try {
        const id = process.env.NEXT_DEPLOYMENT_ID;
        return id ? `?dpl=${id}` : '';
    } catch {
        return '';
    }
}

export const FONT_FILES = {
    sans: new URL('./styles/fonts/inter-latin.woff2', import.meta.url).href + deployment(),
    mono: new URL('./styles/fonts/jetbrains-mono-latin.woff2', import.meta.url).href + deployment(),
} as const;

/**
 * Renders nothing since 1.20.0, and stays so no site's _document breaks. The
 * preload cost first paint 118 to 162 ms on four sites (paired runs, 23 of
 * 23), and without it the font swap shifts nothing: CLS stayed at or under
 * 0.0001 on 28 of 29 pages across the 15 sites that rendered it.
 */
export function FontPreloads(_props: { mono?: boolean }) {
    return null;
}
