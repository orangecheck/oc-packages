/*
 * The ochk.app palette as data, for places CSS variables cannot reach: OG
 * images, canvas, charts, email. Must match styles/tokens.css; the contrast
 * check reads both.
 */
export const APP_ATTRIBUTE = 'data-oc-app';
export const APP_ID = 'ochk';

export const appColors = {
    light: {
        background: '#FAFAFA',
        foreground: '#0A0A0A',
        card: '#FFFFFF',
        muted: '#F2F2F2',
        mutedForeground: '#54585E',
        subtleForeground: '#686C72',
        border: '#ECECEC',
        hairlineStrong: '#DADADA',
        accentDisplay: '#F55819',
        accentInk: '#C73F09',
    },
    dark: {
        background: '#0A0A0A',
        foreground: '#FAFAFA',
        card: '#161616',
        muted: '#1E1E1E',
        mutedForeground: '#A3A6AA',
        subtleForeground: '#8B8E93',
        border: '#262626',
        hairlineStrong: '#333333',
        accentDisplay: '#F66D36',
        accentInk: '#F0835A',
    },
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
