/*
 * The fonts the first screen paints in, for a preload. The stylesheet names
 * them too, but a browser finds them only after it has read the CSS, so text
 * paints late. `new URL(…, import.meta.url)` is how a bundler emits a file
 * and gives its address: the same file, the same hashed address the CSS has.
 *
 *     <Head><FontPreloads /></Head>   (in pages/_document)
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

/** Preload Inter (Latin), and JetBrains Mono too with `mono` for a page that opens on code. */
export function FontPreloads({ mono = false }: { mono?: boolean }) {
    return (
        <>
            <link rel="preload" as="font" type="font/woff2" href={FONT_FILES.sans} crossOrigin="anonymous" />
            {mono ? <link rel="preload" as="font" type="font/woff2" href={FONT_FILES.mono} crossOrigin="anonymous" /> : null}
        </>
    );
}
