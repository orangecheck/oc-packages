/*
 * The palette as data, for places CSS variables cannot reach: OG images,
 * canvas and WebGL, charts, email. Light and dark are generated from
 * styles/tokens.css; scripts/check-mirror.mjs fails the build when the
 * generated file or a brand value drifts.
 */
import { darkPalette, lightPalette } from './palette';

export { darkPalette, lightPalette } from './palette';

/**
 * A document's `<meta name="theme-color">` in light and dark: the page's ground (--background),
 * read from the same generated palette as the CSS, so a site's _document need not type it.
 */
export const THEME_COLOR = { light: lightPalette.background, dark: darkPalette.background } as const;

export const APP_ATTRIBUTE = 'data-oc-app';
export const APP_ID = 'ochk';

export const appColors = {
    /** Every colour token, generated from tokens.css (palette.ts): the chart series, code, ink and status colours too. */
    light: lightPalette,
    dark: darkPalette,
    brand: {
        orange: '#F97316',
        orangeLight: '#FB923C',
        orangeDeep: '#C2410C',
        peach: '#FED8AB',
        ink: '#161412',
        inkCard: '#1C1916',
    },
} as const;

export const appFonts = {
    sans: "'OCA Inter', 'OCA Inter Fallback', ui-sans-serif, system-ui, sans-serif",
    mono: "'OCA JetBrains Mono', 'OCA JetBrains Mono Fallback', ui-monospace, monospace",
} as const;
