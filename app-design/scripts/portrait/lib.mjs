/*
 * The portrait pipeline's steps, pure: nothing here reads or writes a file, so
 * scripts/check-portrait.mjs can run each one alone. build.mjs is the command.
 *
 * The source is one square photograph with the person's matte as its alpha.
 * From it: the light on a grid (levels set inside the figure, local contrast
 * lifted so the eyes, mouth and jaw carry), a blue-noise stipple of it for
 * ParticlePortrait, the posters, the ink grid HalftoneCanvas screens, the
 * deck's 45° screen of that ink, and the dot layer HalftoneSphere shows.
 * Every number comes from the source's pixels and the seed, in a fixed order,
 * so the same source and seed give the same files.
 */

const { min, max, floor, ceil, round, sqrt, exp, hypot, SQRT1_2, PI } = Math;

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};

// ── Planes ───────────────────────────────────────────────────────────────────

/** Luminance (Rec. 709 weights on the encoded values, as a print reads them) and alpha, 0..1, from RGBA bytes. */
export function planes(rgba, w) {
    const lum = new Float32Array(w * w);
    const alpha = new Float32Array(w * w);
    for (let i = 0; i < w * w; i++) {
        lum[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
        alpha[i] = rgba[i * 4 + 3] / 255;
    }
    return { lum, alpha };
}

/** A w×w plane averaged down to n×n, each cell the exact share of the source it covers. */
export function resample(src, w, n) {
    const s = w / n;
    const spans = [];
    for (let i = 0; i < n; i++) {
        const [a, b] = [i * s, (i + 1) * s];
        const span = [];
        for (let k = floor(a); k < ceil(b); k++) {
            const part = min(b, k + 1) - max(a, k);
            if (part > 0) span.push([k, part / s]);
        }
        spans.push(span);
    }
    const rows = new Float32Array(w * n);
    for (let y = 0; y < w; y++) {
        for (let i = 0; i < n; i++) {
            let v = 0;
            for (const [k, part] of spans[i]) v += src[y * w + k] * part;
            rows[y * n + i] = v;
        }
    }
    const out = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
        for (let x = 0; x < n; x++) {
            let v = 0;
            for (const [k, part] of spans[j]) v += rows[k * n + x] * part;
            out[j * n + x] = v;
        }
    }
    return out;
}

/** A gaussian blur of an n×n plane, sigma in cells, the edge held. */
export function blur(src, n, sigma) {
    const r = ceil(sigma * 3);
    const k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) {
        const v = exp(-(i * i) / (2 * sigma * sigma));
        k.push(v);
        sum += v;
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const tmp = new Float32Array(n * n);
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            let v = 0;
            for (let i = -r; i <= r; i++) v += src[y * n + min(n - 1, max(0, x + i))] * k[i + r];
            tmp[y * n + x] = v;
        }
    }
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            let v = 0;
            for (let i = -r; i <= r; i++) v += tmp[min(n - 1, max(0, y + i)) * n + x] * k[i + r];
            out[y * n + x] = v;
        }
    }
    return out;
}

/** A blur that reads only the figure, so the backdrop never bleeds into its edge. */
function figureBlur(v, mask, n, sigma) {
    const a = blur(
        v.map((x, i) => x * mask[i]),
        n,
        sigma
    );
    const b = blur(mask, n, sigma);
    return a.map((x, i) => (b[i] > 1e-6 ? x / b[i] : 0));
}

// ── Light ────────────────────────────────────────────────────────────────────

/**
 * The picture's light on an n×n grid over the square, 0 (dark) to 1 (lit), and NaN off the figure:
 * the luminance under the matte, its local contrast lifted (`detail` times the difference from a blur of
 * `detailSigma` of the square), then levels from the figure's own `black` and `white` percentiles and a
 * `gamma`.
 */
export function lightGrid(p, w, n, o) {
    const a = resample(p.alpha, w, n);
    const la = resample(
        p.lum.map((v, i) => v * p.alpha[i]),
        w,
        n
    );
    const mask = a.map((v) => (v >= 0.5 ? 1 : 0));
    const lum = la.map((v, i) => (a[i] > 1e-6 ? v / a[i] : 0));
    const base = figureBlur(lum, mask, n, o.detailSigma * n);
    const lifted = lum.map((v, i) => v + o.detail * (v - base[i]));
    const inside = [];
    for (let i = 0; i < n * n; i++) if (mask[i]) inside.push(lifted[i]);
    if (!inside.length) throw new Error('portrait: the matte covers nothing');
    inside.sort((x, y) => x - y);
    const lo = inside[floor((inside.length - 1) * o.black)];
    const hi = inside[floor((inside.length - 1) * o.white)];
    const out = new Float32Array(n * n).fill(NaN);
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const k = j * n + i;
            if (!mask[k]) continue;
            out[k] = clamp((lifted[k] - lo) / (hi - lo || 1)) ** o.gamma;
        }
    }
    return out;
}

/** Light at (u, v) of an n grid: bilinear inside the figure, the nearest sample at its edge, NaN off it. */
export function lightAt(light, n, u, v) {
    const x = clamp(u * n - 0.5, 0, n - 1.001);
    const y = clamp(v * n - 0.5, 0, n - 1.001);
    const [x0, y0] = [floor(x), floor(y)];
    const [fx, fy] = [x - x0, y - y0];
    const c = [light[y0 * n + x0], light[y0 * n + x0 + 1], light[(y0 + 1) * n + x0], light[(y0 + 1) * n + x0 + 1]];
    if (c.some(Number.isNaN)) return light[round(y) * n + round(x)];
    return (c[0] * (1 - fx) + c[1] * fx) * (1 - fy) + (c[2] * (1 - fx) + c[3] * fx) * fy;
}

/** Ink (1 - light, 0 off the figure) averaged down to an `size` grid, as bytes: the tone HalftoneCanvas screens. */
export function inkTone(light, n, size) {
    const ink = light.map((v) => (Number.isNaN(v) ? 0 : 1 - v));
    return Uint8Array.from(resample(ink, n, size), (v) => round(clamp(v) * 255));
}

// ── Stipple ──────────────────────────────────────────────────────────────────
// Dots by density, not a screen, so nothing beats against the pixel grid. One progressive blue-noise
// sequence covers the figure: every prefix of it is evenly spread. A dot is drawn where its place in the
// sequence comes before the tone there, so its neighbourhood shows the first few of the sequence where the
// picture is light and most of it where it is dark: an even stipple whose density is the tone. Paper takes
// the ink as its tone, a dark ground the light, so one sequence gives a positive on both.

/** A seeded LCG, the same in every engine. */
export function seeded(seed) {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/**
 * How much of the sequence a tone draws: a little even in the lightest places, so the figure keeps its
 * outline on either ground, thinning on both grounds from `fade[0]` of the height to nothing at `fade[1]`,
 * so the face is the fullest thing in the picture and the shoulders scatter away. `curve` is the tone's
 * exponent on paper and on a dark ground: steeper on dark, so the lit face stands out from the clothes.
 */
const share = (tone, y, onDark, { fade, curve }) => (0.035 + 0.965 * tone ** curve[onDark ? 1 : 0]) * (1 - smoothstep(fade[0], fade[1], y));

/**
 * The stipple: `dots` on each ground from a sequence of `sequence` places, stored once with the grounds
 * that draw it (1 paper, 2 dark, 3 both), sorted top to bottom. Returns the dots ([x, y, light, grounds]),
 * the spacing at full density, and a `draw(onDark, of)` for the posters. With `rim` ({ width, paper, dark,
 * until }), the figure's edge down to `until` of the height draws at least `paper` or `dark` as its tone, so
 * a lit cheek keeps its outline on paper and a shadowed one on a dark ground.
 */
export function stipple(light, n, { seed, sequence: SEQUENCE, dots: DOTS, tries, fade, curve, rim }) {
    const rand = seeded(seed);
    const inside = [];
    for (let k = 0; k < n * n; k++) if (!Number.isNaN(light[k])) inside.push(k);
    // The figure's edge, 1 on it and 0 a `rim.width` of the square inside it, down to `rim.until` of the height.
    const mask = light.map((v) => (Number.isNaN(v) ? 0 : 1));
    const edge = rim ? blur(mask, n, rim.width * n).map((b, k) => (mask[k] ? clamp((1 - b) * 2) : 0)) : null;
    const edgeAt = (x, y) => (edge ? edge[min(n - 1, floor(y * n)) * n + min(n - 1, floor(x * n))] * (1 - smoothstep(rim.until - 0.06, rim.until, y)) : 0);
    const pitch = sqrt(inside.length / (n * n) / SEQUENCE);
    // Mitchell's best candidate, progressively: each new dot is the farthest of a few random tries from all before it.
    const g = ceil(1 / pitch);
    const cells = Array.from({ length: g * g }, () => []);
    const nearest = (x, y) => {
        const cx = min(g - 1, floor(x * g));
        const cy = min(g - 1, floor(y * g));
        let best = Infinity;
        for (let r = 0; r < g; r++) {
            if (best < ((r - 1) / g) ** 2) break;
            for (let j = cy - r; j <= cy + r; j++) {
                if (j < 0 || j >= g) continue;
                for (let i = cx - r; i <= cx + r; i++) {
                    if (i < 0 || i >= g || (Math.abs(i - cx) !== r && Math.abs(j - cy) !== r)) continue;
                    for (const [px, py] of cells[j * g + i]) best = min(best, (px - x) ** 2 + (py - y) ** 2);
                }
            }
        }
        return best;
    };
    const seq = [];
    for (let s = 0; s < SEQUENCE; s++) {
        let pick = null;
        let far = -1;
        for (let t = 0; t < tries; t++) {
            const k = inside[floor(rand() * inside.length)];
            const x = ((k % n) + rand()) / n;
            const y = (floor(k / n) + rand()) / n;
            const d = nearest(x, y);
            if (d > far) [far, pick] = [d, [x, y]];
        }
        seq.push(pick);
        cells[min(g - 1, floor(pick[1] * g)) * g + min(g - 1, floor(pick[0] * g))].push(pick);
    }
    const ofGround = (onDark, of, k) => {
        const out = [];
        seq.forEach(([x, y], i) => {
            const l = lightAt(light, n, x, y);
            const tone = max(onDark ? l : 1 - l, edgeAt(x, y) * (rim ? rim[onDark ? 'dark' : 'paper'] : 0));
            if ((i + 0.5) / SEQUENCE < of * min(1, k * share(tone, y, onDark, { fade, curve }))) out.push([x, y, l]);
        });
        return out;
    };
    // Each ground has its own scale, found by bisection, so each draws `dots`.
    const scale = [false, true].map((onDark) => {
        let [lo, hi] = [0.1, 10];
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (ofGround(onDark, 1, mid).length < DOTS) lo = mid;
            else hi = mid;
        }
        return hi;
    });
    const draw = (onDark, of = 1) => ofGround(onDark, of, scale[onDark ? 1 : 0]);
    const both = new Map();
    for (const [ground, onDark] of [
        [1, false],
        [2, true],
    ]) {
        for (const d of draw(onDark)) {
            const key = `${d[0]},${d[1]}`;
            both.set(key, { d, grounds: (both.get(key)?.grounds ?? 0) | ground });
        }
    }
    const dots = [...both.values()].sort((a, b) => byPlace(a.d, b.d)).map(({ d, grounds }) => [d[0], d[1], d[2], grounds]);
    return { dots, pitch, draw };
}

/** Top to bottom, then left to right, as the packed form stores them, so the order survives the packing. */
const byPlace = (a, b) => round(clamp(a[1]) * 65535) - round(clamp(b[1]) * 65535) || round(clamp(a[0]) * 65535) - round(clamp(b[0]) * 65535);

/** Points in the packed form every point set in ./motion travels in: per point a Uint16 x and y (little-endian, 0..65535 across the square), then a Uint8 tone each. */
export function pack(points) {
    const out = new Uint8Array(points.length * 5);
    const view = new DataView(out.buffer);
    points.forEach(([x, y, tone], i) => {
        view.setUint16(i * 4, round(clamp(x) * 65535), true);
        view.setUint16(i * 4 + 2, round(clamp(y) * 65535), true);
        out[points.length * 4 + i] = round(clamp(tone) * 255);
    });
    return out;
}

/** The settled frame at a fraction `of` of the stipple's density, each dot a square in a 1000-unit box, left to right along each line, each move relative to the last. */
export function poster(st, onDark, of = 0.26) {
    const s = round((0.62 * st.pitch * 1000) / sqrt(of));
    let d = '';
    let [px, py] = [0, 0];
    for (const [x, y] of st.draw(onDark, of).sort((a, b) => round(a[1] * 125) - round(b[1] * 125) || a[0] - b[0])) {
        const [nx, ny] = [round(x * 1000 - s / 2), round(y * 1000 - s / 2)];
        d += `m${nx - px} ${ny - py}h${s}v${s}h-${s}z`;
        [px, py] = [nx, ny];
    }
    return 'M' + d.slice(1);
}

// ── Screens ──────────────────────────────────────────────────────────────────

/** Bilinear ink at (u, v) of a byte tone `size` across, 0..1. */
export function inkAt(tone, size, u, v) {
    const x = clamp(u * size - 0.5, 0, size - 1.001);
    const y = clamp(v * size - 0.5, 0, size - 1.001);
    const [x0, y0] = [floor(x), floor(y)];
    const [fx, fy] = [x - x0, y - y0];
    const a = tone[y0 * size + x0] * (1 - fx) + tone[y0 * size + x0 + 1] * fx;
    const b = tone[(y0 + 1) * size + x0] * (1 - fx) + tone[(y0 + 1) * size + x0 + 1] * fx;
    return (a * (1 - fy) + b * fy) / 255;
}

/** The tone on a 45° screen `across` dots wide: one dot where the ink is at least `least`, keeping its ink. */
export function deckScreen(tone, size, across, least = 0.08) {
    const pitch = 1 / across;
    const span = ceil(0.75 / pitch) + 1;
    const out = [];
    for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
            const x = 0.5 + (i - j) * pitch * SQRT1_2;
            const y = 0.5 + (i + j) * pitch * SQRT1_2;
            if (x < 0 || y < 0 || x > 1 || y > 1) continue;
            const k = inkAt(tone, size, x, y);
            if (k >= least) out.push([x, y, k]);
        }
    }
    return out.sort(byPlace);
}

/**
 * HalftoneSphere's dot layer: the tone on a 45° screen `across` dots wide, masked to the ball, each dot's
 * area its ink (overlapping in the shadows), drawn 4× over and averaged down. Alpha bytes, `px` square.
 */
export function sphereLayer(tone, size, px, across, least = 0.1) {
    const ss = 4;
    const W = px * ss;
    const hit = new Uint8Array(W * W);
    const pitch = px / across;
    const c = px / 2;
    const span = ceil((px * 0.75) / pitch) + 1;
    for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
            const x = c + (i - j) * pitch * SQRT1_2;
            const y = c + (i + j) * pitch * SQRT1_2;
            if (x < 0 || y < 0 || x >= px || y >= px || hypot(x - c, y - c) > c - pitch * 0.6) continue;
            const k = inkAt(tone, size, x / px, y / px);
            if (k < least) continue;
            const r = pitch * sqrt(k / PI) * 1.1 * ss;
            const [X, Y] = [x * ss, y * ss];
            for (let py = max(0, floor(Y - r)); py <= min(W - 1, ceil(Y + r)); py++) {
                for (let qx = max(0, floor(X - r)); qx <= min(W - 1, ceil(X + r)); qx++) {
                    if ((qx + 0.5 - X) ** 2 + (py + 0.5 - Y) ** 2 <= r * r) hit[py * W + qx] = 1;
                }
            }
        }
    }
    const alpha = new Uint8Array(px * px);
    for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
            let s = 0;
            for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) s += hit[(y * ss + dy) * W + x * ss + dx];
            alpha[y * px + x] = round((s * 255) / (ss * ss));
        }
    }
    return alpha;
}
