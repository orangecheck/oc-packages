import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

import { cn } from '../lib/cn';
import { prefersStill, seeded, smoothstep, whenIdle } from './env';
import { Batch, inks, mix, rgba, type Inks } from './paint';
import { mountScene, type Mounted } from './scene';
import { watchStory } from './story';

/*
 * "To an app you look like everyone else": a crowd of pixel figures in rows,
 * nearer rows larger. As a ScrollStory plays, the copies come apart into dust
 * and fall away while the backed figures warm to orange; at the end only they
 * stand. The scroll is the clock: it draws only when the story's `--p`
 * changes, so a page at rest draws nothing. About 4,500 squares, in at most
 * 16 colour buckets.
 *
 * It takes Crowd's props, so a page swaps `<Crowd story>` for it by name.
 */

export interface CrowdDissolveProps {
    /** Figures in the front row; each row behind has one fewer. */
    cols?: number;
    rows?: number;
    /** How many figures are backed (they stay, and turn orange). */
    real?: number;
    seed?: number;
    /** Crowd's ground names: figures dark on 'canvas', light on 'ink'. 'auto' follows the theme. */
    tone?: 'auto' | 'canvas' | 'ink';
    /** Spoken by screen readers. */
    label?: string;
    /** Drive it yourself (0 to 1) instead of from the ScrollStory around it. */
    progress?: number;
    className?: string;
    style?: CSSProperties;
}

// A figure on a 7 x 6 grid of squares: a head narrower than the shoulders, so at a few pixels a cell it reads as a person.
const FIGURE = ['..###..', '..###..', '.......', '.#####.', '#######', '#######'];
const CELLS: [number, number][] = FIGURE.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x - 3, y - 5] as [number, number]] : [])));
const PITCH = 9; // cells from one figure to the next in a row
const COPY_LEVELS = 15; // alpha buckets for the copies; bucket 15 is the backed figures

export function CrowdDissolve({
    cols = 24,
    rows = 9,
    real = 8,
    seed = 21,
    tone = 'auto',
    label = 'A crowd of identical accounts. The copies fall away; the backed few stay, lit in orange.',
    progress,
    className,
    style,
}: CrowdDissolveProps) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const driven = useRef(progress);
    driven.current = progress;
    const wake = useRef<() => void>(() => {});

    useEffect(() => {
        const el = box.current;
        const cv = canvas.current;
        if (!el || !cv) return;
        const still = prefersStill();
        let mounted: Mounted | null = null;
        let stopStory = () => {};
        let story: number | null = null;
        const cancelIdle = whenIdle(() => {
            const crowd = build(cols, rows, real, seed);
            const p = () => (still ? 1 : (driven.current ?? story ?? 1));
            mounted = mountScene(cv, el, (surface) => crowdScene(crowd, surface, p), {
                ground: tone === 'ink' ? 'dark' : tone === 'canvas' ? 'light' : 'auto',
                onDraw: () => (el.dataset.live = ''),
            });
            wake.current = mounted.wake;
            if (!still) {
                stopStory = watchStory(el, (v) => {
                    story = v;
                    mounted?.wake();
                });
            }
            mounted.wake();
        });
        return () => {
            cancelIdle();
            stopStory();
            mounted?.stop();
            wake.current = () => {};
        };
    }, [cols, rows, real, seed, tone]);

    useEffect(() => wake.current(), [progress]);

    return (
        <div ref={box} role="img" aria-label={label} className={cn('oca-crowd relative', className)} style={style}>
            <CrowdPoster cols={cols} rows={rows} real={real} seed={seed} />
            <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
        </div>
    );
}

/** The end state as one small SVG path: only the backed figures stand. What a page without script shows. */
function CrowdPoster({ cols, rows, real, seed }: { cols: number; rows: number; real: number; seed: number }) {
    const d = useMemo(() => {
        const c = build(cols, rows, real, seed);
        const at = { x: 0, y: 0, side: 0, bucket: 0 };
        let path = '';
        for (let k = 0; k < c.fig.length; k++) {
            if (!c.backed[c.fig[k]!] || !place(c, k, 1000, 750, 1, at)) continue;
            path += `M${at.x - at.side / 2} ${at.y - at.side / 2}h${at.side}v${at.side}h-${at.side}z`;
        }
        return path;
    }, [cols, rows, real, seed]);
    return (
        <svg viewBox="0 0 1000 750" className="oca-crowd-poster absolute inset-0 size-full" aria-hidden>
            <path d={d} fill="var(--oca-orange, var(--brand))" />
        </svg>
    );
}

interface Crowd {
    /** Per figure: row (0 at the back), place in the row (-0.5 to 0.5), backed, when it comes apart (0 to 1). */
    row: Uint8Array;
    across: Float32Array;
    backed: Uint8Array;
    leave: Float32Array;
    /** Per square: its figure, its cell, its alpha level, and where its dust goes (in cells). */
    fig: Uint16Array;
    cx: Int8Array;
    cy: Int8Array;
    level: Uint8Array;
    dx: Float32Array;
    dy: Float32Array;
    rows: number;
    cols: number;
}

function build(cols: number, rows: number, real: number, seed: number): Crowd {
    const rand = seeded(seed);
    const figs: { row: number; across: number }[] = [];
    for (let r = 0; r < rows; r++) {
        const count = Math.max(1, cols - (rows - 1 - r));
        for (let i = 0; i < count; i++) figs.push({ row: r, across: count > 1 ? i / (count - 1) - 0.5 : 0 });
    }
    // Backed figures: in the middle rows, never side by side, so each one reads on its own.
    const backed = new Set<number>();
    const lo = Math.floor(rows * 0.3);
    const hi = Math.ceil(rows * 0.85);
    const pool = figs.map((_, i) => i).filter((i) => figs[i]!.row >= lo && figs[i]!.row < hi && Math.abs(figs[i]!.across) < 0.46);
    for (let tries = 0; backed.size < Math.min(real, pool.length) && tries < 2000; tries++) {
        const i = pool[Math.floor(rand() * pool.length)]!;
        if (!backed.has(i) && !backed.has(i - 1) && !backed.has(i + 1)) backed.add(i);
    }
    const n = figs.length * CELLS.length;
    const c: Crowd = {
        row: Uint8Array.from(figs.map((f) => f.row)),
        across: Float32Array.from(figs.map((f) => f.across)),
        backed: Uint8Array.from(figs.map((_, i) => (backed.has(i) ? 1 : 0))),
        leave: Float32Array.from(figs.map(() => rand())),
        fig: new Uint16Array(n),
        cx: new Int8Array(n),
        cy: new Int8Array(n),
        level: new Uint8Array(n),
        dx: new Float32Array(n),
        dy: new Float32Array(n),
        rows,
        cols,
    };
    let k = 0;
    for (let f = 0; f < figs.length; f++) {
        for (const [x, y] of CELLS) {
            const a = rand() * Math.PI * 2;
            const r = 4 + 12 * rand();
            c.fig[k] = f;
            c.cx[k] = x;
            c.cy[k] = y;
            c.level[k] = 2 + Math.floor(rand() * 3);
            c.dx[k] = Math.cos(a) * r;
            c.dy[k] = Math.sin(a) * r - 5;
            k++;
        }
    }
    return c;
}

/**
 * Where square `k` is drawn at progress `p` in a W x H box: centre, side and
 * colour bucket, written into `at`. False when the square is not drawn (its
 * figure has gone, or it is fully faded).
 */
function place(c: Crowd, k: number, W: number, H: number, p: number, at: { x: number; y: number; side: number; bucket: number }): boolean {
    const f = c.fig[k]!;
    const backed = c.backed[f] === 1;
    const gone = backed ? 0 : smoothstep((p - 0.3 - 0.22 * c.leave[f]!) / 0.18);
    if (gone >= 1) return false;
    const arrive = smoothstep(p / 0.12);
    const bucket = backed ? COPY_LEVELS : Math.round((COPY_LEVELS - 1) * (c.level[k]! / 4) * (1 - gone) * arrive);
    if (bucket === 0) return false;
    // The front row spans the width; the crowd fills the height, nearer rows lower and larger.
    const cell = Math.min((W * 0.98) / (c.cols * PITCH), (H * 0.9) / (c.rows * FIGURE.length * 1.6));
    const uy = c.rows > 1 ? c.row[f]! / (c.rows - 1) : 1;
    // A backed figure grows a little as it warms, from its feet: the few that stay are the ones you see.
    const u = cell * (0.62 + 0.38 * uy) * (backed ? 1 + 0.5 * smoothstep((p - 0.38) / 0.25) : 1);
    const x0 = W / 2 + c.across[f]! * W * (0.6 + 0.38 * uy);
    const y0 = H * 0.08 + H * 0.87 * uy + (1 - arrive) * 30 * (1 - uy);
    at.x = x0 + (c.cx[k]! + c.dx[k]! * gone) * u;
    at.y = y0 + (c.cy[k]! + c.dy[k]! * gone) * u;
    at.side = u * 0.84 * (1 - 0.45 * gone);
    at.bucket = bucket;
    return true;
}

function crowdScene(c: Crowd, surface: Mounted['surface'], progress: () => number) {
    const n = c.fig.length;
    const batch = new Batch(n);
    const at = { x: 0, y: 0, side: 0, bucket: 0 };
    let ink: Inks | null = null;
    const styles: string[] = [];
    let last = -1;
    return {
        layout() {
            last = -1;
        },
        theme(dark: boolean) {
            ink = inks(dark);
            styles.length = 0;
            for (let k = 0; k < COPY_LEVELS; k++) styles.push(rgba(ink.base, (0.72 * k) / (COPY_LEVELS - 1)));
            last = -1;
        },
        frame() {
            const p = progress();
            // The scroll is the clock: an unchanged story is an unchanged picture.
            if (p === last || !ink) return false;
            last = p;
            const warm = smoothstep((p - 0.38) / 0.25);
            styles[COPY_LEVELS] = rgba(mix(ink.base, ink.heat, warm), Math.max(0.72, warm) * smoothstep(p / 0.12));
            surface.clear();
            batch.reset();
            for (let k = 0; k < n; k++) if (place(c, k, surface.width, surface.height, p, at)) batch.add(at.bucket, at.x, at.y, at.side);
            batch.draw(surface.ctx, styles, surface.dpr);
            return false;
        },
    };
}
