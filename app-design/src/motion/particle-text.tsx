import { createElement, useEffect, useRef, type CSSProperties, type ElementType } from 'react';

import { cn } from '../lib/cn';
import { clamp01, easeOut, finePointer, prefersStill, seeded, useMotionSetting, whenIdle } from './env';
import { Batch, parseColour, rgba } from './paint';
import { mountScene, type Mounted, type SceneParts } from './scene';

/*
 * A short word or numeral drawn in dots ("up to 80%", "0", "1", "₿"). The text
 * is real text, styled by the page and read by screen readers; once the page
 * is idle a canvas samples it from the loaded font, in place, and takes over
 * the drawing. When it scrolls into view the dots gather from a loose scatter,
 * a fine pointer pushes them aside while it moves, and then it sleeps. Already
 * on screen when the canvas arrives, it simply turns to dots: nothing visible
 * scatters.
 *
 * The dots take the element's own colour, so a token class sets them.
 */

export interface ParticleTextProps {
    /** The text: drawn in dots, read as text. */
    children: string;
    as?: ElementType;
    /** Push the dots aside under a fine pointer. */
    repel?: boolean;
    /** Dot spacing in px; by default a 34th of the font size, at least 4. */
    step?: number;
    className?: string;
    style?: CSSProperties;
}

const SCATTER_ALPHA = 0.35;
const LEVELS = 8;

export function ParticleText({ children, as = 'span', repel = true, step, className, style }: ParticleTextProps) {
    const root = useRef<HTMLElement>(null);
    const glyphs = useRef<HTMLSpanElement>(null);
    const probe = useRef<HTMLSpanElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const setting = useMotionSetting();

    useEffect(() => {
        const el = root.current;
        const text = glyphs.current;
        const base = probe.current;
        const cv = canvas.current;
        if (!el || !text || !base || !cv) return;
        const still = prefersStill();
        let mounted: Mounted | null = null;
        let io: IntersectionObserver | null = null;
        let gone = false;
        const cancelIdle = whenIdle(async () => {
            await document.fonts?.ready;
            if (gone) return;
            const scene = textScene(el, cv, text, base, { still, repel: repel && !still && finePointer(), step });
            mounted = mountScene(cv, el, (surface, wake) => scene.parts(surface, wake), { onDraw: () => (el.dataset.live = '') });
            // On screen already: it turns to dots where it stands. Below: it gathers when a third is in view.
            const r = el.getBoundingClientRect();
            if (still || (r.top < innerHeight && r.bottom > 0) || typeof IntersectionObserver === 'undefined') scene.form(false);
            else {
                io = new IntersectionObserver(
                    ([e]) => {
                        if (!e?.isIntersecting) return;
                        io?.disconnect();
                        scene.form(true);
                        mounted?.wake();
                    },
                    { threshold: 0.35 }
                );
                io.observe(el);
            }
            mounted.wake();
        });
        return () => {
            gone = true;
            cancelIdle();
            io?.disconnect();
            mounted?.stop();
        };
    }, [children, repel, step, setting]);

    return createElement(
        as,
        { ref: root, className: cn('oca-ptext relative inline-block', className), style },
        <span ref={glyphs} className="oca-ptext-glyphs">
            {children}
            <span ref={probe} className="oca-ptext-probe" aria-hidden />
        </span>,
        <canvas ref={canvas} aria-hidden className="oca-ptext-canvas" />
    );
}

function textScene(el: HTMLElement, cv: HTMLCanvasElement, text: HTMLSpanElement, probe: HTMLSpanElement, o: { still: boolean; repel: boolean; step?: number }) {
    const rand = seeded(0x80);
    let n = 0;
    let tx = new Float32Array(0);
    let ty = new Float32Array(0);
    let sx = new Float32Array(0);
    let sy = new Float32Array(0);
    let delay = new Float32Array(0);
    let dur = new Float32Array(0);
    let dot = 2;
    let batch = new Batch(0);
    let styles: string[] = [];
    // -1: scattered and waiting; then seconds since the gather began.
    let t = -1;
    let end = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, k: 0, on: false };
    let radius = 60;

    /** The text's dots where the page drew it: sampled from the same font, at the same baseline. */
    function sample(width: number, height: number) {
        const cs = getComputedStyle(text);
        const px = parseFloat(cs.fontSize) || 16;
        const off = document.createElement('canvas');
        off.width = Math.max(1, Math.ceil(width));
        off.height = Math.max(1, Math.ceil(height));
        const c = off.getContext('2d', { willReadFrequently: true });
        if (!c) return;
        c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in c && cs.letterSpacing !== 'normal') (c as { letterSpacing: string }).letterSpacing = cs.letterSpacing;
        // The canvas bleeds past the text a little, so a dot at the edge or pushed by the pointer stays whole.
        const box = cv.getBoundingClientRect();
        const line = text.getBoundingClientRect();
        const baseline = probe.getBoundingClientRect().top - box.top;
        c.textBaseline = 'alphabetic';
        c.fillText(text.textContent ?? '', line.left - box.left, baseline);
        const data = c.getImageData(0, 0, off.width, off.height).data;
        const p = o.step ?? Math.max(4, Math.round(px / 34));
        dot = Math.max(2, 0.62 * p);
        const xs: number[] = [];
        const ys: number[] = [];
        for (let y = Math.round(p / 2); y < off.height; y += p) {
            for (let x = Math.round(p / 2); x < off.width; x += p) if (data[(y * off.width + x) * 4 + 3]! >= 128) xs.push(x), ys.push(y);
        }
        n = xs.length;
        tx = Float32Array.from(xs);
        ty = Float32Array.from(ys);
        sx = new Float32Array(n);
        sy = new Float32Array(n);
        delay = new Float32Array(n);
        dur = new Float32Array(n);
        end = 0;
        for (let i = 0; i < n; i++) {
            sx[i] = rand() * width;
            sy[i] = rand() * height;
            delay[i] = 0.15 * rand();
            dur[i] = 0.7 + 0.9 * rand();
            end = Math.max(end, delay[i]! + dur[i]!);
        }
        batch = new Batch(n);
        radius = Math.max(48, px * 0.4);
    }

    return {
        /** Gather: animated from the scatter, or straight to the glyphs. */
        form(animate: boolean) {
            t = animate ? 0 : Infinity;
        },
        parts(surface: Mounted['surface'], wake: () => void): SceneParts {
            const move = (e: PointerEvent) => {
                const b = cv.getBoundingClientRect();
                pointer.tx = e.clientX - b.left;
                pointer.ty = e.clientY - b.top;
                if (!pointer.on) {
                    pointer.x = pointer.tx;
                    pointer.y = pointer.ty;
                }
                pointer.on = true;
                wake();
            };
            const leave = () => {
                pointer.on = false;
                wake();
            };
            if (o.repel) {
                el.addEventListener('pointermove', move);
                el.addEventListener('pointerleave', leave);
            }
            return {
                layout() {
                    sample(surface.width, surface.height);
                },
                theme() {
                    const c = parseColour(getComputedStyle(el).color);
                    styles = [];
                    for (let k = 0; k < LEVELS; k++) styles.push(rgba([c[0], c[1], c[2]], SCATTER_ALPHA + ((1 - SCATTER_ALPHA) * k) / (LEVELS - 1)));
                },
                frame(_now, dt) {
                    if (t >= 0 && t < end) t = Math.min(end, t + dt);
                    pointer.x += (pointer.tx - pointer.x) * 0.2;
                    pointer.y += (pointer.ty - pointer.y) * 0.2;
                    pointer.k += ((pointer.on ? 1 : 0) - pointer.k) * 0.14;
                    const R = radius;
                    surface.clear();
                    batch.reset();
                    for (let i = 0; i < n; i++) {
                        const e = t < 0 ? 0 : easeOut(clamp01((t - delay[i]!) / dur[i]!));
                        let x = sx[i]! + (tx[i]! - sx[i]!) * e;
                        let y = sy[i]! + (ty[i]! - sy[i]!) * e;
                        if (pointer.k > 0.01) {
                            const dx = x - pointer.x;
                            const dy = y - pointer.y;
                            const d2 = dx * dx + dy * dy;
                            if (d2 < R * R) {
                                const d = Math.sqrt(d2) || 1;
                                const push = (1 - d2 / (R * R)) * R * 0.35 * pointer.k;
                                x += (dx / d) * push;
                                y += (dy / d) * push;
                            }
                        }
                        batch.add(Math.round(e * (LEVELS - 1)), x, y, dot);
                    }
                    batch.draw(surface.ctx, styles, surface.dpr);
                    const settled = Math.abs(pointer.tx - pointer.x) < 0.2 && Math.abs(pointer.ty - pointer.y) < 0.2 && Math.abs((pointer.on ? 1 : 0) - pointer.k) < 0.01;
                    return (t >= 0 && t < end) || !settled;
                },
                dispose() {
                    el.removeEventListener('pointermove', move);
                    el.removeEventListener('pointerleave', leave);
                },
            };
        },
    };
}
