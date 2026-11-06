import { useEffect, useRef, type CSSProperties } from 'react';

import { cn } from '../lib/cn';
import { lightPalette } from '../tokens/palette';
import { finePointer, prefersStill, useMotionSetting } from './env';
import { parseColour, type Surface } from './paint';
import { mountScene, type Mounted } from './scene';

/*
 * A two-tone dithered picture that is a plain image at rest. Under a fine
 * pointer the dither comes alive where the pointer passes: the picture there
 * goes coarse and its ordered screen crawls, then the trail fades and in about
 * a second the image is exactly the still again, and nothing runs. Never a
 * loop: the prototype's version boiled every frame in WebGL for as long as the
 * page was open, under reduced motion too.
 *
 * Without a fine pointer, under reduced motion and without script it is only
 * the image. The live part is canvas 2D on an 8 px noise grid (measured at
 * 4-7 ms a frame on software GL, against 25 ms for per-pixel noise) and it
 * starts on the first pointer that enters, not before.
 */

export interface DitherImageProps {
    /** The still: a baked two-tone image, at display size or one pixel a cell; drawn pixelated (app-design's ./art, or a site's own). */
    src: string;
    srcSet?: string;
    sizes?: string;
    width: number;
    height: number;
    /** Empty for decoration. */
    alt: string;
    /** The tone the live dither reads (a greyscale or two-tone image, same origin); the still by default. */
    tone?: string;
    /**
     * The live dither's inks, as CSS colours: the still's two. By default
     * burnt, from the palette, on the ground the picture sits on.
     */
    dark?: string;
    light?: string;
    /**
     * The still's dither cells across: `width` by default, for a still baked
     * one pixel a cell. A display-size still states its own (./art's
     * dither-mark-480 and -960 are 160). The live dither draws one pixel a
     * cell over the still's box, so the two share one grain at any drawn size.
     */
    cells?: number;
    /** A fixed size for one live dither pixel, in CSS px, in place of the still's grain. */
    pixel?: number;
    className?: string;
    style?: CSSProperties;
}

const CELL = 8; // CSS px per trail cell and per noise sample
// The 8x8 ordered-dither matrix, from its bit pattern: interleave the bits of x^y and y.
const BAYER8 = Array.from({ length: 64 }, (_, i) => {
    let v = 0;
    for (let b = 0; b < 3; b++) v = (v << 2) | (((((i & 7) ^ (i >> 3)) >> b) & 1) << 1) | (((i >> 3) >> b) & 1);
    return (v + 0.5) / 64;
});

const pens = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';

/** A CSS colour as little-endian RGBA bytes in one word, for ImageData. */
function word(css: string): number {
    if (css === 'transparent') return 0;
    const [r, g, b, a] = parseColour(css);
    return ((Math.round(a * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** The colour the picture sits on: the first painted background above it. */
function groundOf(el: Element): string {
    for (let a: Element | null = el; a; a = a.parentElement) {
        const bg = getComputedStyle(a).backgroundColor;
        if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
    }
    return '#ffffff';
}

/** A smooth field that crawls with z: two crossed waves, enough for a bias that drifts; far cheaper than lattice noise. */
const noise = (x: number, y: number, z: number) => Math.sin(x * 1.9 + z * 1.3 + Math.sin(y * 2.3 - z)) * Math.cos(y * 1.7 - z * 0.9 + Math.sin(x * 1.1));

export function DitherImage({ src, srcSet, sizes, width, height, alt, tone, dark, light, cells, pixel, className, style }: DitherImageProps) {
    const box = useRef<HTMLSpanElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const setting = useMotionSetting();

    useEffect(() => {
        const el = box.current;
        const cv = canvas.current;
        if (!el || !cv || prefersStill() || !finePointer()) return;
        let mounted: Mounted | null = null;
        let gone = false;
        // Nothing is read or drawn until a mouse or a pen first comes over the picture (a finger on a hybrid screen does not count).
        const start = async (e: PointerEvent) => {
            if (!pens(e)) return;
            el.removeEventListener('pointerenter', start);
            const img = new Image();
            // Read with CORS, so a cross-origin still without it fails to load here instead of tainting the canvas.
            img.crossOrigin = 'anonymous';
            img.src = tone ?? src;
            try {
                await img.decode();
            } catch {
                return;
            }
            if (gone) return;
            const inks = { dark: word(dark ?? lightPalette.burnt), light: word(light ?? groundOf(el)), cells: cells ?? width, pixel };
            mounted = mountScene(cv, el, (surface, wake) => ditherScene(el, img, surface, wake, inks, e));
            mounted.wake();
        };
        el.addEventListener('pointerenter', start);
        return () => {
            gone = true;
            el.removeEventListener('pointerenter', start);
            mounted?.stop();
        };
    }, [src, tone, dark, light, cells, width, pixel, setting]);

    return (
        <span ref={box} className={cn('oca-dither relative block overflow-hidden', className)} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the still is the picture; the canvas only lives under the pointer */}
            <img src={src} srcSet={srcSet} sizes={sizes} width={width} height={height} alt={alt} loading="lazy" decoding="async" className="block size-full [image-rendering:pixelated]" />
            <canvas ref={canvas} aria-hidden className="oca-dither-live" />
        </span>
    );
}

interface Inks {
    dark: number;
    light: number;
    cells: number;
    pixel?: number;
}

function ditherScene(el: HTMLElement, img: HTMLImageElement, surface: Surface, wake: () => void, o: Inks, first: PointerEvent) {
    // The canvas works at dither resolution and is scaled up pixelated: one buffer pixel a still's cell, or per `pixel` CSS px.
    let W = 0;
    let H = 0;
    let grain = 1; // CSS px per buffer pixel
    let lum = new Float32Array(0);
    let gw = 0;
    let gh = 0;
    let trail = new Float32Array(0);
    let out: ImageData | null = null;
    let px = new Uint32Array(0);
    let t = 0;
    let last = { x: NaN, y: NaN };
    const ctx = surface.ctx;

    function layout() {
        const cw = surface.width;
        const ch = surface.height;
        // The still's own grain is its drawn width over its cells, so at 1 or 2 CSS px a cell the trail is the still's.
        grain = o.pixel ?? (cw > 0 ? cw / o.cells : 1);
        W = Math.max(1, Math.round(cw / grain));
        H = Math.max(1, Math.round(ch / grain));
        // Draw at buffer size, whatever the Surface's device scale: the CSS scales it up, square and crisp.
        surface.canvas.width = W;
        surface.canvas.height = H;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const off = document.createElement('canvas');
        off.width = W;
        off.height = H;
        const c = off.getContext('2d', { willReadFrequently: true });
        if (!c) return;
        c.drawImage(img, 0, 0, W, H);
        let d: Uint8ClampedArray;
        try {
            d = c.getImageData(0, 0, W, H).data;
        } catch {
            // A tainted still (cross-origin, served without CORS): the picture stays the plain image.
            return;
        }
        lum = new Float32Array(W * H);
        // Paper where the still is clear; otherwise its luminance.
        for (let i = 0; i < W * H; i++) lum[i] = d[i * 4 + 3]! < 128 ? 1 : (0.2126 * d[i * 4]! + 0.7152 * d[i * 4 + 1]! + 0.0722 * d[i * 4 + 2]!) / 255;
        gw = Math.ceil(cw / CELL) + 1;
        gh = Math.ceil(ch / CELL) + 1;
        trail = new Float32Array(gw * gh);
        out = ctx.createImageData(W, H);
        px = new Uint32Array(out.data.buffer);
    }

    /** Lay the brush along the pointer's path since the last event. */
    function stamp(x: number, y: number) {
        const from = Number.isNaN(last.x) ? { x, y } : last;
        const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / CELL));
        const r = Math.max(3, Math.round(Math.min(surface.width, surface.height) * 0.12) / CELL);
        for (let s = 1; s <= steps; s++) {
            const cx = (from.x + ((x - from.x) * s) / steps) / CELL;
            const cy = (from.y + ((y - from.y) * s) / steps) / CELL;
            for (let gy = Math.max(0, Math.floor(cy - r)); gy <= Math.min(gh - 1, Math.ceil(cy + r)); gy++) {
                for (let gx = Math.max(0, Math.floor(cx - r)); gx <= Math.min(gw - 1, Math.ceil(cx + r)); gx++) {
                    // Each trail cell is weighed from its centre, as it draws over [gx, gx + 1): the trail centres on the pointer.
                    const f = 1 - Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) / r;
                    if (f > 0) trail[gy * gw + gx] = Math.min(1, trail[gy * gw + gx]! + f * 0.35);
                }
            }
        }
        last = { x, y };
    }

    const move = (e: PointerEvent) => {
        if (!pens(e)) return;
        const b = el.getBoundingClientRect();
        stamp(e.clientX - b.left, e.clientY - b.top);
        wake();
    };
    const leave = () => {
        last = { x: NaN, y: NaN };
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);

    return {
        layout() {
            layout();
            const b = el.getBoundingClientRect();
            stamp(first.clientX - b.left, first.clientY - b.top);
        },
        frame(_now: number, dt: number) {
            if (!out) return false;
            t += dt;
            // The trail fades to nothing in about a second.
            const keep = Math.exp(-dt / 0.22);
            let alive = false;
            px.fill(0);
            const k = CELL / grain; // buffer pixels per trail cell
            for (let gy = 0; gy < gh - 1; gy++) {
                for (let gx = 0; gx < gw - 1; gx++) {
                    const i = gy * gw + gx;
                    const f = (trail[i]! *= keep);
                    if (f < 0.02) {
                        trail[i] = 0;
                        continue;
                    }
                    alive = true;
                    // The noise bias crawls; under a strong trail the picture goes coarse, one cell a block.
                    const bias = noise(gx * 0.35, gy * 0.35, t * 2.2) * 0.45 * f;
                    const coarse = f > 0.55;
                    const x0 = Math.floor(gx * k);
                    const y0 = Math.floor(gy * k);
                    const x1 = Math.min(W, Math.floor((gx + 1) * k));
                    const y1 = Math.min(H, Math.floor((gy + 1) * k));
                    let block = 0;
                    if (coarse) {
                        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) block += lum[y * W + x]!;
                        block /= Math.max(1, (x1 - x0) * (y1 - y0));
                    }
                    for (let y = y0; y < y1; y++) {
                        for (let x = x0; x < x1; x++) {
                            const threshold = BAYER8[(y & 7) * 8 + (x & 7)]!;
                            // The trail's own edge dissolves through the same screen, so nothing ends on a hard line.
                            if (threshold > f * 1.6) continue;
                            const v = coarse ? block : lum[y * W + x]!;
                            px[y * W + x] = v >= threshold + bias ? o.light : o.dark;
                        }
                    }
                }
            }
            // Under the trail the live dither covers the still in both inks; everywhere else it is clear.
            ctx.putImageData(out, 0, 0);
            return alive;
        },
        dispose() {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerleave', leave);
        },
    };
}
