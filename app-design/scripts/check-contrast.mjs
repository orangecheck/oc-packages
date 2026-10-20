#!/usr/bin/env node
/*
 * Every text token in ochk.app clears WCAG AA against the surfaces it sits on,
 * in light and in dark. Reads the values from src/styles/tokens.css itself, so
 * a token edited there is checked here. Display accent is held to 3:1 (it is
 * only used at display sizes); everything else to 4.5:1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8');

function block(selectorStart) {
    const i = css.indexOf(selectorStart);
    if (i < 0) throw new Error(`no block starting ${selectorStart}`);
    const open = css.indexOf('{', i);
    const close = css.indexOf('}', open);
    const vars = {};
    for (const m of css.slice(open + 1, close).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) {
        vars[m[1]] = m[2].toLowerCase();
    }
    return vars;
}

const light = block(":root[data-oc-app='ochk'],");
const dark = { ...light, ...block(":root.dark[data-oc-app='ochk'],") };

function lum(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

// [text token, surface token, minimum]
const PAIRS = [
    ['foreground', 'background', 4.5],
    ['foreground', 'card', 4.5],
    ['muted-foreground', 'background', 4.5],
    ['muted-foreground', 'card', 4.5],
    ['muted-foreground', 'muted', 4.5],
    // A chosen ChoiceCard: its title, its line, its icon (a glyph, 3:1).
    ['foreground', 'accent', 4.5],
    ['muted-foreground', 'accent', 4.5],
    ['oca-accent-ink', 'accent', 3],
    ['oca-subtle-foreground', 'background', 4.5],
    ['oca-subtle-foreground', 'card', 4.5],
    ['card-foreground', 'card', 4.5],
    ['popover-foreground', 'popover', 4.5],
    ['primary-foreground', 'primary', 4.5],
    ['brand-foreground', 'brand', 4.5],
    ['oca-accent-ink', 'background', 4.5],
    ['oca-accent-ink', 'card', 4.5],
    ['oca-accent-display', 'background', 3],
    ['oca-accent-display', 'card', 3],
    ['destructive', 'card', 4.5],
    ['success', 'card', 4.5],
    ['warning', 'card', 4.5],
    ['info', 'card', 4.5],
    ['destructive-foreground', 'destructive', 4.5],
    // The dark surfaces, dark in both modes.
    ['oca-ink-foreground', 'oca-ink', 4.5],
    ['oca-ink-muted', 'oca-ink', 4.5],
    ['oca-ink-muted', 'oca-ink-card', 4.5],
    ['oca-ink-subtle', 'oca-ink-card', 4.5],
    ['oca-ink-title', 'oca-ink-card', 4.5],
    ['oca-ink-eyebrow', 'oca-ink', 4.5],
    ['oca-code-package', 'oca-ink-card', 4.5],
    ['oca-code-tag', 'oca-ink-card', 4.5],
    ['oca-code-link', 'oca-ink-card', 4.5],
    ['oca-ink-muted', 'oca-code-surface', 4.5],
    ['oca-ink-subtle', 'oca-code-surface', 4.5],
    ['oca-code-package', 'oca-code-surface', 4.5],
    ['oca-code-tag', 'oca-code-surface', 4.5],
    ['oca-code-link', 'oca-code-surface', 4.5],
    // Syntax: every token on the well, on the dark card, and on each marked line.
    ...['keyword', 'string', 'number', 'function', 'type', 'property', 'comment', 'punctuation', 'added', 'removed'].flatMap(
        (t) =>
            ['oca-code-surface', 'oca-ink-card', 'oca-code-mark', 'oca-code-added-line', 'oca-code-removed-line'].map(
                (bg) => [`oca-code-${t}`, bg, 4.5]
            )
    ),
    ['oca-ink-muted', 'oca-code-mark', 4.5],
    ['oca-ink-muted', 'oca-code-added-line', 4.5],
    ['oca-ink-muted', 'oca-code-removed-line', 4.5],
    ['secondary-foreground', 'secondary', 4.5],
    // Non-text: a field's border against the card it sits on (WCAG 1.4.11).
    ['input', 'card', 3],
    ['input', 'background', 3],
    // The focus ring, wherever a focused control sits.
    ['ring', 'background', 3],
    ['ring', 'card', 3],
    // A checked Switch: the track against the card, and the white thumb on the track.
    ['oca-orange-deep', 'card', 3],
    ['oca-orange-deep', 'background', 3],
    ['oca-ink-foreground', 'oca-orange-deep', 3],
    // Chart series and their neutral: graphical objects on the card and the page (1.4.11).
    ...['oca-chart-1', 'oca-chart-2', 'oca-chart-3', 'oca-chart-4', 'oca-chart-neutral'].flatMap((t) => [
        [t, 'card', 3],
        [t, 'background', 3],
    ]),
    // A Meter's fill with a verdict, against its track.
    ['success', 'muted', 3],
    ['warning', 'muted', 3],
    ['destructive', 'muted', 3],
];

let failed = 0;
for (const [mode, vars] of [
    ['light', light],
    ['dark', dark],
]) {
    for (const [fg, bg, min] of PAIRS) {
        if (!vars[fg] || !vars[bg]) {
            console.error(`✗ ${mode}: missing --${!vars[fg] ? fg : bg}`);
            failed++;
            continue;
        }
        const r = ratio(vars[fg], vars[bg]);
        if (r < min) {
            console.error(`✗ ${mode}: --${fg} ${vars[fg]} on --${bg} ${vars[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`);
            failed++;
        }
    }
}
// The chart series as a set: every pair must stay apart, in normal vision and
// as deuteranopia and protanopia see them (Machado et al. 2009, severity 1), by
// at least 0.1 in OKLab. One by one, two colours can each pass and still read
// as the same line.
const toLinear = (hex) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const DEUTAN = [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]];
const PROTAN = [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]];
const seenAs = (rgb, m) => m.map((row) => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
function oklab([r, g, b]) {
    const [l, m, s] = [
        0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
        0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
        0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
    ].map((x) => Math.cbrt(Math.max(0, x)));
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const SERIES = ['oca-chart-1', 'oca-chart-2', 'oca-chart-3', 'oca-chart-4', 'oca-chart-neutral'];
for (const [mode, vars] of [
    ['light', light],
    ['dark', dark],
]) {
    const views = SERIES.map((t) => {
        const rgb = toLinear(vars[t]);
        return [oklab(rgb), oklab(seenAs(rgb, DEUTAN)), oklab(seenAs(rgb, PROTAN))];
    });
    for (let i = 0; i < SERIES.length; i++) {
        for (let j = i + 1; j < SERIES.length; j++) {
            const apart = Math.min(...[0, 1, 2].map((k) => Math.hypot(...views[i][k].map((v, n) => v - views[j][k][n]))));
            if (apart < 0.1) {
                console.error(`✗ ${mode}: --${SERIES[i]} and --${SERIES[j]} are ${apart.toFixed(3)} apart, needs 0.1 in every view`);
                failed++;
            }
        }
    }
}

// HudCard's text over a scene: the card is the background at 85%, so the worst
// scene behind it is black in light mode and white in dark. Its text must
// still clear 4.5:1 there. Keep HUD_ALPHA equal to the bg-background/85 class.
const HUD_ALPHA = 0.85;
for (const [mode, vars, behind] of [
    ['light', light, '#000000'],
    ['dark', dark, '#ffffff'],
]) {
    const mix = (a, b) =>
        '#' + [1, 3, 5].map((i) => Math.round(HUD_ALPHA * parseInt(a.slice(i, i + 2), 16) + (1 - HUD_ALPHA) * parseInt(b.slice(i, i + 2), 16)).toString(16).padStart(2, '0')).join('');
    const card = mix(vars.background, behind);
    for (const t of ['foreground', 'muted-foreground']) {
        const r = ratio(vars[t], card);
        if (r < 4.5) {
            console.error(`✗ ${mode}: HudCard --${t} over the worst scene is ${r.toFixed(2)}:1, needs 4.5:1`);
            failed++;
        }
    }
}

// Avatar: initials on a person's tint, at every hue the seed can pick, in both modes.
{
    const pct = (block, name) => Number(block.match(new RegExp(`--${name}:\\s*([\\d.]+)%`))?.[1]);
    const lightBlock = css.slice(css.indexOf(":root[data-oc-app='ochk'],"), css.indexOf(":root.dark[data-oc-app='ochk'],"));
    const darkBlock = css.slice(css.indexOf(":root.dark[data-oc-app='ochk'],"));
    const hsl = (h, s, l) => {
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
            const k = (n + h / 30) % 12;
            return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
        };
        return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
    };
    for (const [mode, block] of [
        ['light', lightBlock],
        ['dark', darkBlock],
    ]) {
        const bgL = pct(block, 'oca-avatar-bg-l');
        const fgL = pct(block, 'oca-avatar-fg-l');
        if (!(bgL >= 0 && fgL >= 0)) {
            console.error(`✗ contrast: ${mode}: the avatar lightness tokens are missing`);
            failed++;
            continue;
        }
        let worst = { r: Infinity, h: 0 };
        for (let h = 0; h < 360; h++) {
            const r = ratio(hsl(h, 0.45, fgL / 100), hsl(h, 0.6, bgL / 100));
            if (r < worst.r) worst = { r, h };
        }
        if (worst.r < 4.5) {
            console.error(`✗ contrast: ${mode}: avatar initials at hue ${worst.h} are ${worst.r.toFixed(2)}:1, under 4.5`);
            failed++;
        }
    }
}

if (failed) {
    console.error(`\n${failed} contrast failure(s)`);
    process.exit(1);
}
console.log(`✓ contrast: ${PAIRS.length} pairs × light, dark; the chart series stay apart; HUD text over any scene; avatar initials at every hue`);
