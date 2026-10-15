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
