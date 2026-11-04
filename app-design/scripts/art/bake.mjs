#!/usr/bin/env node
/*
 * Bakes the family's generated art into ./art (published as
 * @orangecheck/app-design/art/*): PNG at display size, for a page and for an
 * OG route to draw (satori reads the PNG), and AVIF beside it only where the
 * AVIF is the smaller file. 1-bit dither is not: its AVIF is 5 to 12 times
 * its PNG, so it ships as PNG alone.
 *
 *   node scripts/art/bake.mjs           write ./art
 *   node scripts/art/bake.mjs --check   fail if ./art differs from a fresh bake,
 *                                       or holds an AVIF bigger than its PNG
 *
 * Everything is drawn from geometry and a seeded noise, never from a
 * photograph (PLAN §6), so a bake is the same bytes every time:
 *   - dither-mark-{240,480,960}: the isometric mark in ordered dither, faces
 *     as @orangecheck/mark; `-ink` has the ink top face for light grounds;
 *   - dither-field: a dither texture from value noise, orange on transparent,
 *     for burnt bands;
 *   - halftone-field: a dot screen that fades from the left edge, for the
 *     "up to 80%" tile.
 * Each texture comes at display size and at -2x; the mark's widths pair up as
 * 1x/2x (240/480, 480/960). Every file stays under about 14 KB, what a static
 * 1-bit dither image costs (design2/forensics/SUMMARY-subpages.md).
 * sharp (a devDependency) encodes; nothing here runs in a site.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(pkg, 'package.json'));
const sharp = require('sharp');
const { MARK_FACES, MARK_POINTS, MARK_MONO_OPACITY } = require('@orangecheck/mark');

const OUT = join(pkg, 'art');
/** Each file's budget: a static 1-bit dither image is about 14 KB. */
const BUDGET = 14 * 1024;
const CHECK = process.argv.includes('--check');
const ORANGE = [0xf9, 0x73, 0x16];
const INK = [0x16, 0x14, 0x12];
const BURNT = '#2a1206';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** 8×8 Bayer thresholds in (0, 1). */
const BAYER = (() => {
    const m = [[0]];
    let b = m;
    for (let n = 1; n < 8; n *= 2) {
        const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
        for (let y = 0; y < n; y++)
            for (let x = 0; x < n; x++) {
                const v = b[y][x] * 4;
                next[y][x] = v;
                next[y][x + n] = v + 2;
                next[y + n][x] = v + 3;
                next[y + n][x + n] = v + 1;
            }
        b = next;
    }
    return b.map((row) => row.map((v) => (v + 0.5) / 64));
})();

/** A seeded PRNG (mulberry32), so the noise is the same every bake. */
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Smooth value noise on a lattice of `cell` px, `octaves` deep. */
function valueNoise(w, h, seed, cell, octaves) {
    const out = new Float32Array(w * h);
    let amp = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++, cell /= 2, amp /= 2) {
        const r = rng(seed + o * 101);
        const gw = Math.ceil(w / cell) + 2;
        const gh = Math.ceil(h / cell) + 2;
        const grid = Float32Array.from({ length: gw * gh }, r);
        const s = (t) => t * t * (3 - 2 * t);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const gx = x / cell;
                const gy = y / cell;
                const x0 = Math.floor(gx);
                const y0 = Math.floor(gy);
                const tx = s(gx - x0);
                const ty = s(gy - y0);
                const at = (i, j) => grid[(y0 + j) * gw + (x0 + i)];
                const top = at(0, 0) + (at(1, 0) - at(0, 0)) * tx;
                const bot = at(0, 1) + (at(1, 1) - at(0, 1)) * tx;
                out[y * w + x] += (top + (bot - top) * ty) * amp;
            }
        total += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
}

/** Point-in-polygon for the mark's faces, in its 16×8 viewBox. */
function inside(px, py, points) {
    const p = points.split(' ').map((xy) => xy.split(',').map(Number));
    let hit = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i];
        const [xj, yj] = p[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

/** The mark in ordered dither: each face's tone screened in `cell`-px blocks. */
function ditherMark(width, topFace) {
    const height = width / 2;
    const cell = Math.max(2, Math.round(width / 160));
    const data = Buffer.alloc(width * height * 4);
    const faces = [
        ['top', hex(topFace), MARK_MONO_OPACITY.top],
        ['left', hex(MARK_FACES.left), MARK_MONO_OPACITY.left],
        ['right', hex(MARK_FACES.right), MARK_MONO_OPACITY.right],
    ];
    for (let cy = 0; cy < height; cy += cell)
        for (let cx = 0; cx < width; cx += cell) {
            const vx = ((cx + cell / 2) / width) * 16;
            const vy = ((cy + cell / 2) / height) * 8;
            const face = faces.find(([name]) => inside(vx, vy, MARK_POINTS[name]));
            if (!face) continue;
            // A face is solid at its own tone and grainier toward its far edge.
            const tone = 0.55 + 0.45 * face[2] * (1 - (vy / 8) * 0.35);
            const t = BAYER[(cy / cell) % 8][(cx / cell) % 8];
            if (tone < t) continue;
            for (let y = cy; y < Math.min(cy + cell, height); y++)
                for (let x = cx; x < Math.min(cx + cell, width); x++) {
                    const i = (y * width + x) * 4;
                    data[i] = face[1][0];
                    data[i + 1] = face[1][1];
                    data[i + 2] = face[1][2];
                    data[i + 3] = 255;
                }
        }
    return { data, width, height };
}

/** A dither texture from value noise: orange blocks where the noise clears the screen. */
function ditherField(width, height, seed, scale = 1) {
    // At 2x every block is twice the size: the same pattern at twice the pixels.
    const cell = 4 * scale;
    const cw = width / cell;
    const ch = height / cell;
    const noise = valueNoise(cw, ch, seed, 40, 4);
    const data = Buffer.alloc(width * height * 4);
    for (let cy = 0; cy < ch; cy++)
        for (let cx = 0; cx < cw; cx++) {
            // Sparse: about a quarter of the field, denser where the noise is high.
            const v = Math.max(0, (noise[cy * cw + cx] - 0.4) * 1.7);
            if (v < BAYER[cy % 8][cx % 8]) continue;
            for (let y = cy * cell; y < (cy + 1) * cell; y++)
                for (let x = cx * cell; x < (cx + 1) * cell; x++) {
                    const i = (y * width + x) * 4;
                    data[i] = ORANGE[0];
                    data[i + 1] = ORANGE[1];
                    data[i + 2] = ORANGE[2];
                    data[i + 3] = 255;
                }
        }
    return { data, width, height };
}

/** A dot screen whose dots shrink from the left edge to nothing at `fade` of the width. */
function halftoneField(width, height, pitch, fade) {
    const data = Buffer.alloc(width * height * 4);
    const ss = 4; // supersamples per axis, for round dots
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            let cover = 0;
            for (let sy = 0; sy < ss; sy++)
                for (let sx = 0; sx < ss; sx++) {
                    const px = x + (sx + 0.5) / ss;
                    const py = y + (sy + 0.5) / ss;
                    const cx = (Math.floor(px / pitch) + 0.5) * pitch;
                    const cy = (Math.floor(py / pitch) + 0.5) * pitch;
                    const k = Math.max(0, 1 - cx / (width * fade));
                    const r = (pitch / 2) * 0.92 * Math.sqrt(k);
                    if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) cover++;
                }
            // Hard-edged: a pixel is in the dot when most of it is, which keeps the
            // file small and the screen crisp at display size.
            if (cover * 2 < ss * ss) continue;
            const i = (y * width + x) * 4;
            data[i] = ORANGE[0];
            data[i + 1] = ORANGE[1];
            data[i + 2] = ORANGE[2];
            data[i + 3] = 255;
        }
    return { data, width, height };
}

const pieces = [];
for (const w of [240, 480, 960]) {
    pieces.push([`dither-mark-${w}`, ditherMark(w, MARK_FACES.top)]);
    pieces.push([`dither-mark-ink-${w}`, ditherMark(w, `#${INK.map((c) => c.toString(16).padStart(2, '0')).join('')}`)]);
}
// Each texture at display size, 1x and 2x. The mark's three widths are its 1x/2x pairs (240/480, 480/960).
pieces.push(['dither-field', ditherField(1200, 320, 7)]);
pieces.push(['dither-field-2x', ditherField(2400, 640, 7, 2)]);
// The halftone is for burnt grounds only: its AVIF may be flattened on burnt to fit the budget.
pieces.push(['halftone-field', halftoneField(320, 320, 8, 0.6), BURNT]);
pieces.push(['halftone-field-2x', halftoneField(640, 640, 16, 0.6), BURNT]);

const files = new Map();
for (const [name, img, ground] of pieces) {
    const raw = { raw: { width: img.width, height: img.height, channels: 4 } };
    // Every piece is flat (no partial alpha, three colours at most): a small palette.
    const png = await sharp(img.data, raw)
        .png({
            palette: true,
            colours: 4,
            compressionLevel: 9,
            effort: 10,
            dither: 0,
        })
        .toBuffer();
    // Lossy, full chroma, so the blocks keep their edges: the highest quality that fits the budget.
    // AVIF spends a lot on an alpha edge, so art with a single ground is flattened onto it if it must.
    let avif;
    for (const flat of ground ? [false, true] : [false]) {
        for (const quality of [55, 45, 35, 25]) {
            const src = flat ? sharp(img.data, raw).flatten({ background: ground }) : sharp(img.data, raw);
            avif = await src.avif({ quality, effort: 4, chromaSubsampling: '4:4:4' }).toBuffer();
            if (avif.length <= BUDGET) break;
        }
        if (avif.length <= BUDGET) break;
    }
    files.set(`${name}.png`, png);
    // An AVIF ships only when it is smaller than the PNG; otherwise a <picture> would pay more for it.
    if (avif.length < png.length) files.set(`${name}.avif`, avif);
}

if (CHECK) {
    let bad = 0;
    for (const [f, buf] of files) {
        let have;
        try {
            have = readFileSync(join(OUT, f));
        } catch {
            have = null;
        }
        if (!have || !have.equals(buf)) {
            console.error(`✗ art: ${f} differs from a fresh bake; run node scripts/art/bake.mjs`);
            bad++;
        }
    }
    // A file over its budget fails, as a page would pay for it.
    for (const [f, buf] of files) {
        if (buf.length > BUDGET) {
            console.error(`✗ art: ${f} is ${(buf.length / 1024).toFixed(1)} KB, over the ${BUDGET / 1024} KB budget`);
            bad++;
        }
    }
    // Anything else fails too, an AVIF that lost to its PNG among them.
    const extra = readdirSync(OUT).filter((f) => !files.has(f) && f !== 'README.md');
    for (const f of extra) (console.error(`✗ art: ${f} is not baked by this script${f.endsWith('.avif') ? ', or is bigger than its PNG' : ''}`), bad++);
    if (bad) process.exit(1);
    console.log(`✓ art: ${files.size} files match a fresh bake, each within ${BUDGET / 1024} KB`);
} else {
    mkdirSync(OUT, { recursive: true });
    for (const [f, buf] of files) writeFileSync(join(OUT, f), buf);
    // A file this bake no longer makes (an AVIF that lost to its PNG) leaves ./art.
    for (const f of readdirSync(OUT)) if (!files.has(f) && f !== 'README.md') rmSync(join(OUT, f));
    const over = [...files].filter(([, buf]) => buf.length > BUDGET).map(([f]) => f);
    if (over.length) console.error(`✗ art: over the ${BUDGET / 1024} KB budget: ${over.join(', ')}`);
    for (const [f, buf] of files) console.log(`${f.padEnd(28)} ${(buf.length / 1024).toFixed(1)} KB`);
}
