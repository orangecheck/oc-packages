#!/usr/bin/env node
/*
 * Bakes the pixel logo into src/brand/pixel.data.ts: the wordmark from
 * scripts/logo/glyphs.mjs, drawn by hand, and the check from
 * @orangecheck/mark's own cells (markPixelRuns), so there is one check: SVG
 * path data, every run of cells in a row one rectangle, merged down the rows
 * while it repeats. Nothing is drawn at run time: no canvas, no font, the
 * same paths in the server's HTML and the browser's.
 *
 *   node scripts/logo/bake.mjs           write src/brand/pixel.data.ts
 *   node scripts/logo/bake.mjs --check   fail if a glyph is malformed or the
 *                                        file differs from a fresh bake
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LARGE, MEDIUM, SMALL } from './glyphs.mjs';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { markPixelRuns } = createRequire(join(pkg, 'package.json'))('@orangecheck/mark');
const OUT = join(pkg, 'src/brand/pixel.data.ts');
const CHECK = process.argv.includes('--check');
const WORD = 'orangecheck';

let failures = 0;
const fail = (msg) => {
    console.error(`✗ logo: ${msg}`);
    failures++;
};

const lines = (block) =>
    block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

/** One glyph's rows, held to its set: every row as wide as the first, only the set's cells. */
function grid(block, name, rows, cells) {
    const g = lines(block);
    if (g.length !== rows) fail(`${name} has ${g.length} rows, not ${rows}`);
    if (g.some((r) => r.length !== g[0].length)) fail(`${name}'s rows are not one width`);
    if (g.some((r) => !cells.test(r))) fail(`${name} holds a character that is not a cell or ground`);
    return g;
}

/** The cells `on` picks as rectangles: runs in a row, merged down while the same run repeats. */
function rects(g, on) {
    const done = [];
    let open = new Map();
    g.forEach((row, y) => {
        const next = new Map();
        for (let x = 0; x < row.length; ) {
            if (!on(row[x])) {
                x++;
                continue;
            }
            const s = x;
            while (x < row.length && on(row[x])) x++;
            const key = `${s}:${x - s}`;
            const r = open.get(key) ?? { x: s, y, w: x - s, h: 0 };
            r.h++;
            next.set(key, r);
            open.delete(key);
        }
        done.push(...open.values());
        open = next;
    });
    done.push(...open.values());
    return done.sort((a, b) => a.y - b.y || a.x - b.x);
}

const path = (rs, dx = 0) => rs.map((r) => `M${r.x + dx} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');

/** Where one label meets another (or the ground): the hairline drawing of the check. */
function outline(g) {
    const H = g.length;
    const W = g[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : g[y][x]);
    let d = '';
    for (let y = 0; y <= H; y++)
        for (let x = 0; x < W; ) {
            if (at(x, y) === at(x, y - 1)) {
                x++;
                continue;
            }
            const s = x;
            while (x < W && at(x, y) !== at(x, y - 1)) x++;
            d += `M${s} ${y}H${x}`;
        }
    for (let x = 0; x <= W; x++)
        for (let y = 0; y < H; ) {
            if (at(x, y) === at(x - 1, y)) {
                y++;
                continue;
            }
            const s = y;
            while (y < H && at(x, y) !== at(x - 1, y)) y++;
            d += `M${x} ${s}V${y}`;
        }
    return d;
}

/** The word in a set: each letter at its place (the set's gap, then any kerning), as one path and letter by letter. */
function word(set, name) {
    const letters = [];
    let x = 0;
    let prev = '';
    for (const ch of WORD) {
        const block = set.glyphs[ch];
        if (!block) {
            fail(`${name} has no ${ch}`);
            continue;
        }
        const g = grid(block, `${name} ${ch}`, set.rows, /^[#.]+$/);
        if (prev) x += letters.at(-1).w + set.gap + (set.kern[prev + ch] ?? 0);
        letters.push({ x, w: g[0].length, rects: rects(g, (c) => c === '#') });
        prev = ch;
    }
    const width = x + (letters.at(-1)?.w ?? 0);
    return {
        rows: set.rows,
        xHeight: set.xHeight,
        width,
        d: letters.map((l) => path(l.rects, l.x)).join(''),
        // Each letter on its own, with the room to the next one: the footer's letters rise one by one.
        letters: letters.map((l, i) => ({ advance: (letters[i + 1]?.x ?? width) - l.x, d: path(l.rects) })),
    };
}

/** The check at `perUnit` cells a unit as rows of T, L, R and ground, from the package's runs. */
function markRows(perUnit) {
    const rows = Array.from({ length: 10 * perUnit }, () => Array(16 * perUnit).fill('.'));
    const runs = markPixelRuns(perUnit);
    for (const [face, c] of [['top', 'T'], ['left', 'L'], ['right', 'R']])
        for (const [x, y, n] of runs[face]) for (let i = x; i < x + n; i++) rows[y][i] = c;
    return rows.map((r) => r.join('')).join('\n');
}
const MARK = markRows(1);
const MARK_MID = markRows(1.5);
const MARK_ART = markRows(2);

function mark(block, name) {
    const g = grid(block, name, lines(block).length, /^[TLR.]+$/);
    if (g.length * 8 !== g[0].length * 5) fail(`${name} is ${g[0].length} by ${g.length}, not 8:5`);
    const face = (c) => path(rects(g, (x) => x === c));
    return { width: g[0].length, height: g.length, left: face('L'), right: face('R'), top: face('T') };
}

const small = word(SMALL, 'SMALL');
const medium = word(MEDIUM, 'MEDIUM');
const large = word(LARGE, 'LARGE');
const whole = (w) => ({ rows: w.rows, xHeight: w.xHeight, width: w.width, d: w.d });

/** A value as source, one field to a line, strings in single quotes: path data holds none. */
function src(v, ind = '') {
    if (typeof v === 'string') return `'${v}'`;
    if (typeof v === 'number') return String(v);
    const inner = ind + '    ';
    if (Array.isArray(v)) {
        if (v.every((x) => typeof x === 'number')) return `[${v.join(', ')}]`;
        return `[\n${v.map((x) => inner + src(x, inner)).join(',\n')},\n${ind}]`;
    }
    const fields = Object.entries(v).map(([k, x]) => `${k}: ${src(x, inner)}`);
    const flat = `{ ${fields.join(', ')} }`;
    return ind.length + flat.length < 120 ? flat : `{\n${fields.map((f) => inner + f).join(',\n')},\n${ind}}`;
}

const out = `/*
 * Baked by scripts/logo/bake.mjs: the wordmark from scripts/logo/glyphs.mjs,
 * where its cells are drawn, the check from @orangecheck/mark. Edit those and
 * bake again; never this file.
 */

/** The wordmark as one path on each lockup grid: small, a header's; medium, the smaller lockups'. */
export const PIXEL_WORDS = ${src({ small: whole(small), medium: whole(medium) })} as const;

/** The large wordmark, letter by letter: the footer's signature. */
export const PIXEL_SIGNATURE = ${src({ rows: large.rows, width: large.width, letters: large.letters })} as const;

/** The check's faces on each grid: one cell a unit (16 by 10), one and a half (24 by 15), and two (32 by 20, art: the design's own drawing). */
export const PIXEL_MARKS = ${src({ small: mark(MARK, 'MARK'), medium: mark(MARK_MID, 'MARK_MID'), art: mark(MARK_ART, 'MARK_ART') })} as const;

/** The art check's hairline drawing: the error page's check, there but not filled in. */
export const PIXEL_MARK_OUTLINE = ${src(outline(grid(MARK_ART, 'MARK_ART', lines(MARK_ART).length, /^[TLR.]+$/)))};
`;

if (failures) process.exit(1);
if (CHECK) {
    let current = '';
    try {
        current = readFileSync(OUT, 'utf8');
    } catch {}
    if (current !== out) {
        console.error('✗ logo: src/brand/pixel.data.ts differs from a fresh bake; run node scripts/logo/bake.mjs');
        process.exit(1);
    }
    console.log(
        `✓ logo: the baked paths match the glyphs (wordmark ${[small, medium, large].map((w) => `${w.width} by ${w.rows}`).join(', ')} cells)`
    );
} else {
    writeFileSync(OUT, out);
    console.log(`logo: wrote ${OUT}`);
}
