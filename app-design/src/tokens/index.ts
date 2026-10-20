/*
 * The palette as data, for places CSS variables cannot reach: OG images,
 * canvas and WebGL, charts, email. Light and dark are generated from
 * styles/tokens.css; scripts/check-mirror.mjs fails the build when the
 * generated file or a brand value drifts.
 */
import { darkPalette, lightPalette } from './palette';

export { darkPalette, lightPalette } from './palette';

export const APP_ATTRIBUTE = 'data-oc-app';
export const APP_ID = 'ochk';

export const appColors = {
    /** Every colour token, generated from tokens.css (palette.ts): the chart series, code, ink and status colours too. */
    light: lightPalette,
    dark: darkPalette,
    brand: {
        orange: '#F66D36',
        orangeLight: '#FB933C',
        orangeDeep: '#EA580B',
        peach: '#FED8AB',
        ink: '#0A0A0A',
        inkCard: '#1E1E1E',
    },
} as const;

export const appFonts = {
    sans: "'OCA Inter', 'OCA Inter Fallback', ui-sans-serif, system-ui, sans-serif",
    mono: "'OCA JetBrains Mono', 'OCA JetBrains Mono Fallback', ui-monospace, monospace",
} as const;
