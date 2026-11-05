#!/usr/bin/env node
/*
 * Cuts ./og's mono font, JetBrains Mono 400, to the characters its callers can
 * draw: the union of mono-inventory.mjs's classes, plus space.
 *
 *   node scripts/og/subset-mono.mjs           write the cut and src/og/mono-chars.ts
 *   node scripts/og/subset-mono.mjs --check   fail if either differs from a fresh cut,
 *                                             or the cut's cmap is not the set
 *
 * The source is fontsource's Latin cut, beside this script. The package does
 * not ship it: `files` has no scripts/, and only what src/og/index.tsx imports
 * reaches dist. subset-font (HarfBuzz's hb-subset, a devDependency) cuts it and
 * writes WOFF through pako, so a cut is the same bytes on any machine.
 *
 * The cut keeps no layout tables. satori's opentype.js applies only liga and
 * rlig, and kern, and JetBrains Mono has none of them (its GSUB is calt, ccmp,
 * frac and locl, its GPOS is mark), so they change no pixel of a card. Name
 * IDs 0 to 6 and 14 stay: the copyright and the licence's URL are in the font,
 * as in the original. The font is OFL-1.1 (licenses/OFL-JetBrainsMono.txt)
 * with no Reserved Font Name, so the cut may keep its name.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { monoSet } from './mono-inventory.mjs';
import { cmapCodePoints } from './woff.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..', '..');
const require = createRequire(join(pkg, 'package.json'));
const subsetFont = require('subset-font');

const SOURCE = join(here, 'jetbrains-mono-latin-400-normal.woff');
const FONT = join(pkg, 'src/og/fonts/jetbrains-mono-og-400-normal.woff');
const CHARS = join(pkg, 'src/og/mono-chars.ts');
const CHECK = process.argv.includes('--check');

const set = monoSet();
const font = await subsetFont(readFileSync(SOURCE), set, {
    targetFormat: 'woff',
    keepFeatures: [],
    dropTables: ['GSUB', 'GPOS', 'GDEF', 'STAT'],
    preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 14],
});

/** What the cut draws, from its own cmap, in code point order. */
const drawn = [...cmapCodePoints(font)].sort((a, b) => a - b).map((c) => String.fromCodePoint(c));
const quoted = `'${drawn.join('').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const chars = `// Written by scripts/og/subset-mono.mjs from the mono font's cmap; run it after changing mono-inventory.mjs.
/** Every character ./og's mono font draws. Any other in a mono field is drawn in Inter, with a warning. */
export const MONO_CHARS = ${quoted};
`;

const missing = [...set].filter((c) => !drawn.includes(c));
const extra = drawn.filter((c) => !set.includes(c));
const cp = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
if (missing.length || extra.length) {
    console.error(`✗ subset-mono: the cut's cmap is not the set: missing ${missing.map(cp).join(' ') || 'none'}, extra ${extra.map(cp).join(' ') || 'none'}`);
    process.exit(1);
}

if (CHECK) {
    const failures = [];
    let committed;
    try {
        committed = readFileSync(FONT);
    } catch {
        failures.push(`${FONT} is missing`);
    }
    if (committed && !committed.equals(font)) failures.push(`the committed font (${committed.length} B) is not a fresh cut (${font.length} B)`);
    if (committed && [...cmapCodePoints(committed)].length !== drawn.length) failures.push("the committed font's cmap is not the set");
    let written = '';
    try {
        written = readFileSync(CHARS, 'utf8');
    } catch {
        failures.push(`${CHARS} is missing`);
    }
    if (written && written !== chars) failures.push('src/og/mono-chars.ts is not the cut’s cmap');
    if (failures.length) {
        for (const f of failures) console.error(`✗ subset-mono: ${f}`);
        console.error('  run node scripts/og/subset-mono.mjs');
        process.exit(1);
    }
    console.log(`✓ subset-mono: the mono font is a fresh cut (${font.length} B) of ${drawn.length} characters, every character mono-inventory.mjs's classes hold`);
} else {
    writeFileSync(FONT, font);
    writeFileSync(CHARS, chars);
    console.log(`subset-mono: wrote ${FONT} (${font.length} B, ${drawn.length} characters) and ${CHARS}`);
}
