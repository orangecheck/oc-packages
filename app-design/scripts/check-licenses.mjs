#!/usr/bin/env node
/*
 * The tarball carries the licence of every font it bundles. Inter and
 * JetBrains Mono are SIL OFL 1.1, which lets the fonts be bundled with
 * software when each copy holds their copyright notice and the licence. This
 * reads what `npm pack` would ship: every font file (dist/styles/fonts), and
 * every font inlined in a module as base64 (./og's WOFF in dist/og.*). Each
 * font's copyright notice comes from its own name table, and the tarball must
 * hold an OFL 1.1 text that opens with it. A control drops the tarball's
 * texts and wants every font family reported. Run after `yarn build`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fontNames } from './og/woff.mjs';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const packed = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: pkg,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    })
)[0].files.map((f) => f.path);
const read = (f) => readFileSync(join(pkg, f));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ licenses: ${msg}`);
        failures++;
    }
};

// Every font in the tarball: a font file, or a WOFF, WOFF2 or sfnt inlined as a base64 string in a module or stylesheet.
const INLINE = /(?<=["'`]|base64,)(?:d09GRg|d09GMg|AAEAAA|T1RUTw)[A-Za-z0-9+/]+={0,2}/g;
const fonts = packed.flatMap((f) => {
    if (/\.(woff2?|[ot]tf)$/i.test(f)) return [{ where: f, bytes: read(f) }];
    if (!/\.([cm]?js|css)$/i.test(f)) return [];
    return [...read(f).toString('latin1').matchAll(INLINE)].map((m) => ({ where: `${f} (inline)`, bytes: Buffer.from(m[0], 'base64') }));
});

// The fonts by copyright notice: a family's cuts and subsets share one.
const families = new Map();
for (const { where, bytes } of fonts) {
    let names;
    try {
        names = fontNames(bytes);
    } catch (e) {
        check(false, `${where}: cannot read the font (${e.message})`);
        continue;
    }
    check(Boolean(names.copyright), `${where}: the font's name table has no copyright notice`);
    if (!names.copyright) continue;
    // The family's shortest name: the 300 cut calls itself Inter Light.
    const family = names.family ?? names.copyright;
    const seen = families.get(names.copyright) ?? { family, where: [] };
    if (family.length < seen.family.length) seen.family = family;
    seen.where.push(where);
    families.set(names.copyright, seen);
}
check(fonts.length > 0, 'the tarball holds no font: run yarn build first');
check(
    fonts.some((f) => f.where.endsWith('(inline)')),
    'no font is inlined in dist: ./og carries its fonts as base64, so the scan misses them'
);

/** The font families whose copyright notice opens no OFL 1.1 text among these packed files. */
function unlicensed(files) {
    const texts = files.filter((f) => /\.txt$/i.test(f)).map((f) => read(f).toString('utf8'));
    const ofl = texts.filter((t) => t.includes('SIL OPEN FONT LICENSE Version 1.1'));
    return [...families].filter(([copyright]) => !ofl.some((t) => t.startsWith(copyright))).map(([, f]) => f);
}

for (const { family, where } of unlicensed(packed)) {
    check(false, `${family} ships (${where.length}: ${where.slice(0, 3).join(', ')}) with no OFL text in the tarball that opens with its copyright notice`);
}
// The control: the same tarball without its .txt files reports every family.
const control = unlicensed(packed.filter((f) => !/\.txt$/i.test(f)));
check(
    control.length === families.size && families.size > 0,
    `the control without the tarball's texts reports ${control.map((f) => f.family).join(', ') || 'nothing'}, not all ${families.size} families`
);

if (failures) {
    console.error(`\n${failures} licenses failure(s)`);
    process.exit(1);
}
const list = [...families.values()].map((f) => `${f.family} (${f.where.length})`).join(', ');
const texts = packed.filter((f) => /\.txt$/i.test(f)).join(', ');
console.log(`✓ licenses: ${checks} checks; the tarball's ${fonts.length} fonts are ${list}, each with its OFL 1.1 text (${texts})`);
