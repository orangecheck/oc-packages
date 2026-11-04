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
// Without its comments, so a brace in one cannot end a block early.
const css = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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
    // A highlighted menu item's inset ring. On the orange band the ring is brand-foreground (above).
    ['ring', 'popover', 3],
    ['ring', 'accent', 3],
    // A checked Switch: the track against the card, and the white thumb on the track.
    ['oca-orange-deep', 'card', 3],
    ['oca-orange-deep', 'background', 3],
    ['oca-ink-foreground', 'oca-orange-deep', 3],
    // A Slider on ink: its fill and thumb; and orange figures on ink (display size, 3:1).
    ['oca-orange', 'oca-ink', 3],
    // The blocks: a figure in the display accent on ink and on the product surface, a receipt's split on the surface.
    ['oca-accent-display', 'oca-ink', 3],
    ['oca-accent-display', 'oca-surface', 3],
    ['oca-orange-deep', 'oca-surface', 3],
    // Chart series and their neutral: graphical objects on the card and the page (1.4.11).
    ...['oca-chart-1', 'oca-chart-2', 'oca-chart-3', 'oca-chart-4', 'oca-chart-neutral'].flatMap((t) => [
        [t, 'card', 3],
        [t, 'background', 3],
    ]),
    // A Meter's fill with a verdict, against its track.
    ['success', 'muted', 3],
    ['warning', 'muted', 3],
    ['destructive', 'muted', 3],
    // 2.0: the product surface (inputs, tables, receipts, mock screens).
    ['oca-surface-foreground', 'oca-surface', 4.5],
    // A block's secondary text on the surface, and on a paper bento tile.
    ['oca-surface-muted', 'oca-surface', 4.5],
    ['oca-surface-muted', 'card', 4.5],
    ['muted-foreground', 'oca-surface', 4.5],
    ['oca-subtle-foreground', 'oca-surface', 4.5],
    ['oca-accent-ink', 'oca-surface', 4.5],
    ['input', 'oca-surface', 3],
    ['ring', 'oca-surface', 3],
    // Text on the sunken ground, and small orange text and display ember on it.
    ['foreground', 'muted', 4.5],
    ['oca-subtle-foreground', 'muted', 4.5],
    ['oca-accent-ink', 'muted', 4.5],
    ['oca-accent-display', 'muted', 3],
    // The CTA's hover keeps its white text; a filled control's ring is ink.
    ['primary-foreground', 'oca-primary-hover', 4.5],
    ['oca-ring-on-fill', 'primary', 3],
    ['oca-ring-on-fill', 'brand', 3],
    ['oca-ring-on-fill', 'oca-footer', 3],
    // The bands: burnt (paper text, orange, ember, a muted line), ink, and the deep footer.
    ['oca-burnt-foreground', 'oca-burnt', 4.5],
    ['oca-burnt-muted', 'oca-burnt', 4.5],
    ['oca-burnt-accent', 'oca-burnt', 4.5],
    ['oca-burnt-ember', 'oca-burnt', 4.5],
    ['oca-ink-subtle', 'oca-ink', 4.5],
    ['oca-footer-foreground', 'oca-footer', 4.5],
    ['oca-footer-muted', 'oca-footer', 4.5],
    // Button onInk: ink text on its white fill (bg-white, the same white as primary-foreground).
    ['oca-ink', 'primary-foreground', 4.5],
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

// HudCard's text over a scene: the card is the background at 90%, so the worst
// scene behind it is black in light mode and white in dark. Its text must
// still clear 4.5:1 there. Keep HUD_ALPHA equal to the bg-background/90 class.
// (85% left soft text at 4.17:1 on 2.0's paper.)
const HUD_ALPHA = 0.9;
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

// The bands (theme.css oca-band-*) and the Card tones on the same grounds: each
// re-points the text tokens for what sits on it (oca-on-*), a Button's included.
// Every text token it names clears 4.5:1 on its ground and its ring 3:1, in light
// and dark, so an outline button on the orange band can't be drawn in paper again.
{
    const theme = readFileSync(join(here, '../src/styles/theme.css'), 'utf8');
    const utilities = Object.fromEntries([...theme.matchAll(/@utility (oca-(?:band|on)-[a-z]+) \{([^}]*)\}/g)].map((m) => [m[1], m[2]]));
    // A band's own block with the oca-on-* it applies.
    const resolved = (body) => body + [...body.matchAll(/@apply ([a-z0-9- ]+);/g)].flatMap((m) => m[1].split(/\s+/)).map((u) => utilities[u] ?? '').join('\n');
    const bands = Object.entries(utilities)
        .filter(([name]) => name.startsWith('oca-band-'))
        .map(([name, body]) => [name, resolved(body)]);
    if (bands.length < 4) {
        console.error(`✗ contrast: only ${bands.length} oca-band-* utilities in theme.css`);
        failed++;
    }
    // Card tones off the page's own grounds: each names its ground and an oca-on-* for what sits on it.
    const card = readFileSync(join(here, '../src/primitives/card.tsx'), 'utf8');
    const cardTones = ['ink', 'burnt', 'brand'].map((t) => {
        const cls = card.match(new RegExp(`\\b${t}: '([^']*)'`))?.[1] ?? '';
        const on = cls.match(/\boca-on-([a-z]+)/)?.[1];
        const ground = cls.match(/\bbg-((?:oca-)?[a-z0-9-]+)/)?.[1];
        if (!on) {
            console.error(`✗ contrast: Card tone="${t}" sets its ground but no oca-on-*: a MonoLabel or muted line in it reads in the page's colours`);
            failed++;
        }
        return [`Card tone="${t}"`, `background-color: var(--${ground});\n${on ? utilities[`oca-on-${on}`] ?? '' : ''}`];
    });
    for (const [name, body] of [...bands, ...cardTones]) {
        const ground = body.match(/background-color:\s*var\(--([a-z0-9-]+)\)/)?.[1];
        const texts = [...body.matchAll(/(?:^|\s)(color|--foreground|--muted-foreground|--oca-subtle-foreground):\s*var\(--([a-z0-9-]+)\)/g)].map((m) => [m[1], m[2], 4.5]);
        // Each re-points what a kit control raises on it: each raised ground with its own text,
        // and the band's text on it too (a card's line in muted-foreground, a hover's label).
        const set = Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)].map((m) => [m[1], m[2]]));
        const raised = [
            ['--card', ['--card-foreground', '--foreground', '--muted-foreground']],
            ['--oca-surface', ['--oca-surface-foreground', '--muted-foreground']],
            ['--muted', ['--foreground', '--muted-foreground']],
            ['--secondary', ['--secondary-foreground']],
            ['--accent', ['--accent-foreground', '--foreground']],
        ];
        for (const [g] of raised) {
            if (!set[g]) {
                console.error(`✗ contrast: ${name} leaves ${g} alone: a kit control raised on it draws the page's ground under the band's text`);
                failed++;
            }
        }
        const ring = body.match(/--ring:\s*var\(--([a-z0-9-]+)\)/)?.[1];
        if (ring) texts.push(['--ring', ring, 3]);
        // A field's edge, and a drawn window's, on the band (1.4.11).
        const input = body.match(/--input:\s*var\(--([a-z0-9-]+)\)/)?.[1];
        if (input) texts.push(['--input', input, 3]);
        // A band that leaves --foreground or --muted-foreground alone lets the page's
        // ink (or paper) through onto its ground: a Button's text among it.
        for (const must of ['--foreground', '--muted-foreground']) {
            if (!texts.some(([prop]) => prop === must)) {
                console.error(`✗ contrast: ${name} does not set ${must}`);
                failed++;
            }
        }
        if (name.startsWith('oca-band-') && !texts.some(([prop]) => prop === 'color')) {
            console.error(`✗ contrast: ${name} does not set color`);
            failed++;
        }
        for (const [mode, vars] of [
            ['light', light],
            ['dark', dark],
        ]) {
            for (const [g, fgs] of raised.filter(([g]) => set[g])) {
                for (const fg of fgs) {
                    const [bgT, fgT] = [set[g], set[fg]];
                    if (!fgT) continue;
                    const r = ratio(vars[fgT], vars[bgT]);
                    if (!(r >= 4.5)) {
                        console.error(`✗ ${mode}: ${name} ${fg} --${fgT} on its ${g} --${bgT} is ${r.toFixed(2)}:1, needs 4.5:1`);
                        failed++;
                    }
                }
            }
            for (const [prop, token, min] of texts) {
                if (!vars[ground] || !vars[token]) {
                    console.error(`✗ ${mode}: ${name} ${prop} --${token} on --${ground} has no colour`);
                    failed++;
                    continue;
                }
                const r = ratio(vars[token], vars[ground]);
                if (r < min) {
                    console.error(`✗ ${mode}: ${name} ${prop} --${token} ${vars[token]} on --${ground} ${vars[ground]} is ${r.toFixed(2)}:1, needs ${min}:1`);
                    failed++;
                }
            }
        }
    }
}

// A ground that holds text and is drawn on another one (a sunken panel, a drawn bubble, a cancel
// button in a toast) stays apart from every surface it sits on by at least the step light has
// always had between paper and its sunken ground (1.10:1). Its text is held to 4.5:1 above, so it
// cannot also reach 1.4.11's 3:1 against the surface; what identifies a control is held to 3:1
// there instead. In dark, --muted was #1c1916, the window's own colour: 1.00:1 on --oca-surface.
const FLOOR = 1.09;
for (const [mode, vars] of [
    ['light', light],
    ['dark', dark],
]) {
    // --muted on what it is drawn on; the ink band beside every page ground (in dark it was the window's colour).
    for (const [g, ons] of [
        ['muted', ['background', 'card', 'popover', 'oca-surface']],
        ['oca-ink', ['background', 'card', 'popover', 'oca-surface', 'muted']],
    ]) {
        for (const on of ons) {
            const r = ratio(vars[g], vars[on]);
            if (r < FLOOR) {
                console.error(`✗ ${mode}: --${g} ${vars[g]} on --${on} ${vars[on]} is ${r.toFixed(2)}:1, the same ground; needs ${FLOOR}:1 to read apart`);
                failed++;
            }
        }
    }
}

// What the components themselves put on each ground. The pairs above are the ones someone thought of;
// this reads every class string in the package's components (stories and tests aside) and checks what
// they name, on the page, in every band and in every Card tone, light and dark, each token resolved
// through the band's re-pointing as the browser would. A band that leaves a token alone lets the page's
// value through: small orange text on the ink band (oca-accent-ink, 2.51:1 in light) passed the band
// check above because oca-on-ink never named it.
// - A text with a ground in the same class string is checked on that ground (a badge's tint included:
//   a color-mix of two tokens, mixed in OKLab as the browser does).
// - A text named for its ground (card-foreground, oca-surface-muted, oca-ink-muted…) is checked on it.
// - The page's own text tokens, which follow whatever they sit on, are checked on the context's ground
//   and its card.
// - A mark drawn as a fill in one of those tokens (a status dot, a current-page square) is non-text:
//   3:1 on its ground.
// - A state shown by a fill (a selected tab, a pressed toggle, the current page, a highlighted menu
//   item) reads 3:1 against the ground it replaces, or draws an edge that does. A state chosen in
//   script, out of reach of a class variant, is held by check-layout's rendered state check.
// - Hidden from assistive tech (aria-hidden on the element) is drawing, not text, and fixed colours
//   (white, black) on translucent tints are left to the code well's pairs above.
const census = { strings: 0, pairs: 0 };
{
    const { readdirSync, statSync } = await import('node:fs');
    const theme = readFileSync(join(here, '../src/styles/theme.css'), 'utf8');
    const colorVar = Object.fromEntries([...theme.matchAll(/--color-([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)].map((m) => [m[1], m[2]]));
    const FIXED = { white: '#ffffff', black: '#000000' };
    const files = [];
    (function walk(d) {
        for (const f of readdirSync(d)) {
            const p = join(d, f);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx$/.test(f) && !/\.(stories|test)\.tsx$/.test(f)) files.push(p);
        }
    })(join(here, '../src'));
    const parse = (cls, kind) => {
        const m = cls.match(new RegExp(`^((?:[^\\s:]+:)*)${kind}-(.+)$`));
        if (!m) return null;
        const variant = m[1].replace(/:$/, '');
        let rest = m[2];
        let alpha = 1;
        const a = rest.match(/^(.*)\/(\d+)$/);
        if (a) [rest, alpha] = [a[1], Number(a[2]) / 100];
        const mix = rest.match(/^\[color-mix\(in_oklab,var\(--([a-z0-9-]+)\)_(\d+)%,var\(--([a-z0-9-]+)\)\)\]$/);
        if (mix) return { variant, mix: [mix[1], Number(mix[2]) / 100, mix[3]], alpha, name: `color-mix(${mix[1]} ${mix[2]}%, ${mix[3]})` };
        if (FIXED[rest]) return { variant, hex: FIXED[rest], alpha, name: rest };
        if (/^\[#[0-9a-f]{6}\]$/i.test(rest)) return { variant, hex: rest.slice(1, -1).toLowerCase(), alpha, name: rest.slice(1, -1) };
        if (colorVar[rest]) return { variant, token: colorVar[rest], alpha, name: `--${colorVar[rest]}${alpha < 1 ? `/${a[2]}` : ''}` };
        return null;
    };
    const units = [];
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
            const str = m[1] ?? m[2] ?? m[3];
            if (!/\b(text|bg)-/.test(str)) continue;
            const tag = src.slice(src.lastIndexOf('<', m.index), m.index);
            if (/\baria-hidden\b/.test(tag) && !tag.includes('>')) continue;
            const cls = str.split(/\s+/).filter(Boolean);
            const texts = cls.map((c) => parse(c, 'text')).filter(Boolean);
            const grounds = cls.map((c) => parse(c, 'bg')).filter(Boolean);
            // An edge: a border or ring in a token, or an inset hairline drawn in one.
            const edges = [
                ...cls.flatMap((c) => [parse(c, 'border'), parse(c, 'ring')]).filter(Boolean),
                ...cls.flatMap((c) => {
                    const e = c.match(/^((?:[^\s:]+:)*)shadow-\[inset_[^\]]*var\(--([a-z0-9-]+)\)\]$/);
                    return e ? [{ variant: e[1].replace(/:$/, ''), token: e[2], alpha: 1, name: `--${e[2]}` }] : [];
                }),
            ];
            // A depiction's frame: a drawn window (rounded-depict) or a phone's bezel.
            const depiction = /(?<![\w-])rounded-depict(?![\w-])/.test(str) && grounds.length ? 'window' : /rounded-\[2\.9rem\]/.test(str) ? 'phone' : null;
            if (texts.length || grounds.length) units.push({ at: `${f.slice(join(here, '..').length + 1)}:${src.slice(0, m.index).split('\n').length}`, texts, grounds, edges, depiction });
        }
    }
    census.strings = units.length;
    // Checked boxes, radios and switches carry their state in a glyph or a thumb's place, not only in the fill.
    const STATE = /(^|:)(data-\[state=(active|on)\]|data-\[highlighted\]|aria-(selected|pressed)|aria-\[current=[a-z]+\])$/;
    const FOLLOWS = new Set(['foreground', 'muted-foreground', 'oca-subtle-foreground', 'oca-accent-ink', 'oca-accent-display', 'destructive', 'success', 'warning', 'info']);
    const home = (t) => {
        if (/^oca-ink-(foreground|muted|subtle|title|eyebrow)$/.test(t)) return ['oca-ink', 'oca-ink-card'];
        if (/^oca-burnt-(foreground|muted|accent|ember)$/.test(t)) return ['oca-burnt', 'oca-burnt-card'];
        if (/^oca-footer-(foreground|muted)$/.test(t)) return ['oca-footer'];
        if (/^oca-code-/.test(t)) return ['oca-code-surface', 'oca-ink-card'];
        if (t === 'oca-surface-muted') return ['oca-surface'];
        const g = t.match(/^(.+)-foreground$/)?.[1];
        return g && g !== 'muted' && g !== 'oca-subtle' && dark[g] ? [g] : null;
    };
    // The page, every band (its own block with the oca-on-* it applies) and every Card tone off the page's grounds.
    const utilities = Object.fromEntries([...theme.matchAll(/@utility (oca-(?:band|on)-[a-z]+) \{([^}]*)\}/g)].map((m) => [m[1], m[2]]));
    const pointed = (body) => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g)].map((m) => [m[1], m[2]]));
    const contexts = [['the page', {}, 'background']];
    for (const [name, body] of Object.entries(utilities).filter(([n]) => n.startsWith('oca-band-'))) {
        const full = body + [...body.matchAll(/@apply ([a-z0-9- ]+);/g)].flatMap((m) => m[1].split(/\s+/)).map((u) => utilities[u] ?? '').join('\n');
        contexts.push([name, pointed(full), full.match(/background-color:\s*var\(--([a-z0-9-]+)\)/)[1]]);
    }
    const cardSrc = readFileSync(join(here, '../src/primitives/card.tsx'), 'utf8');
    for (const t of ['ink', 'burnt', 'brand']) {
        const cls = cardSrc.match(new RegExp(`\\b${t}: '([^']*)'`))?.[1] ?? '';
        const on = cls.match(/\boca-on-([a-z]+)/)?.[1];
        const bg = cls.match(/\bbg-((?:oca-)?[a-z0-9-]+)/)?.[1];
        contexts.push([`Card tone="${t}"`, on ? pointed(utilities[`oca-on-${on}`] ?? '') : {}, colorVar[bg] ?? bg]);
    }
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const hex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
    const over = (top, a, under) => hex(rgb(top).map((v, i) => a * v + (1 - a) * rgb(under)[i]));
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
    const toLab = (h) => oklab(rgb(h).map((v) => lin(v / 255)));
    const mixLab = (a, p, b) => {
        const [A, B] = [toLab(a), toLab(b)];
        const [L, x, y] = A.map((v, i) => p * v + (1 - p) * B[i]);
        const [l, m, s] = [L + 0.3963377774 * x + 0.2158037573 * y, L - 0.1055613458 * x - 0.0638541728 * y, L - 0.0894841775 * x - 1.291485548 * y].map((v) => v ** 3);
        return hex([4.0767416621 * l - 3.3077085212 * m + 0.2309667373 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960771 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => 255 * gamma(Math.min(1, Math.max(0, v)))));
    };
    const seen = new Set();
    for (const [ctx, set, base] of contexts) {
        for (const [mode, vars] of [
            ['light', light],
            ['dark', dark],
        ]) {
            const value = (t) => vars[set[t] ?? t];
            const paint = (x, under) => {
                const c = x.hex ?? (x.mix ? mixLab(value(x.mix[0]), x.mix[1], value(x.mix[2])) : value(x.token));
                return c && x.alpha < 1 ? over(c, x.alpha, under) : c;
            };
            const around = [base, set.card ?? 'card'].map((g) => [`--${g}`, value(g)]);
            const fail = (what, r, min, at) => {
                const key = `${ctx} ${mode}: ${what}`;
                if (seen.has(key)) return;
                seen.add(key);
                console.error(`✗ ${mode}: in ${ctx}, ${what} is ${r.toFixed(2)}:1, needs ${min}:1 (${at})`);
                failed++;
            };
            for (const u of units) {
                // A depicted window or device against the page it is drawn on (1.4.11, by the lead's ruling on
                // depictions): its fill reads 3:1 on that ground, or an edge in a token does. A paper window was
                // white on paper with only a shadow; the default one a hairline at 1.3:1.
                if (u.depiction) {
                    for (const [name, under] of around) {
                        const fill = u.grounds.filter((g) => g.variant === '' || (g.variant === 'dark' && mode === 'dark')).map((g) => paint(g, under)).at(-1);
                        if (!fill || !under) continue;
                        census.pairs++;
                        if (ratio(fill, under) >= 3) continue;
                        const edges = u.edges.filter((e) => e.variant === '' || (e.variant === 'dark' && mode === 'dark')).map((e) => paint(e, fill));
                        const best = Math.max(0, ...edges.filter(Boolean).map((c) => Math.min(ratio(c, under), 3.01)));
                        if (best < 3) fail(`a depiction (${u.depiction}, ${u.at}) on ${name}, fill and edge`, best || ratio(fill, under), 3, u.at);
                    }
                }
                // A state shown by a fill (a selected tab, a checked choice): the fill reads 3:1 against the
                // ground it replaces, or the state also draws an edge that does (1.4.11). A selected segment
                // in card on the muted list was 1.18:1 with nothing else but its text.
                for (const g of u.grounds.filter((x) => STATE.test(x.variant) && !/(^|:)(before|after)$/.test(x.variant))) {
                    // A highlighted item lives in a menu or a select's list, portalled to the page's body: never in a band.
                    if (/data-\[highlighted\]/.test(g.variant) && ctx !== 'the page') continue;
                    const was = u.grounds.find((x) => x.variant === '');
                    const under = was ? paint(was, value(base)) : value(base);
                    const fill = paint(g, under);
                    if (!fill || !under) continue;
                    census.pairs++;
                    if (ratio(fill, under) >= 3) continue;
                    const edge = u.edges.filter((e) => e.variant === g.variant && e.token).map((e) => [e.name, paint(e, fill)]);
                    if (!edge.some(([, c]) => c && ratio(c, fill) >= 3 && ratio(c, under) >= 3)) {
                        fail(`a ${g.variant} fill ${g.name} on ${was ? was.name : `--${base}`} with no edge at 3:1`, ratio(fill, under), 3, u.at);
                    }
                }
                for (const v of new Set([...u.texts, ...u.grounds].map((x) => x.variant))) {
                    if (/disabled/.test(v) || (/(^|:)dark(:|$)/.test(v) && mode === 'light')) continue;
                    const mark = /(^|:)(before|after)$/.test(v);
                    const of = (list) => list.filter((x) => x.variant === v);
                    const own = (of(u.grounds).length && !mark ? of(u.grounds) : u.grounds.filter((x) => x.variant === '')).filter((g) => !(g.alpha < 1 && u.texts.some((t) => t.hex)));
                    const owned = own.map((g) => [g.name, paint(g, value(base))]);
                    if (mark) {
                        // Only a mark in a colour that follows its ground: a fixed one (the code well's orange tab line) sits on its own well.
                        for (const g of of(u.grounds).filter((x) => FOLLOWS.has(x.token))) {
                            for (const [name, under] of owned.length ? owned : around) {
                                const c = paint(g, under);
                                if (!c || !under) continue;
                                census.pairs++;
                                const r = ratio(c, under);
                                if (r < 3) fail(`a ${g.name} mark on ${name}`, r, 3, u.at);
                            }
                        }
                        continue;
                    }
                    for (const t of of(u.texts).length ? of(u.texts) : u.texts.filter((x) => x.variant === '')) {
                        if (t.hex && !owned.length) continue;
                        const homes = t.token && home(t.token);
                        const on = owned.length ? owned : homes ? homes.map((g) => [`--${g}`, value(g)]) : FOLLOWS.has(t.token) ? around : [];
                        for (const [name, under] of on) {
                            const c = under && paint(t, under);
                            if (!c) continue;
                            census.pairs++;
                            const min = t.token === 'oca-accent-display' ? 3 : 4.5;
                            const r = ratio(c, under);
                            if (r < min) fail(`text ${t.name} on ${name}`, r, min, u.at);
                        }
                    }
                }
            }
        }
    }
}

if (failed) {
    console.error(`\n${failed} contrast failure(s)`);
    process.exit(1);
}
console.log(`✓ contrast: ${PAIRS.length} pairs × light, dark; --muted and the ink band apart from every surface; ${census.pairs} pairs from ${census.strings} component class strings on the page, every band and Card tone; every band's and dark Card tone's text and ring on its ground; the chart series stay apart; HUD text over any scene; avatar initials at every hue`);
