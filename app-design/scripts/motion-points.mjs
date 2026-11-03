#!/usr/bin/env node
/*
 * Writes the figure ParticlePortrait draws by default: a head-and-shoulders bust
 * made here from shapes, lit, and screened to dots. No photograph or artwork goes
 * in. A head, neck and shoulders are signed distance fields (ellipsoids, spheres
 * and capsules, blended), ray-marched from the front under a key light, a fill and
 * a rim; the hair, eyes and shirt are materials. So the picture is ours to ship
 * under the package's licence, and anyone can change it here.
 *
 * Two files:
 * - src/motion/portrait-points.data.ts: every place of a 45° screen ACROSS dots
 *   across that falls inside the figure, thinning out below the shoulders. Each
 *   keeps the ink the picture has there (0 lit to 1 dark), so on paper a dot is
 *   as large as its spot is dark, and on a dark ground as large as it is light:
 *   the picture is a positive on both. Packed the way every point set in ./motion
 *   travels: per dot a Uint16 x and y (0..65535 across the square), then a Uint8
 *   tone each, as base64 in a module the scene imports once the page is idle.
 * - src/motion/portrait-poster.ts: the settled frame, coarse, as two SVG paths of
 *   squares (ink on paper, light on a dark ground), the still the page shows
 *   without script and under reduced motion before the canvas draws; and the
 *   named places on the figure that callouts point at.
 *
 * Deterministic: the same shapes always give the same files.
 *   node scripts/motion-points.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACROSS = 108; // dots across the square: about 4,100 in the figure, as many as the prototype's
const POSTER_ACROSS = 48;
const GRID = 360; // the tone is rendered on this grid and sampled by the screen

const { abs, min, max, hypot, sin, cos, SQRT1_2 } = Math;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

// ── Shapes ───────────────────────────────────────────────────────────────────
// Space: x right, y up, z toward the viewer; the square spans -1..1 in x and y.

function smin(a, b, k) {
    const h = max(k - abs(a - b), 0) / k;
    return min(a, b) - h * h * k * 0.25;
}
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid(x, y, z, rx, ry, rz) {
    const k0 = hypot(x / rx, y / ry, z / rz);
    const k1 = hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
    return (k0 * (k0 - 1)) / (k1 || 1e-9);
}
const sphere = (x, y, z, cx, cy, cz, r) => hypot(x - cx, y - cy, z - cz) - r;
function capsule(x, y, z, ax, ay, az, bx, by, bz, r) {
    const [px, py, pz, ux, uy, uz] = [x - ax, y - ay, z - az, bx - ax, by - ay, bz - az];
    const h = clamp((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz));
    return hypot(px - ux * h, py - uy * h, pz - uz * h) - r;
}

// The head turns a little toward the light and nods; the body turns less. The head is
// modelled in its own units about the neck top and scaled into place.
const TURN = 0.32;
const NOD = 0.06;
const BODY_TURN = 0.12;
const HEAD_SCALE = 1.16;
const NECK_TOP = -0.13;
const [ct, st, cn, sn, cb, sb] = [cos(TURN), sin(TURN), cos(NOD), sin(NOD), cos(BODY_TURN), sin(BODY_TURN)];

const SKIN = 0;
const HAIR = 1;
const CLOTH = 2;
const LIP = 3;
const EYE = 4;
const ALBEDO = [0.86, 0.2, 0.8, 0.62, 0.12];

/** A point of the square in head units: the inverse of `fromHead`. */
function toHead(x, y, z) {
    const X = x / HEAD_SCALE;
    const Y = (y - NECK_TOP) / HEAD_SCALE - 0.1;
    const Z = z / HEAD_SCALE;
    const x1 = ct * X + st * Z;
    const z1 = -st * X + ct * Z;
    return [x1, cn * Y - sn * z1 + 0.1, sn * Y + cn * z1];
}
/** A point in head units as a place in the unit square (u right, v down). */
function fromHead(hx, hy, hz) {
    const y1 = hy - 0.1;
    const Y = cn * y1 + sn * hz;
    const z1 = -sn * y1 + cn * hz;
    const X = ct * hx - st * z1;
    return [(X * HEAD_SCALE) / 2 + 0.5, 0.5 - ((Y + 0.1) * HEAD_SCALE + NECK_TOP) / 2];
}

/** Distance to the head, and its material at that point. */
function head(x, y, z) {
    const [X, Y, Z] = toHead(x, y, z);
    let d = smin(ellipsoid(X, Y - 0.42, Z + 0.01, 0.285, 0.34, 0.325), ellipsoid(X, Y - 0.26, Z - 0.05, 0.21, 0.27, 0.25), 0.1);
    d = smin(d, sphere(X, Y, Z, 0, 0.065, 0.14, 0.085), 0.07); // chin
    d = smin(d, min(sphere(X, Y, Z, -0.13, 0.13, 0.03, 0.075), sphere(X, Y, Z, 0.13, 0.13, 0.03, 0.075)), 0.09); // jaw
    d = smin(d, min(sphere(X, Y, Z, -0.135, 0.27, 0.16, 0.07), sphere(X, Y, Z, 0.135, 0.27, 0.16, 0.07)), 0.06); // cheekbones
    d = smin(d, capsule(X, Y, Z, -0.15, 0.385, 0.215, 0.15, 0.385, 0.215, 0.04), 0.06); // brow
    d = smax(d, -min(sphere(X, Y, Z, -0.095, 0.33, 0.31, 0.06), sphere(X, Y, Z, 0.095, 0.33, 0.31, 0.06)), 0.05); // eye sockets
    const nose = smin(capsule(X, Y, Z, 0, 0.35, 0.265, 0, 0.215, 0.33, 0.032), sphere(X, Y, Z, 0, 0.215, 0.315, 0.04), 0.03);
    d = smin(d, smin(nose, min(sphere(X, Y, Z, -0.04, 0.205, 0.275, 0.03), sphere(X, Y, Z, 0.04, 0.205, 0.275, 0.03)), 0.02), 0.035);
    const lips = min(ellipsoid(X, Y - 0.152, Z - 0.262, 0.07, 0.02, 0.035), ellipsoid(X, Y - 0.118, Z - 0.255, 0.06, 0.022, 0.035));
    d = smin(d, lips, 0.02);
    d = smax(d, -capsule(X, Y, Z, -0.065, 0.135, 0.3, 0.065, 0.135, 0.3, 0.006), 0.01); // the mouth's line
    d = smin(d, min(ellipsoid(X + 0.285, Y - 0.29, Z + 0.02, 0.035, 0.075, 0.05), ellipsoid(X - 0.285, Y - 0.29, Z + 0.02, 0.035, 0.075, 0.05)), 0.03); // ears
    // Hair: a cap over the skull, cut at a hairline that is low at the sides, with its volume swept to one side.
    const hairline = 0.24 + 0.23 * smoothstep(-0.05, 0.25, Z) + 0.02 * cos(X * 8) + 0.012 * sin(X * 31);
    let hair = smax(ellipsoid(X, Y - 0.47, Z + 0.035, 0.315, 0.35, 0.36), hairline - Y, 0.04);
    hair = smin(hair, ellipsoid(X + 0.07, Y - 0.7, Z, 0.2, 0.1, 0.24), 0.1);
    // The eyes are a material, not a shape: dark almonds in the sockets.
    const ex = abs(X) - 0.095;
    const eye = Z > 0.15 && (ex / 0.046) ** 2 + ((Y - 0.326) / (0.019 * (1 - (0.35 * ex) / 0.046))) ** 2 < 1;
    const mat = hair < d + 0.004 ? HAIR : eye ? EYE : lips < d + 0.006 ? LIP : SKIN;
    return [smin(d, hair, 0.015) * HEAD_SCALE, mat];
}

/** Distance to the neck and shoulders, and the material there. */
function body(x, y, z) {
    const X = cb * x + sb * z;
    const Z = -sb * x + cb * z;
    const neck = capsule(X, y, Z, 0, -0.42, -0.03, 0, 0, -0.01, 0.15);
    const traps = smin(capsule(X, y, Z, -0.05, -0.24, -0.07, -0.56, -0.42, -0.06, 0.1), capsule(X, y, Z, 0.05, -0.24, -0.07, 0.56, -0.42, -0.06, 0.1), 0.05);
    const delts = min(sphere(X, y, Z, -0.62, -0.55, -0.04, 0.15), sphere(X, y, Z, 0.62, -0.55, -0.04, 0.15));
    const shirt = smin(smin(ellipsoid(X, y + 0.84, Z + 0.06, 0.74, 0.5, 0.3), traps, 0.16), delts, 0.14);
    return [smin(shirt, neck, 0.02), neck < shirt - 0.003 ? SKIN : CLOTH];
}

function sdf(x, y, z) {
    return smin(head(x, y, z)[0], body(x, y, z)[0], 0.04);
}
function material(x, y, z) {
    const h = head(x, y, z);
    const b = body(x, y, z);
    return h[0] < b[0] ? h[1] : b[1];
}

// ── Light ────────────────────────────────────────────────────────────────────

const unit = (a, b, c) => [a / hypot(a, b, c), b / hypot(a, b, c), c / hypot(a, b, c)];
const KEY = unit(-0.6, 0.55, 0.62); // from the upper left, in front
const FILL = unit(0.75, 0.05, 0.45);
const RIM = unit(0.7, 0.35, -0.55); // from behind on the right: it draws the far edge
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normal(x, y, z) {
    const e = 0.0015;
    return unit(sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e));
}
/** How much of the key light reaches a point: a soft shadow marched toward it. */
function shadow(x, y, z, l) {
    let lit = 1;
    for (let i = 0, t = 0.02; i < 40 && t < 2.5; i++) {
        const h = sdf(x + l[0] * t, y + l[1] * t, z + l[2] * t);
        if (h < 0.0008) return 0;
        lit = min(lit, (9 * h) / t);
        t += clamp(h, 0.01, 0.15);
    }
    return clamp(lit);
}
/** Ambient occlusion: how closed in a point is, from five steps along its normal. */
function occlusion(x, y, z, n) {
    let occ = 0;
    for (let i = 1, w = 1; i <= 5; i++, w *= 0.7) occ += (0.02 * i - sdf(x + n[0] * 0.02 * i, y + n[1] * 0.02 * i, z + n[2] * 0.02 * i)) * w;
    return clamp(1 - 4 * occ);
}

/** The lit bust on a grid over the unit square: light 0..1, and NaN off the figure. */
function render(n) {
    const light = new Float32Array(n * n).fill(NaN);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const x = ((i + 0.5) / n - 0.5) * 2;
            const y = (0.5 - (j + 0.5) / n) * 2;
            let z = 1.5;
            let d = 1;
            for (let s = 0; s < 120 && z > -1.5 && d >= 0.0006; s++) z -= d = sdf(x, y, z);
            if (d >= 0.0006) continue;
            const nn = normal(x, y, z);
            const occ = occlusion(x, y, z, nn);
            const key = max(0, dot(nn, KEY));
            const lit = key > 0 ? shadow(x + nn[0] * 0.004, y + nn[1] * 0.004, z + nn[2] * 0.004, KEY) : 0;
            const rim = (1 - max(0, nn[2])) ** 3 * max(0, dot(nn, RIM) + 0.3);
            const m = material(x, y, z);
            // Hair carries a strand texture, so it reads as hair and not as a cap.
            const albedo = ALBEDO[m] * (m === HAIR ? 0.8 + 0.2 * (1 + sin(x * 38 + y * 14 + 2.2 * sin(y * 17 + x * 5))) : 1);
            // The light falls off down the body, so the face is the brightest thing in the picture.
            const falloff = 1 - 0.4 * smoothstep(-0.3, -1, y);
            light[j * n + i] = clamp(falloff * (albedo * (0.1 * occ + key * lit + 0.12 * max(0, dot(nn, FILL)) * occ) + 0.4 * rim * occ));
        }
    }
    return light;
}

// ── Screen ───────────────────────────────────────────────────────────────────

const light = render(GRID);
/** Light at (u, v): bilinear inside the figure, the nearest sample at its edge, NaN off it. */
function lightAt(u, v) {
    const x = clamp(u * GRID - 0.5, 0, GRID - 1.001);
    const y = clamp(v * GRID - 0.5, 0, GRID - 1.001);
    const [x0, y0] = [Math.floor(x), Math.floor(y)];
    const [fx, fy] = [x - x0, y - y0];
    const c = [light[y0 * GRID + x0], light[y0 * GRID + x0 + 1], light[(y0 + 1) * GRID + x0], light[(y0 + 1) * GRID + x0 + 1]];
    if (c.some(Number.isNaN)) return light[Math.round(y) * GRID + Math.round(x)];
    return (c[0] * (1 - fx) + c[1] * fx) * (1 - fy) + (c[2] * (1 - fx) + c[3] * fx) * fy;
}

/** A fixed scatter in 0..1 for lattice place (i, j). */
function scatter(i, j) {
    let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** The 45° screen `across` dots wide: [x, y, light] inside the figure, top to bottom, then left to right. */
function screen(across) {
    const pitch = 1 / across;
    const span = Math.ceil(0.75 / pitch) + 1;
    const out = [];
    for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
            const x = 0.5 + (i - j) * pitch * SQRT1_2;
            const y = 0.5 + (i + j) * pitch * SQRT1_2;
            if (x < 0 || y < 0 || x > 1 || y > 1) continue;
            const l = lightAt(x, y);
            if (Number.isNaN(l)) continue;
            // Below the shoulders the figure scatters away, so it has no hard bottom edge.
            if (1 - smoothstep(0.76, 1, y) <= scatter(i, j)) continue;
            out.push([x, y, l]);
        }
    }
    return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

const dots = screen(ACROSS);
const packed = Buffer.alloc(dots.length * 5);
dots.forEach(([x, y, l], n) => {
    packed.writeUInt16LE(Math.round(x * 65535), n * 4);
    packed.writeUInt16LE(Math.round(y * 65535), n * 4 + 2);
    packed[dots.length * 4 + n] = Math.round((1 - l) * 255);
});
writeFileSync(
    join(pkg, 'src/motion/portrait-points.data.ts'),
    `// Generated by scripts/motion-points.mjs. Do not edit: run the script.\n\n` +
        `/** The bust as ${dots.length} dots on a 45° screen ${ACROSS} dots across: Uint16 x, y pairs (little-endian, 0..65535 across the square), then a Uint8 ink each. */\n` +
        `export const PORTRAIT_POINTS_B64 =\n    '${packed.toString('base64')}';\n\n` +
        `/** The screen's pitch, as a fraction of the square: a full-tone dot is about this wide. */\n` +
        `export const PORTRAIT_PITCH = ${+(1 / ACROSS).toFixed(6)};\n`
);

// The posters: a coarser screen, each dot a square as wide as ParticlePortrait draws it (0.76 of the
// pitch at full tone), in a 1000-unit square, moving relatively from one square to the next.
function poster(tone) {
    const size = 1000 / POSTER_ACROSS;
    let d = '';
    let [px, py] = [0, 0];
    for (const [x, y, l] of screen(POSTER_ACROSS)) {
        const k = tone(l);
        if (k < 0.08) continue;
        const s = Math.max(2, Math.round(Math.sqrt(k) * size * 0.76));
        const [nx, ny] = [Math.round(x * 1000 - s / 2), Math.round(y * 1000 - s / 2)];
        d += `m${nx - px} ${ny - py}h${s}v${s}h-${s}z`;
        [px, py] = [nx, ny];
    }
    return 'M' + d.slice(1);
}
const onPaper = poster((l) => 1 - l);
const onDark = poster((l) => l);

// Named places: on the head projected from its own units, so they follow the shapes; on the body, in the square.
const anchors = {
    hair: fromHead(0.06, 0.72, 0.2),
    eye: fromHead(-0.095, 0.326, 0.3),
    mouth: fromHead(0, 0.135, 0.3),
    ear: fromHead(0.29, 0.29, -0.02),
    chin: fromHead(0, 0.03, 0.18),
    neck: [0.52, 0.65],
    shoulder: [0.775, 0.735],
    chest: [0.45, 0.86],
};
writeFileSync(
    join(pkg, 'src/motion/portrait-poster.ts'),
    `// Generated by scripts/motion-points.mjs. Do not edit: run the script.\n\n` +
        `/** The bust's settled frame, coarse, ink on paper: one path of squares in a 0 0 1000 1000 box. */\n` +
        `export const PORTRAIT_POSTER = '${onPaper}';\n\n` +
        `/** The same frame on a dark ground, where each square is as large as its spot is light. */\n` +
        `export const PORTRAIT_POSTER_DARK = '${onDark}';\n\n` +
        `/** Named places on the bust, in its unit square, for callouts: where a label's + lands. */\n` +
        `export const PORTRAIT_ANCHORS = {\n` +
        Object.entries(anchors)
            .map(([k, v]) => `    ${k}: [${v.map((n) => +n.toFixed(3)).join(', ')}],\n`)
            .join('') +
        `} as const satisfies Record<string, readonly [number, number]>;\n`
);
console.log(`✓ portrait: ${dots.length} dots, ${packed.length} bytes; posters ${onPaper.length} + ${onDark.length} bytes`);
