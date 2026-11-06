#!/usr/bin/env node
/*
 * ./vitest's squarePage, the square-page rule a site's test runs on its own source: here it reads a
 * planted src directory. Each radius off the zero scale is one finding and each square step none; a
 * dot passes, and a pill, a round control or a rounded-full it cannot read is one finding; tests and
 * __tests__ are not read, and a finding names its file from src's parent with its line.
 * Run after `yarn build`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { squarePage } = createRequire(import.meta.url)(join(root, pkg.exports['./vitest'].require));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ square: ${msg}`);
        failures++;
    }
};

const REFUSED = [
    'rounded-[1.25rem]',
    'rounded-[2px]',
    'rounded-br-[0.375rem]',
    'md:rounded-tl-[4px]',
    'rounded-(--my-radius)',
    'rounded-xs',
    'rounded-t-xs',
    'rounded-depict',
    'rounded-tile',
    '[border-radius:6px]',
];
const SQUARE = ['rounded', 'rounded-none', 'rounded-full', 'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-4xl', 'rounded-t-lg'];
// A rounded-full and what it is on: [source, findings].
const ROUND = [
    ['<span className="inline-flex size-9 rounded-full bg-muted" />', 0],
    ['<Skeleton className="size-9 rounded-full" />', 0],
    ['<span className="h-5 min-w-5 rounded-full px-1.5">3</span>', 1],
    ['<button type="button" className="rounded-full p-1.5">x</button>', 1],
    ['<button\n  onClick={() => go()}\n  className="size-9 rounded-full">', 1],
    ['<Button className={`size-9 rounded-full`} />', 1],
    ["const PILL = 'h-8 rounded-full px-3';", 1],
];

const dir = mkdtempSync(join(tmpdir(), 'app-design-square-'));
try {
    const src = join(dir, 'src');
    const write = (name, text) => {
        mkdirSync(dirname(join(src, name)), { recursive: true });
        writeFileSync(join(src, name), text);
    };
    const one = (name, text) => {
        rmSync(src, { recursive: true, force: true });
        write(name, text);
        return squarePage(src);
    };
    for (const c of REFUSED) {
        const page = one('a.tsx', `export const A = () => <div className="p-2 ${c}" />;\n`);
        const at = 'src/a.tsx:1 ';
        check(page.radii.length === 1 && page.radii[0].startsWith(at) && c.includes(page.radii[0].slice(at.length)), `${c} gives ${JSON.stringify(page.radii)}, not one finding at src/a.tsx:1`);
    }
    for (const style of ['style={{ borderRadius: 8 }}', 'style={{ borderRadius }}']) {
        const page = one('a.tsx', `export const A = () => (\n    <div ${style} />\n);\n`);
        check(page.radii.length === 1 && page.radii[0].startsWith('src/a.tsx:2 '), `${style} gives ${JSON.stringify(page.radii)}`);
    }
    for (const c of SQUARE) {
        const page = one('a.tsx', `export const A = () => <div className="size-4 ${c}" />;\n`);
        check(page.radii.length === 0, `${c} is square, yet gives ${JSON.stringify(page.radii)}`);
    }
    for (const [text, n] of ROUND) {
        const page = one('a.tsx', `${text}\n`);
        check(page.roundNotDots.length === n, `${JSON.stringify(text)} gives ${page.roundNotDots.length} round findings, not ${n}: ${JSON.stringify(page.roundNotDots)}`);
    }
    // What it reads: .ts and .tsx, nested, but no test and nothing under __tests__.
    rmSync(src, { recursive: true, force: true });
    write('a.tsx', 'export const A = () => <div className="rounded-xs" />;\n');
    write('lib/b.ts', "export const B = 'rounded-[3px]';\n");
    write('lib/c.test.tsx', 'export const C = <div className="rounded-xs" />;\n');
    write('__tests__/d.tsx', 'export const D = <div className="rounded-xs" />;\n');
    write('e.css', '.e { border-radius: 4px; }\n');
    write('f.md', 'rounded-xs\n');
    const page = squarePage(src);
    check(page.files === 2, `read ${page.files} files, not a.tsx and lib/b.ts`);
    check(JSON.stringify(page.radii) === JSON.stringify(['src/a.tsx:1 rounded-xs', 'src/lib/b.ts:1 rounded-[3px]']), `names ${JSON.stringify(page.radii)}`);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} square failure(s)`);
    process.exit(1);
}
console.log(`✓ square: ${checks} checks; ./vitest's squarePage finds each radius off the zero scale and no square step, tells a dot from a pill and a round control, and reads no test`);
