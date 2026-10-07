// check-token-contrast — every text token clears WCAG AA (4.5:1) in every skin × mode.
//
// Reads the theme CSS directly, so it gates the code rather than a deploy. Pairs:
//   - foreground / muted-foreground on background, card and muted
//   - primary and the four status tokens as text on background, card and their
//     own 12% tint (the pill / callout surface)
//   - every *-foreground on its fill (buttons, badges, the brand band)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles', 'themes');
const MIN = 4.5;

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklchToRgb([L, C, H]) {
    const h = (H * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((v) => Math.round(Math.min(1, Math.max(0, fromLin(v))) * 255));
}
const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => toLin(v / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const mix = (a, b, t) => a.map((x, i) => Math.round(x * t + b[i] * (1 - t)));
const parse = (v) => {
    const m = v.match(/oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
    return m ? oklchToRgb([m[2] ? +m[1] / 100 : +m[1], +m[3], +m[4]]) : null;
};

// The first light and first dark block that declare --background are the skin's tokens.
function tokens(css) {
    const out = { light: {}, dark: {} };
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/--background\s*:/.test(m[2])) continue;
        const mode = /\.dark/.test(m[1]) ? 'dark' : 'light';
        for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
            const rgb = parse(d[2]);
            if (rgb) out[mode][d[1].slice(2)] ??= rgb;
        }
    }
    return out;
}

const NEUTRAL = ['foreground', 'muted-foreground'];
const COLORED = ['primary', 'destructive', 'success', 'warning', 'info'];
const FILLS = ['primary', 'destructive', 'success', 'warning', 'info', 'secondary', 'accent', 'brand'];

const fails = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
    const skin = file.replace('.css', '');
    for (const [mode, t] of Object.entries(tokens(readFileSync(path.join(dir, file), 'utf8')))) {
        const check = (fg, bg, label) => {
            if (!fg || !bg) return;
            const r = ratio(fg, bg);
            if (r < MIN) fails.push(`${skin} ${mode}: ${label} ${r.toFixed(2)}:1`);
        };
        for (const fg of NEUTRAL)
            for (const bg of ['background', 'card', 'muted']) check(t[fg], t[bg], `${fg} on ${bg}`);
        for (const fg of COLORED) {
            for (const bg of ['background', 'card']) check(t[fg], t[bg], `${fg} on ${bg}`);
            if (t[fg]) check(t[fg], mix(t[fg], t.background, 0.12), `${fg} on its 12% tint`);
        }
        for (const fill of FILLS) check(t[`${fill}-foreground`], t[fill], `${fill}-foreground on ${fill}`);
    }
}

if (fails.length) {
    console.error(`token-contrast (min ${MIN}:1):\n  ` + fails.join('\n  '));
    process.exit(1);
}
console.log('token-contrast: ok');
