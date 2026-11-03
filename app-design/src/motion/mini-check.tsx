import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { MARK_FACES, MARK_POINTS } from '@orangecheck/mark';

import { Mark } from '../brand/mark';
import { cn } from '../lib/cn';
import { clamp01, easeOut, prefersStill, seeded } from './env';
import { Batch, rgba, type Rgb } from './paint';
import { mountScene, type Mounted } from './scene';

/*
 * A success moment: dots fly in and settle into the isometric check, then the
 * check stands solid. 1.1 s, once, then nothing. Light enough for a signed-in
 * screen: a few hundred dots, no data to load, and under reduced motion no
 * canvas at all, just the mark.
 */

export interface MiniCheckProps {
    /** Width in px; the check is half as tall. */
    size?: number;
    /** Accessible name. Omit when the words beside it already say it. */
    title?: string;
    /** Change it to play again (a new success). */
    playKey?: string | number;
    className?: string;
    style?: CSSProperties;
}

const FLIGHT = 0.8;
const SPREAD = 0.3; // the last dot leaves this long after the first: 1.1 s in all
const STEP = 0.4; // grid step, in the mark's 16 x 8 units

type Poly = [number, number][];
const poly = (pts: string): Poly => pts.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
const FACES: [keyof typeof MARK_FACES, Poly][] = [
    ['left', poly(MARK_POINTS.left)],
    ['right', poly(MARK_POINTS.right)],
    ['top', poly(MARK_POINTS.top)],
];

function inside(x: number, y: number, p: Poly): boolean {
    let hit = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i]!;
        const [xj, yj] = p[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

/** The check as dots on a grid: position in mark units and which face. */
const DOTS: { x: number; y: number; face: number }[] = [];
for (let y = STEP / 2; y < 8; y += STEP) {
    for (let x = STEP / 2; x < 16; x += STEP) {
        const face = FACES.findIndex(([, p]) => inside(x, y, p));
        if (face >= 0) DOTS.push({ x, y, face });
    }
}

const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function MiniCheck({ size = 132, title, playKey, className, style }: MiniCheckProps) {
    const box = useRef<HTMLSpanElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [state, setState] = useState<'still' | 'flying' | 'solid'>('still');

    useEffect(() => {
        const el = box.current;
        const cv = canvas.current;
        if (!el || !cv || prefersStill()) return;
        setState('flying');
        const rand = seeded(typeof playKey === 'number' ? playKey + 7 : 7);
        const n = DOTS.length;
        const sx = new Float32Array(n);
        const sy = new Float32Array(n);
        const delay = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const a = rand() * Math.PI * 2;
            const r = 0.55 + 0.45 * rand();
            // Scattered inside the mark's own box, so nothing is clipped on the way in.
            sx[i] = 8 + Math.cos(a) * r * 7.4;
            sy[i] = 4 + Math.sin(a) * r * 3.5;
            // From the elbow of the check outward.
            delay[i] = SPREAD * (0.75 * (Math.hypot(DOTS[i]!.x - 6, DOTS[i]!.y - 6) / 10) + 0.25 * rand());
        }
        const styles = FACES.map(([k]) => rgba(hex(MARK_FACES[k])));
        const batch = new Batch(n);
        let t = 0;
        let mounted: Mounted | null = mountScene(cv, el, (surface) => ({
            frame(_now, dt) {
                t += dt;
                const u = surface.width / 16;
                surface.clear();
                batch.reset();
                for (let i = 0; i < n; i++) {
                    const d = DOTS[i]!;
                    const e = easeOut(clamp01((t - delay[i]!) / FLIGHT));
                    batch.add(d.face, (sx[i]! + (d.x - sx[i]!) * e) * u, (sy[i]! + (d.y - sy[i]!) * e) * u, STEP * u * (0.6 + 0.2 * e));
                }
                batch.draw(surface.ctx, styles, surface.dpr);
                if (t < FLIGHT + SPREAD) return true;
                setState('solid');
                return false;
            },
        }));
        mounted.wake();
        return () => {
            mounted?.stop();
            mounted = null;
        };
    }, [playKey]);

    return (
        <span
            ref={box}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            className={cn('oca-minicheck relative inline-block shrink-0', className)}
            style={{ width: size, height: size / 2, ...style }}
            data-state={state}
        >
            <Mark className="oca-minicheck-mark absolute inset-0 size-full" />
            <canvas ref={canvas} aria-hidden className="oca-minicheck-dots absolute inset-0 size-full" />
        </span>
    );
}
