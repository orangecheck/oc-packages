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
if (failed) {
    console.error(`\n${failed} contrast failure(s)`);
    process.exit(1);
}
console.log(`✓ contrast: ${PAIRS.length} pairs × light, dark`);
