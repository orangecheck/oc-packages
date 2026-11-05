import { THEME_COLOR } from '@orangecheck/app-design/tokens';
import type { ReactElement } from 'react';

/**
 * The browser's theme colour in light and dark, for a site's _document `<Head>`:
 * app-design's THEME_COLOR, the page's ground (--background) generated from
 * tokens.css with the CSS variables, so no site types its own hex.
 *
 *     <Head><ThemeColorMeta /></Head>
 */
export function ThemeColorMeta(): ReactElement {
    return (
        <>
            <meta name="theme-color" media="(prefers-color-scheme: light)" content={THEME_COLOR.light} />
            <meta name="theme-color" media="(prefers-color-scheme: dark)" content={THEME_COLOR.dark} />
        </>
    );
}
