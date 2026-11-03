#!/usr/bin/env node
/*
 * Writes src/motion/portrait-points.data.ts: the deck portrait (src/brand/portrait-tone.ts)
 * as the dots ParticlePortrait gathers. They sit on the deck's own 45° halftone screen,
 * one where the ink is, none on the paper, so the settled frame is the deck portrait;
 * each keeps its ink as its tone. Packed the way every point set in ./motion travels:
 * per dot a Uint16 x and y (0..65535 across the square), then a Uint8 tone each, as
 * base64 in a module the scene imports once the page is idle.
 *
 * It also writes src/motion/portrait-poster.ts: the same screen, coarser, as one SVG
 * path of squares, the still the page shows without script and under reduced motion
 * before the canvas draws.
 *
 * Deterministic: the same tone grid always gives the same files.
 *   node scripts/motion-points.mjs [dots across]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACROSS = Number(process.argv[2] ?? 104);
const FLOOR = 0.08; // lighter than this is paper

const src = readFileSync(join(pkg, 'src/brand/portrait-tone.ts'), 'utf8');
const N = Number(src.match(/PORTRAIT_TONE_SIZE = (\d+)/)[1]);
const tone = Buffer.from(src.match(/'([A-Za-z0-9+/=]{100,})'/)[1], 'base64');

/** Ink at (u, v) in 0..1, bilinear on the tone grid, as HalftoneCanvas samples it. */
function ink(u, v) {
    const x = Math.min(N - 1.001, Math.max(0, u * N - 0.5));
    const y = Math.min(N - 1.001, Math.max(0, v * N - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const a = tone[y0 * N + x0] * (1 - fx) + tone[y0 * N + x0 + 1] * fx;
    const b = tone[(y0 + 1) * N + x0] * (1 - fx) + tone[(y0 + 1) * N + x0 + 1] * fx;
    return (a * (1 - fy) + b * fy) / 255;
}

/** The 45° screen `across` dots wide: [x, y, ink] where there is ink, top to bottom, then left to right. */
function screen(across) {
    const pitch = 1 / across;
    const span = Math.ceil(0.75 / pitch) + 1;
    const out = [];
    for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
            const x = 0.5 + (i - j) * pitch * Math.SQRT1_2;
            const y = 0.5 + (i + j) * pitch * Math.SQRT1_2;
            if (x < 0 || y < 0 || x > 1 || y > 1) continue;
            const k = ink(x, y);
            if (k >= FLOOR) out.push([x, y, k]);
        }
    }
    return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const pitch = 1 / ACROSS;
const dots = screen(ACROSS);

const out = Buffer.alloc(dots.length * 5);
dots.forEach(([x, y, k], n) => {
    out.writeUInt16LE(Math.round(x * 65535), n * 4);
    out.writeUInt16LE(Math.round(y * 65535), n * 4 + 2);
    out[dots.length * 4 + n] = Math.round(k * 255);
});

writeFileSync(
    join(pkg, 'src/motion/portrait-points.data.ts'),
    `// Generated from brand/portrait-tone.ts by scripts/motion-points.mjs. Do not edit: run the script.\n\n` +
        `/** The deck portrait as ${dots.length} dots on a 45° screen ${ACROSS} dots across: Uint16 x, y pairs (little-endian, 0..65535 across the square), then a Uint8 tone each. */\n` +
        `export const PORTRAIT_POINTS_B64 =\n    '${out.toString('base64')}';\n\n` +
        `/** The screen's pitch, as a fraction of the square: a full-tone dot is about this wide. */\n` +
        `export const PORTRAIT_PITCH = ${+pitch.toFixed(6)};\n`
);
// The poster: a coarser screen, each dot a square as wide as ParticlePortrait draws it (0.76 of the
// pitch at full ink), in a 1000-unit square, moving relatively from one square to the next.
const POSTER_ACROSS = 56;
const unit = 1000 / POSTER_ACROSS;
let d = '';
let px = 0;
let py = 0;
for (const [x, y, k] of screen(POSTER_ACROSS)) {
    const s = Math.max(2, Math.round(Math.sqrt(k) * unit * 0.76));
    const nx = Math.round(x * 1000 - s / 2);
    const ny = Math.round(y * 1000 - s / 2);
    d += `m${nx - px} ${ny - py}h${s}v${s}h-${s}z`;
    px = nx;
    py = ny;
}
d = 'M' + d.slice(1);
writeFileSync(
    join(pkg, 'src/motion/portrait-poster.ts'),
    `// Generated from brand/portrait-tone.ts by scripts/motion-points.mjs. Do not edit: run the script.\n\n` +
        `/** The deck portrait's settled frame, coarse: one path of squares in a 0 0 1000 1000 box. */\n` +
        `export const PORTRAIT_POSTER = '${d}';\n`
);
console.log(`✓ portrait: ${dots.length} dots, ${out.length} bytes; poster ${d.length} bytes`);
