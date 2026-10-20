#!/usr/bin/env node
/*
 * styles/swagger.css keeps its promises. Swagger UI's method badges carry
 * white text at AA; the operation lock clears 3:1 and a parameter's small
 * print 4.5:1 on every method's tinted row, light and dark; on a phone each
 * of its small controls is a 44px target. Reads the stylesheet and tokens.css, so an edit to either is
 * checked here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../src/styles/swagger.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8');

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ swagger: ${msg}`);
        failures++;
    }
};

function tokenBlock(selectorStart) {
    const open = tokens.indexOf('{', tokens.indexOf(selectorStart));
    const vars = {};
    for (const m of tokens.slice(open + 1, tokens.indexOf('}', open)).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) vars[m[1]] = m[2].toLowerCase();
    return vars;
}
const light = tokenBlock(":root[data-oc-app='ochk'],");
const dark = { ...light, ...tokenBlock(":root.dark[data-oc-app='ochk'],") };

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};
const over = (top, alpha, under) => top.map((v, i) => v * alpha + under[i] * (1 - alpha));

/** Each rule's declarations, by selector, outside or inside the phone query. */
function rules(text) {
    const out = [];
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ selector: m[1].trim(), body: m[2] });
    return out;
}
const phone = (() => {
    const i = css.indexOf('@media (width < 48rem)');
    if (i < 0) return '';
    let depth = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) return css.slice(css.indexOf('{', i) + 1, j);
    }
    return '';
})();
const outside = css.replace(phone, '');

// Method badges: white text on each fill.
const badges = [...outside.matchAll(/\.opblock-(\w+) \.opblock-summary-method\s*\{\s*background:\s*(#[0-9a-f]{6})/gi)];
check(badges.length >= 6, `six method badges are restyled (found ${badges.length})`);
for (const [, method, fill] of badges) {
    const r = ratio(rgb('#ffffff'), rgb(fill));
    check(r >= 4.5, `${method.toUpperCase()} badge: white on ${fill} is ${r.toFixed(2)}:1, under 4.5`);
}

// Inks Swagger UI drew too faint: each takes a token, checked against every
// method's row (Swagger UI 5's own tints, 10% over the page), light and dark.
// The lock is a glyph (3:1), drawn at full opacity open or shut; the rest are text.
const TINTS = { get: '#61affe', post: '#49cc90', put: '#fca130', delete: '#f93e3e', patch: '#50e3c2', head: '#9012fe', options: '#0d5aa7' };
const INKS = [
    ['the lock', /\.authorization__btn svg$/, 'fill', 3],
    ['a parameter\'s place', /\.parameter__in$/, 'color', 4.5],
    ['"required"', /\.parameter__name\.required::after$/, 'color', 4.5],
    ['a required mark', /\.parameter__name\.required span$/, 'color', 4.5],
];
const outsideRules = rules(outside).flatMap((r) => r.selector.split(',').map((one) => ({ selector: one.trim(), body: r.body })));
for (const [name, selector, prop, min] of INKS) {
    const rule = outsideRules.find((r) => selector.test(r.selector) && r.selector.startsWith("[data-oc-app='ochk'] .swagger-ui"));
    const token = rule?.body.match(new RegExp(`${prop}:\\s*var\\(--([a-z0-9-]+)\\)`))?.[1];
    check(Boolean(token && light[token] && dark[token]), `${name} takes a token ${prop}`);
    if (prop === 'fill') check(/opacity:\s*1\s*;?/.test(rule?.body ?? ''), `${name} is drawn at full opacity, open or shut`);
    if (!token || !light[token]) continue;
    for (const [mode, t] of [
        ['light', light],
        ['dark', dark],
    ]) {
        for (const [method, tint] of Object.entries(TINTS)) {
            const r = ratio(rgb(t[token]), over(rgb(tint), 0.1, rgb(t.background)));
            check(r >= min, `${mode}: ${name} on a ${method.toUpperCase()} row is ${r.toFixed(2)}:1, under ${min}`);
        }
    }
}

// Phone targets.
const CONTROLS = ['.expand-operation', '.expand-methods', '.opblock-control-arrow', '.authorization__btn', '.models-control'];
const sized = rules(phone).filter((r) => /min-height:\s*44px/.test(r.body) && /min-width:\s*44px/.test(r.body));
for (const c of CONTROLS) {
    check(
        sized.some((r) => r.selector.includes(c) && r.selector.includes("[data-oc-app='ochk'] .swagger-ui")),
        `${c} is not a 44px target on a phone`
    );
}

if (failures) {
    console.error(`\n${failures} swagger failure(s)`);
    process.exit(1);
}
console.log(`✓ swagger: ${checks} checks; method badges, the lock and parameter inks in both modes, phone targets`);
