/*
 * How every scene puts dots on a canvas. Never one fillStyle per dot: that is
 * what saturates a CPU without GPU raster (a software-GL desktop, a VM, a
 * blocklisted driver). Dots are sorted into at most 16 colour buckets, and
 * each bucket is one fillStyle and a run of fillRects. Measured on SwiftShader
 * against the prototype's per-dot strings, 4,200 dots: 1.1 ms of main thread a
 * frame instead of 18, and less GPU-process CPU than a path per bucket (which
 * costs 4x there) or an ImageData write (9.5 ms).
 *
 * The canvas is CPU-backed (willReadFrequently) on a layer of its own. A
 * GPU canvas sends every rect to the GPU process, which software GL turns into
 * seconds of backlog: the portrait's 4.5 s of motion cost 102 s of GPU-process
 * CPU that way, against 18 s here. On its own layer a frame repaints only the
 * canvas, not the notes drawn over it.
 *
 * Colours come from the palette data in /tokens, never from hexes here.
 */
import { darkPalette, lightPalette } from '../tokens/palette';

export const MAX_BUCKETS = 16;

export type Rgb = readonly [number, number, number];

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

type Palette = Readonly<Record<string, string | undefined>>;
/** The first of `keys` the palette has: a 2.0 token where it exists, the 1.x one it replaces otherwise. */
const pick = (p: Palette, ...keys: string[]): Rgb => hex(keys.map((k) => p[k]).find(Boolean) ?? '#808080');

export interface Inks {
    /** The dots at rest: burnt on a light ground, paper on a dark one. */
    base: Rgb;
    /** The "real" heat: the brand orange. */
    heat: Rgb;
    /** Marks and small accents: ember on light, orange on dark. */
    mark: Rgb;
}

/** A scene's inks for its ground, read from the palette. */
export function inks(dark: boolean): Inks {
    const p: Palette = dark ? darkPalette : lightPalette;
    return {
        base: dark ? pick(p, 'paper', 'foreground') : pick(p, 'burnt', 'foreground'),
        heat: pick(p, 'orange', 'brand'),
        mark: pick(p, 'ember', 'accentDisplay'),
    };
}

/** Any CSS colour as [r, g, b, alpha 0-1], through the canvas's own parser. */
export function parseColour(css: string): [number, number, number, number] {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return [128, 128, 128, 1];
    c.fillStyle = css;
    const v = String(c.fillStyle);
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
    const n = v.match(/[\d.]+/g)?.map(Number) ?? [];
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
}

export const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

export const rgba = (c: Rgb, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;

/**
 * Squares to draw this frame, grouped by bucket. `add` as many as were
 * reserved, then `draw` with one style per bucket: a counting sort, then one
 * fillStyle per bucket that has squares.
 */
export class Batch {
    private n = 0;
    private bucket: Uint8Array;
    private xs: Float32Array;
    private ys: Float32Array;
    private ss: Float32Array;
    private order: Uint32Array;
    private counts = new Uint32Array(MAX_BUCKETS + 1);

    constructor(capacity: number) {
        this.bucket = new Uint8Array(capacity);
        this.xs = new Float32Array(capacity);
        this.ys = new Float32Array(capacity);
        this.ss = new Float32Array(capacity);
        this.order = new Uint32Array(capacity);
    }

    get size() {
        return this.n;
    }

    reset() {
        this.n = 0;
    }

    /** A square of side `s` centred on (x, y), in bucket `b`. */
    add(b: number, x: number, y: number, s: number) {
        const i = this.n++;
        this.bucket[i] = b;
        this.xs[i] = x - s / 2;
        this.ys[i] = y - s / 2;
        this.ss[i] = s;
    }

    /** Fill every square, snapped to device pixels so a dot is a crisp square, not a blur. */
    draw(ctx: CanvasRenderingContext2D, styles: readonly string[], dpr = 1) {
        const { n, bucket, order, counts } = this;
        counts.fill(0);
        for (let i = 0; i < n; i++) counts[bucket[i]! + 1]!++;
        for (let b = 1; b <= MAX_BUCKETS; b++) counts[b]! += counts[b - 1]!;
        const at = counts.slice(0, MAX_BUCKETS);
        for (let i = 0; i < n; i++) order[at[bucket[i]!]!++] = i;
        for (let b = 0; b < MAX_BUCKETS; b++) {
            const from = counts[b]!;
            const to = counts[b + 1]!;
            if (from === to || !styles[b]) continue;
            ctx.fillStyle = styles[b]!;
            for (let j = from; j < to; j++) {
                const i = order[j]!;
                const s = Math.max(1, Math.round(this.ss[i]! * dpr)) / dpr;
                ctx.fillRect(Math.round(this.xs[i]! * dpr) / dpr, Math.round(this.ys[i]! * dpr) / dpr, s, s);
            }
        }
    }
}

/**
 * A canvas sized to its box at up to 2x, kept in step by a ResizeObserver.
 * Drawing happens in CSS pixels.
 */
export class Surface {
    readonly ctx: CanvasRenderingContext2D;
    width = 0;
    height = 0;
    /** Device pixels per CSS pixel, at most 2. */
    dpr = 1;
    private ro: ResizeObserver | null;

    constructor(
        readonly canvas: HTMLCanvasElement,
        private onResize: () => void
    ) {
        this.ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true })!;
        canvas.style.willChange = 'transform';
        this.fit();
        this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.fit() && this.onResize()) : null;
        this.ro?.observe(canvas);
    }

    /** Match the box; true when the size changed. */
    fit(): boolean {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (!w || !h || (w === this.width && h === this.height)) return false;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.dpr = dpr;
        this.width = w;
        this.height = h;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return true;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    dispose() {
        this.ro?.disconnect();
    }
}
