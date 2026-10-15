import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { cn } from '../lib/cn';
import { PORTRAIT_TONE_B64, PORTRAIT_TONE_SIZE } from './portrait-tone';

/*
 * The deck's halftone, screened live. The portrait's ink is a small tone grid;
 * this draws it as dots on a 45° screen that grow in from the centre, breathe,
 * and part under the pointer like a lens. One path fill per frame; it sleeps
 * when offscreen or hidden, and draws once, still, under reduced motion.
 */

export interface Tone {
    size: number;
    data: Uint8Array;
}

let portrait: Tone | null = null;
/** The deck portrait's ink, decoded once. */
export function portraitTone(): Tone {
    if (!portrait) {
        const bin = atob(PORTRAIT_TONE_B64);
        const data = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
        portrait = { size: PORTRAIT_TONE_SIZE, data };
    }
    return portrait;
}

export interface HalftoneCanvasProps {
    /** Ink to screen; the deck portrait by default. */
    tone?: Tone;
    /** Dots across the diameter. */
    density?: number;
    /** Swell and part the dots under the pointer. */
    lens?: boolean;
    /** Grow the dots in from the centre on first view. */
    intro?: boolean;
    /** A slow wave through the dots. */
    breathe?: boolean;
    /** Dot colour. */
    ink?: string;
    /** Shown before the canvas runs, and without script. */
    fallbackSrc?: string;
    alt: string;
    className?: string;
    style?: CSSProperties;
}

function sample(tone: Tone, u: number, v: number): number {
    const n = tone.size;
    const x = Math.min(n - 1.001, Math.max(0, u * n - 0.5));
    const y = Math.min(n - 1.001, Math.max(0, v * n - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const d = tone.data;
    const a = d[y0 * n + x0]! * (1 - fx) + d[y0 * n + x0 + 1]! * fx;
    const b = d[(y0 + 1) * n + x0]! * (1 - fx) + d[(y0 + 1) * n + x0 + 1]! * fx;
    return (a * (1 - fy) + b * fy) / 255;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

export function HalftoneCanvas({
    tone,
    density = 86,
    lens = true,
    intro = true,
    breathe = true,
    ink = '#0d0a08',
    fallbackSrc,
    alt,
    className,
    style,
}: HalftoneCanvasProps) {
    const wrap = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [live, setLive] = useState(false);

    useEffect(() => {
        const el = wrap.current;
        const cv = canvas.current;
        if (!el || !cv) return;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        const t = tone ?? portraitTone();
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let size = 0;
        let dots = new Float32Array(0); // x, y, r, delay per dot
        let count = 0;
        const pointer = { x: 0, y: 0, tx: 0, ty: 0, k: 0, on: false };
        let start = 0;
        let raf = 0;
        let visible = true;

        function layout() {
            const s = el!.clientWidth;
            if (!s || s === size) return;
            size = s;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            cv!.width = Math.round(s * dpr);
            cv!.height = Math.round(s * dpr);
            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
            const pitch = s / density;
            const c = s / 2;
            const ca = Math.SQRT1_2;
            const span = Math.ceil((s * 0.75) / pitch) + 1;
            const out: number[] = [];
            for (let i = -span; i <= span; i++) {
                for (let j = -span; j <= span; j++) {
                    const u = i * pitch;
                    const v = j * pitch;
                    const x = c + (u - v) * ca;
                    const y = c + (u + v) * ca;
                    const dc = Math.hypot(x - c, y - c);
                    if (dc > c - pitch * 0.6) continue;
                    const inkv = sample(t, x / s, y / s);
                    if (inkv < 0.1) continue;
                    const r = pitch * Math.sqrt(inkv / Math.PI) * 1.1;
                    out.push(x, y, r, (dc / c) * 1100);
                }
            }
            dots = Float32Array.from(out);
            count = out.length / 4;
        }

        function frame(now: number) {
            if (!start) start = now;
            const el2 = now - start;
            pointer.x += (pointer.tx - pointer.x) * 0.18;
            pointer.y += (pointer.ty - pointer.y) * 0.18;
            pointer.k += ((pointer.on ? 1 : 0) - pointer.k) * 0.12;
            const L = size * 0.22;
            ctx!.clearRect(0, 0, size, size);
            ctx!.fillStyle = ink;
            ctx!.beginPath();
            const wave = breathe && !still;
            const sec = now / 1000;
            for (let n = 0; n < count; n++) {
                let x = dots[n * 4]!;
                let y = dots[n * 4 + 1]!;
                let r = dots[n * 4 + 2]!;
                if (intro && !still) {
                    const k = Math.min(1, Math.max(0, (el2 - dots[n * 4 + 3]!) / 650));
                    if (k <= 0) continue;
                    r *= easeOut(k);
                }
                if (wave) r *= 1 + 0.05 * Math.sin(sec * 1.1 + ((x + y) / size) * 6);
                if (pointer.k > 0.01) {
                    const dx = x - pointer.x;
                    const dy = y - pointer.y;
                    const d = Math.hypot(dx, dy);
                    if (d < L) {
                        // A clearing, like a finger drawn through sand: dots
                        // shrink toward the pointer and part around it.
                        const f = (1 - d / L) * pointer.k;
                        r *= 1 - 0.75 * f * f;
                        if (d > 0.001) {
                            const push = f * (size / density) * 2.6;
                            x += (dx / d) * push;
                            y += (dy / d) * push;
                        }
                    }
                }
                ctx!.moveTo(x + r, y);
                ctx!.arc(x, y, r, 0, Math.PI * 2);
            }
            ctx!.fill();
            const introDone = !intro || still || el2 > 1900;
            const busy = wave || pointer.k > 0.01 || !introDone;
            raf = busy && visible && !document.hidden ? requestAnimationFrame(frame) : 0;
        }

        const kick = () => {
            if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
        };

        layout();
        setLive(true);
        kick();

        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => (layout(), kick())) : null;
        ro?.observe(el);
        const io =
            typeof IntersectionObserver !== 'undefined'
                ? new IntersectionObserver(([e]) => {
                      visible = Boolean(e?.isIntersecting);
                      kick();
                  })
                : null;
        io?.observe(el);
        const onVis = () => kick();
        document.addEventListener('visibilitychange', onVis);

        const move = (e: PointerEvent) => {
            const b = el.getBoundingClientRect();
            pointer.tx = e.clientX - b.left;
            pointer.ty = e.clientY - b.top;
            if (!pointer.on) {
                pointer.x = pointer.tx;
                pointer.y = pointer.ty;
            }
            pointer.on = true;
            kick();
        };
        const leave = () => {
            pointer.on = false;
            kick();
        };
        if (lens && !still) {
            el.addEventListener('pointermove', move);
            el.addEventListener('pointerleave', leave);
        }
        return () => {
            cancelAnimationFrame(raf);
            ro?.disconnect();
            io?.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerleave', leave);
        };
    }, [tone, density, lens, intro, breathe, ink]);

    return (
        <div ref={wrap} className={cn('relative aspect-square w-full', className)} style={style} data-live={live || undefined}>
            {fallbackSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- the still screen, until the live one draws
                <img
                    src={fallbackSrc}
                    alt=""
                    aria-hidden
                    className={cn('absolute inset-0 size-full select-none transition-opacity duration-300', live && 'opacity-0')}
                    draggable={false}
                />
            ) : null}
            <canvas ref={canvas} role="img" aria-label={alt} className="absolute inset-0 size-full" />
        </div>
    );
}
