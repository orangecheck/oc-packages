#!/usr/bin/env node
/*
 * The portrait's points survive their packed form, and the shipped ones are
 * what the pipeline says they are. Run after `yarn build`:
 *
 * - Round trip: points packed by scripts/portrait/lib.mjs come back through
 *   ./motion's unpackPoints and decodePoints within one step of their
 *   quantisation, corners and full tones included, and a short buffer is
 *   read as the whole points it holds.
 * - The default (bustPoints): as many points as grounds, every one inside
 *   the square with a tone from 0 to 1 and grounds 1, 2 or 3, each stored
 *   once, top to bottom; on each ground exactly the count portrait.json asks
 *   for and the file's own comment states; tones from the photograph's full
 *   range; a positive on each ground (paper's own dots darker than a dark
 *   ground's); each named place on the figure, with dots around it.
 * - The halftone tone (portraitTone) and the deck screen (deckPortraitPoints):
 *   the right size, ink only on the figure, inside the square.
 *
 * scripts/portrait/build.mjs --check is the other half: the files match a
 * fresh run from the committed photograph and seed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pack, seeded } from './portrait/lib.mjs';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(pkg, 'dist/motion.mjs')) || !existsSync(join(pkg, 'dist/brand.mjs'))) {
    console.error('✗ portrait: dist is missing; run yarn build first');
    process.exit(1);
}
const M = await import(join(pkg, 'dist/motion.mjs'));
const B = await import(join(pkg, 'dist/brand.mjs'));
const config = JSON.parse(readFileSync(join(pkg, 'scripts/portrait/portrait.json'), 'utf8'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ portrait: ${msg}`);
        failures++;
    }
};

// ── Round trip ───────────────────────────────────────────────────────────────
{
    const rand = seeded(7);
    const pts = [
        [0, 0, 0],
        [1, 1, 1],
        [1, 0, 0.5],
        [0, 1, 1 / 255],
        ...Array.from({ length: 500 }, () => [rand(), rand(), rand()]),
    ];
    const bytes = pack(pts);
    check(bytes.length === pts.length * 5, `pack wrote ${bytes.length} bytes for ${pts.length} points, not 5 each`);
    const back = M.unpackPoints(bytes, 0.01);
    const b64 = M.decodePoints(Buffer.from(bytes).toString('base64'), 0.01);
    check(back.count === pts.length && b64.count === pts.length, `round trip gave ${back.count} and ${b64.count} points for ${pts.length}`);
    check(back.pitch === 0.01, `unpackPoints kept pitch ${back.pitch}, not 0.01`);
    let worst = [0, 0];
    pts.forEach(([x, y, t], i) => {
        worst[0] = Math.max(worst[0], Math.abs(back.x[i] - x), Math.abs(back.y[i] - y));
        worst[1] = Math.max(worst[1], Math.abs(back.tone[i] - t));
        if (back.x[i] !== b64.x[i] || back.y[i] !== b64.y[i] || back.tone[i] !== b64.tone[i]) worst[0] = Infinity;
    });
    // Half a step of each quantisation, plus Float32's rounding.
    check(worst[0] <= 0.5 / 65535 + 1e-7, `a position came back ${worst[0]} away, more than half of 1/65535 (or decodePoints and unpackPoints disagree)`);
    check(worst[1] <= 0.5 / 255 + 1e-7, `a tone came back ${worst[1]} away, more than half of 1/255`);
    check(back.x[0] === 0 && back.y[1] === 1 && back.tone[1] === 1 && back.tone[0] === 0, 'the square\'s corners or the full tones did not come back exactly');
    // A buffer cut mid-point holds only its whole points.
    check(M.unpackPoints(bytes.subarray(0, 5 * 3 + 2), 0.01).count === 3, 'a buffer of 17 bytes is not read as 3 points');
}

// ── The default ──────────────────────────────────────────────────────────────
const dataTs = readFileSync(join(pkg, 'src/motion/portrait-points.data.ts'), 'utf8');
const stated = dataTs.match(/(\d+) dots on paper, (\d+) on a dark ground, (\d+) in all/);
const raw = Buffer.from(dataTs.match(/PORTRAIT_POINTS_B64 =\s*'([^']+)'/)[1], 'base64');
const pts = await M.bustPoints();
const n = pts.count;
check(stated && +stated[3] === n, `portrait-points.data.ts says ${stated?.[3]} dots in all, bustPoints has ${n}`);
check(raw.length === n * 5, `the packed points are ${raw.length} bytes, not 5 for each of ${n}`);
check(pts.grounds instanceof Uint8Array && pts.grounds.length === n, `${pts.grounds?.length} grounds for ${n} points`);
check(pts.pitch > 0 && pts.pitch < 0.05, `the stipple's pitch is ${pts.pitch}`);
let out = 0;
let badGround = 0;
let order = 0;
const seen = new Set();
const onGround = [0, 0, 0];
let [lo, hi] = [1, 0];
for (let i = 0; i < n; i++) {
    const [x, y, t, g] = [pts.x[i], pts.y[i], pts.tone[i], pts.grounds[i]];
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1 && t >= 0 && t <= 1)) out++;
    if (g < 1 || g > 3) badGround++;
    if (i && (y < pts.y[i - 1] || (y === pts.y[i - 1] && x < pts.x[i - 1]))) order++;
    seen.add(raw.readUInt32LE(i * 4));
    for (const bit of [1, 2]) if (g & bit) onGround[bit]++;
    [lo, hi] = [Math.min(lo, t), Math.max(hi, t)];
}
check(out === 0, `${out} points lie outside the square or have a tone outside 0..1`);
check(badGround === 0, `${badGround} points have grounds other than 1, 2 or 3`);
check(order === 0, `${order} points are out of their top-to-bottom order`);
check(seen.size === n, `${n - seen.size} points are stored twice`);
check(onGround[1] === config.dots && onGround[2] === config.dots, `${onGround[1]} dots on paper and ${onGround[2]} on dark, not the ${config.dots} each portrait.json asks for`);
check(stated && +stated[1] === onGround[1] && +stated[2] === onGround[2], `the file states ${stated?.[1]} and ${stated?.[2]} dots per ground, the data holds ${onGround[1]} and ${onGround[2]}`);
// A photograph after its levels runs from paper to full ink; a flat one would not carry a face.
check(lo <= 0.05 && hi >= 0.95, `the tones run only from ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
// A positive on each ground: the dots only paper draws sit where the picture is dark, those only a dark ground draws where it is lit.
const ink = (g) => {
    let [sum, k] = [0, 0];
    for (let i = 0; i < n; i++) if (pts.grounds[i] === g) [sum, k] = [sum + pts.tone[i], k + 1];
    return sum / k;
};
check(ink(1) > ink(2) + 0.3, `the dots only paper draws average ink ${ink(1).toFixed(2)}, those only a dark ground draws ${ink(2).toFixed(2)}: not a positive on each`);

// Each named place is on the figure: dots around it on at least one ground.
const anchors = M.PORTRAIT_ANCHORS;
check(JSON.stringify(Object.keys(anchors)) === JSON.stringify(Object.keys(config.anchors)), `PORTRAIT_ANCHORS names ${Object.keys(anchors)}, portrait.json ${Object.keys(config.anchors)}`);
for (const [name, [ax, ay]] of Object.entries(anchors)) {
    let near = 0;
    for (let i = 0; i < n; i++) if (Math.hypot(pts.x[i] - ax, pts.y[i] - ay) < 0.04) near++;
    check(near >= 20, `the ${name} anchor (${ax}, ${ay}) has ${near} dots within 0.04: it is off the figure`);
}

// ── The halftone tone and the deck screen ────────────────────────────────────
const tone = B.portraitTone();
const size = tone.size;
check(size === 128 && tone.data.length === size * size, `portraitTone is ${tone.data.length} bytes for size ${size}`);
const corners = [0, size - 1, size * (size - 1), size * size - 1].map((k) => tone.data[k]);
check(corners.every((v) => v === 0), `portraitTone has ink in a corner (${corners}): the backdrop is not paper`);
check(Math.max(...tone.data) >= 200, `portraitTone's darkest ink is ${Math.max(...tone.data)}`);
const deck = await M.deckPortraitPoints();
const deckTs = readFileSync(join(pkg, 'src/motion/deck-points.data.ts'), 'utf8');
check(+deckTs.match(/as (\d+) dots/)[1] === deck.count && deck.count > 1000, `deck-points.data.ts states ${deckTs.match(/as (\d+) dots/)[1]} dots, deckPortraitPoints has ${deck.count}`);
let deckOut = 0;
for (let i = 0; i < deck.count; i++) if (!(deck.x[i] >= 0 && deck.x[i] <= 1 && deck.y[i] >= 0 && deck.y[i] <= 1 && deck.tone[i] >= 0.08 - 0.5 / 255 && deck.tone[i] <= 1)) deckOut++;
check(deckOut === 0, `${deckOut} deck points are outside the square or lighter than the screen's floor`);

if (failures) process.exit(1);
console.log(`✓ portrait: ${checks} checks; points round-trip their packed form, and the default holds ${n} dots, ${config.dots} on each ground`);
