#!/usr/bin/env node
/*
 * The tarball carries the licence of every font it bundles. Inter and
 * JetBrains Mono are SIL OFL 1.1, which lets the fonts be bundled with
 * software when each copy holds their copyright notice and the licence. This
 * reads what `npm pack` would ship: every font file (dist/styles/fonts), and
 * every font inlined in a module as base64 (./og's WOFF in dist/og.*). Each
 * font's copyright notice comes from its own name table, and the tarball must
 * hold an OFL 1.1 text that opens with it. Three controls hold the check to
 * the real tarball: its texts dropped, each text with its copyright year
 * changed, and a font of another family inlined in a module; each must be
 * reported. Run after `yarn build`.
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
/** The fonts in these packed files ({ path, bytes }), each with where it sits. */
const fontsIn = (files) =>
    files.flatMap(({ path: f, bytes }) => {
        if (/\.(woff2?|[ot]tf)$/i.test(f)) return [{ where: f, bytes }];
        if (!/\.([cm]?js|css)$/i.test(f)) return [];
        return [...bytes.toString('latin1').matchAll(INLINE)].map((m) => ({ where: `${f} (inline)`, bytes: Buffer.from(m[0], 'base64') }));
    });

/** The fonts by copyright notice: a family's cuts and subsets share one. */
function familiesOf(fonts) {
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
    return families;
}

/** The families whose copyright notice opens none of these OFL 1.1 texts. */
function unlicensed(families, texts) {
    const ofl = texts.filter((t) => t.includes('SIL OPEN FONT LICENSE Version 1.1'));
    return [...families].filter(([copyright]) => !ofl.some((t) => t.startsWith(copyright))).map(([, f]) => f);
}

const files = packed.map((path) => ({ path, bytes: read(path) }));
const fonts = fontsIn(files);
const families = familiesOf(fonts);
const texts = files.filter((f) => /\.txt$/i.test(f.path)).map((f) => f.bytes.toString('utf8'));
check(fonts.length > 0, 'the tarball holds no font: run yarn build first');
check(
    fonts.some((f) => f.where.endsWith('(inline)')),
    'no font is inlined in dist: ./og carries its fonts as base64, so the scan misses them'
);
for (const { family, where } of unlicensed(families, texts)) {
    check(false, `${family} ships (${where.length}: ${where.slice(0, 3).join(', ')}) with no OFL text in the tarball that opens with its copyright notice`);
}

// Control 1: the same tarball without its .txt files reports every family.
const dropped = unlicensed(families, []);
check(
    dropped.length === families.size && families.size > 0,
    `the control without the tarball's texts reports ${dropped.map((f) => f.family).join(', ') || 'nothing'}, not all ${families.size} families`
);
// Control 2: each family's text with its copyright year moved back one is not its licence.
for (const [copyright, { family }] of families) {
    const year = copyright.match(/\b(19|20)\d\d\b/)?.[0];
    check(Boolean(year), `${family}: its copyright notice names no year for the wrong-year control`);
    if (!year) continue;
    const moved = texts.map((t) => (t.startsWith(copyright) ? t.replace(year, String(Number(year) - 1)) : t));
    const found = unlicensed(families, moved).map((f) => f.family);
    check(found.includes(family), `the control with ${family}'s text dated ${Number(year) - 1} still reads it as licensed`);
}
// Control 3: a font of another family, inlined as base64 in a module, is found and has no licence.
const other = sfntWithNames('Copyright 2020 The Control Sans Project Authors', 'Control Sans');
const inlined = { path: 'dist/control.js', bytes: Buffer.from(`export const f = "${other.toString('base64')}";`) };
const planted = new Map([...families, ...familiesOf(fontsIn([inlined]))]);
const plantedFound = unlicensed(planted, texts).map((f) => f.family);
check(plantedFound.length === 1 && plantedFound[0] === 'Control Sans', `the control with an inlined Control Sans reports ${plantedFound.join(', ') || 'nothing'}, not Control Sans alone`);

/** A bare TrueType sfnt holding only a name table: copyright (ID 0) and family (ID 1), Windows Unicode. */
function sfntWithNames(copyright, family) {
    const strings = [copyright, family].map((s) => Buffer.from(s, 'utf16le').swap16());
    const name = Buffer.alloc(6 + 12 * strings.length + strings.reduce((n, s) => n + s.length, 0));
    name.writeUInt16BE(0, 0);
    name.writeUInt16BE(strings.length, 2);
    name.writeUInt16BE(6 + 12 * strings.length, 4);
    let offset = 0;
    strings.forEach((s, id) => {
        [3, 1, 0x409, id, s.length, offset].forEach((v, k) => name.writeUInt16BE(v, 6 + id * 12 + k * 2));
        s.copy(name, 6 + 12 * strings.length + offset);
        offset += s.length;
    });
    const head = Buffer.alloc(12 + 16);
    head.writeUInt32BE(0x10000, 0);
    head.writeUInt16BE(1, 4);
    head.write('name', 12, 'latin1');
    head.writeUInt32BE(head.length, 12 + 8);
    head.writeUInt32BE(name.length, 12 + 12);
    return Buffer.concat([head, name]);
}

if (failures) {
    console.error(`\n${failures} licenses failure(s)`);
    process.exit(1);
}
const list = [...families.values()].map((f) => `${f.family} (${f.where.length})`).join(', ');
const textFiles = packed.filter((f) => /\.txt$/i.test(f)).join(', ');
console.log(`✓ licenses: ${checks} checks; the tarball's ${fonts.length} fonts are ${list}, each with its OFL 1.1 text (${textFiles}); dropped, wrong-year and other-family controls read red`);
