#!/usr/bin/env node
/*
 * ./vitest's scrollMargins, the scroll-margin rule a site's test runs on its own source: here it reads a
 * planted src directory. Each form of a scroll-margin is one finding, in a stylesheet as in a component or a
 * page; a scroll-padding is none; tests, specs and __tests__ are not read, and a finding names its file from
 * src's parent. Then what a site's Tailwind reads of the package (every path package.json ships) compiles to
 * no scroll-margin rule, while a planted class beside it does. Run after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { scrollMargins } = createRequire(import.meta.url)(join(root, pkg.exports['./vitest'].require));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ margins: ${msg}`);
        failures++;
    }
};

// Assembled here, so this file, which sits in the package Tailwind scans for its own checks, holds none of them.
const m = 'scroll-m';
const M = 'scrollM';
// Each form and the finding it gives: the match, a variant's prefix left out, as the sites' copies named them.
const FORMS = [
    [`${m}t-24`, `${m}t-24`],
    [`${m}y-4`, `${m}y-4`],
    [`${m}-2`, `${m}-2`],
    [`${m}s-3`, `${m}s-3`],
    [`lg:${m}t-[75px]`, `${m}t-[75px]`],
    [`${m}argin-top: 1rem`, `${m}argin-top:`],
    [`${m}argin-block-start: 1rem`, `${m}argin-block-start:`],
    [`el.style.${M}arginTop`, `${M}arginTop`],
    [`el.style.${M}argin`, `${M}argin`],
];
const NOT_MARGINS = [`${'scroll-p'}t-24`, `${'scroll-p'}adding-top: 4.5rem`, `el.style.${'scrollP'}addingTop`, `el.style.${M}`, 'scroll-smooth', 'overflow-y-scroll', 'scroll-auto'];

const dir = mkdtempSync(join(tmpdir(), 'app-design-margins-'));
try {
    const src = join(dir, 'src');
    const write = (name, text) => {
        mkdirSync(dirname(join(src, name)), { recursive: true });
        writeFileSync(join(src, name), text);
    };
    const one = (name, text) => {
        rmSync(src, { recursive: true, force: true });
        write(name, text);
        return scrollMargins(src);
    };
    for (const [f, finding] of FORMS) {
        const page = one('a.tsx', `export const A = () => <div className="p-2" data-x="${f}" />;\n`);
        check(JSON.stringify(page.margins) === JSON.stringify([`src/a.tsx: ${finding}`]), `${f} gives ${JSON.stringify(page.margins)}, not ["src/a.tsx: ${finding}"]`);
    }
    for (const f of NOT_MARGINS) {
        const page = one('a.tsx', `export const A = () => <div className="${f}" />;\n`);
        check(page.margins.length === 0, `${f} is no margin, yet gives ${JSON.stringify(page.margins)}`);
    }
    // A margin a stylesheet sets alone: the scan must read css, or one there passes unseen.
    for (const [name, text] of [
        ['styles/globals.css', `.section { ${m}argin-top: 6rem; }\n`],
        ['styles/globals.css', `@utility anchor { @apply ${m}t-24; }\n`],
    ]) {
        const page = one(name, text);
        check(page.margins.length === 1 && page.margins[0].startsWith(`src/${name}: `), `${name} holding ${JSON.stringify(text.trim())} gives ${JSON.stringify(page.margins)}`);
        check(page.stylesheets === 1, `${name} counts ${page.stylesheets} stylesheets, not 1`);
    }
    // What it reads: code, stylesheets and pages, nested; no test, spec or anything under __tests__.
    rmSync(src, { recursive: true, force: true });
    const read = ['a.tsx', 'lib/b.ts', 'lib/c.mjs', 'lib/d.js', 'e.jsx', 'styles/f.css', 'content/g.mdx', 'content/h.md', 'public/i.html', 'lib/j.cjs', 'lib/k.mts'];
    const skipped = ['lib/c.test.tsx', 'lib/c.spec.ts', 'lib/c.test.mjs', '__tests__/d.tsx', 'pages/__tests__/e.ts', 'data/f.json', 'g.svg'];
    for (const name of [...read, ...skipped]) write(name, `<div class="${m}t-4" />\n`);
    const page = scrollMargins(src);
    check(page.files === read.length, `read ${page.files} files, not the ${read.length}: ${read.join(', ')}`);
    check(page.stylesheets === 1, `counts ${page.stylesheets} stylesheets, not styles/f.css`);
    const named = [...read].sort().map((n) => `src/${n}: ${m}t-4`);
    check(JSON.stringify([...page.margins].sort()) === JSON.stringify(named), `names ${JSON.stringify(page.margins)}`);
    // A file with two margins is two findings, in the order they stand.
    const two = one('a.tsx', `<div className="${m}t-24 lg:${m}t-[75px]" />\n`);
    check(JSON.stringify(two.margins) === JSON.stringify([`src/a.tsx: ${m}t-24`, `src/a.tsx: ${m}t-[75px]`]), `two margins give ${JSON.stringify(two.margins)}`);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

// What a site's stylesheet takes from the package: it sources the installed package, every path package.json ships.
// Tailwind runs from an empty directory, so it reads nothing else; a decoy proves a margin class would show.
const cwd = mkdtempSync(join(tmpdir(), 'app-design-margins-cwd-'));
const out = mkdtempSync(join(tmpdir(), 'app-design-margins-out-'));
try {
    const shipped = ['package.json', ...pkg.files].map((p) => join(root, p)).filter((p) => existsSync(p));
    const compile = (name, sources) => {
        writeFileSync(join(cwd, 'input.css'), `@import '${join(root, 'node_modules/tailwindcss/index.css')}';\n` + sources.map((s) => `@source '${s}';\n`).join(''));
        const css = join(out, `${name}.css`);
        const tw = spawnSync(process.execPath, [join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(cwd, 'input.css'), '-o', css], { cwd, encoding: 'utf8', timeout: 180_000 });
        check(tw.status === 0, `tailwind (${name}) exited ${tw.status}: ${tw.stderr.trim().slice(0, 300)}`);
        return existsSync(css) ? readFileSync(css, 'utf8') : '';
    };
    const decoy = join(out, 'decoy');
    mkdirSync(decoy);
    writeFileSync(join(decoy, 'page.html'), `<section class="${m}t-24">decoy</section>\n`);
    const withDecoy = compile('decoy', [...shipped, decoy]);
    check(/scroll-margin-top\s*:/.test(withDecoy), `a planted ${m}t-24 compiles to no scroll-margin rule, so the compile reads nothing (${withDecoy.length} bytes)`);
    const pkgOnly = compile('package', shipped);
    const rules = [...pkgOnly.matchAll(/([^{}]+)\{[^{}]*scroll-margin[^{}]*\}/g)].map((r) => r[1].trim());
    check(pkgOnly.length > 0 && rules.length === 0, `the shipped package compiles to scroll-margin rules: ${JSON.stringify(rules)} (from ${shipped.map((p) => p.slice(root.length + 1)).join(', ')})`);
} finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} margins failure(s)`);
    process.exit(1);
}
console.log(`✓ margins: ${checks} checks; ./vitest's scrollMargins finds every form of a scroll-margin in code, stylesheets and pages and no scroll-padding, reads no test, and the shipped package adds no scroll-margin rule to a site's stylesheet`);
