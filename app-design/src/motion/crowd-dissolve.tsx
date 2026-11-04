import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';

import { cn } from '../lib/cn';
import { prefersStill, seeded, smoothstep, useMotionSetting, whenReady } from './env';
import { Batch, inks, mix, rgba, type Inks } from './paint';
import { mountScene, type Mounted } from './scene';
import { watchStory } from './story';

/*
 * "To an app you look like everyone else": a crowd of pixel people on an even
 * grid. As a ScrollStory plays, the copies break into dust that falls and
 * fades, each leaving a faint outline in its place, while the backed eight
 * warm to orange; at the end they stand out of a crowd you can still count.
 * The scroll is the clock: it draws only when the story's `--p` changes, so a
 * page at rest draws nothing. About 3,000 squares, in at most 16 colour
 * buckets.
 *
 * It takes Crowd's props, so a page swaps `<Crowd story>` for it by name.
 */

export interface CrowdDissolveProps {
    /** Places across and down. By default 10 x 6, and 6 x 5 in a box under 480px wide. */
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

// A person on a 7 x 12 pixel grid: a 3 x 3 head, a one-pixel gap for the neck, shoulders wider than the head,
// and a body narrowing down. It reads at about 24 x 40px on a desk and 14 x 24 on a phone.
const FIGURE = ['..###..', '..###..', '..###..', '.......', '.#####.', '#######', '#######', '#######', '.#####.', '.#####.', '..###..', '..###..'];
const filled = (x: number, y: number) => FIGURE[y]?.[x] === '#';
const CELLS: [number, number][] = FIGURE.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x, y] as [number, number]] : [])));
/** The figure's edge: the cells its ghost keeps. */
const EDGE = CELLS.filter(([x, y]) => !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1));
const FIG_W = FIGURE[0]!.length;
const FIG_H = FIGURE.length;
// Each place is a tile; the figure, one pixel a cell, takes the cell that fits a tile of `tw` x `th` cells in
// it, to the nearest device pixel: about 3px a cell on a desk and 2px on a phone.
const WIDE: Grid = { cols: 10, rows: 6, tw: 21, th: 17 };
const NARROW: Grid = { cols: 6, rows: 5, tw: 28, th: 24 };
const NARROW_BELOW = 480; // px of the box; the poster switches on a container query at the same width

const COPY_LEVELS = 12; // buckets 0..11: the copies and their dust, by alpha
const GHOST = 12; // buckets 12 and 13: an outline coming in, and in full
const BACKED = 14;
const COPY_ALPHA = 0.72;
const GHOST_ALPHA = 0.2;

/** Squares for `cells` of the figure in a tile `tw` x `th` cells, the figure centred. */
const glyph = (cells: [number, number][], { tw, th }: Grid) => cells.map(([x, y]) => `M${x + (tw - FIG_W) / 2} ${y + (th - FIG_H) / 2}h0.84v0.84h-0.84z`).join('');
/** The grid props ask for, or null for the default pair. */
const fixedGrid = (cols?: number, rows?: number): Grid | null => (cols || rows ? { ...WIDE, cols: cols ?? WIDE.cols, rows: rows ?? WIDE.rows } : null);

export function CrowdDissolve({
    cols,
    rows,
    real = 8,
    seed = 21,
    tone = 'auto',
    label = 'A crowd of identical accounts. The copies fall away and leave their places empty; the backed few stand out in orange.',
    progress,
    className,
    style,
}: CrowdDissolveProps) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const driven = useRef(progress);
    driven.current = progress;
    const wake = useRef<() => void>(() => {});
    const setting = useMotionSetting();

    useEffect(() => {
        const el = box.current;
        const cv = canvas.current;
        if (!el || !cv) return;
        const still = prefersStill();
        let mounted: Mounted | null = null;
        let stopStory = () => {};
        let story: number | null = null;
        const cancelIdle = whenReady(el, () => {
            const fixed = fixedGrid(cols, rows);
            const grids = { wide: build(fixed ?? WIDE, real, seed), narrow: build(fixed ?? NARROW, real, seed) };
            const p = () => (still ? 1 : (driven.current ?? story ?? 1));
            mounted = mountScene(cv, el, (surface) => crowdScene(grids, surface, p), {
                ground: tone === 'ink' ? 'dark' : tone === 'canvas' ? 'light' : 'auto',
                onDraw: () => (el.dataset.live = ''),
                onFail: () => {
                    delete el.dataset.live;
                    el.dataset.fallback = '';
                },
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
    }, [cols, rows, real, seed, tone, setting]);

    useEffect(() => wake.current(), [progress]);

    const fixed = fixedGrid(cols, rows);
    return (
        <div
            ref={box}
            role="img"
            aria-label={label}
            className={cn('oca-crowd relative', className)}
            style={style}
            data-ground={tone === 'ink' ? 'dark' : tone === 'canvas' ? 'light' : undefined}
        >
            <CrowdPoster grid={fixed ?? WIDE} real={real} seed={seed} size="wide" />
            <CrowdPoster grid={fixed ?? NARROW} real={real} seed={seed} size="narrow" />
            <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
        </div>
    );
}

/**
 * The end state, what a page without script shows, for one box width: every place an outline (one pattern
 * tile a place) and the backed figures over them, in the box's own pixels, laid out as the canvas lays it.
 */
function CrowdPoster({ grid, real, seed, size }: { grid: Grid; real: number; seed: number; size: 'wide' | 'narrow' }) {
    const id = useId().replace(/[^a-zA-Z0-9-]/g, '');
    const { cols, rows, tw, th } = grid;
    const backed = useMemo(() => {
        const c = build({ cols, rows, tw, th }, real, seed);
        return [...c.backed].flatMap((b, f) => (b ? [[f % cols, Math.floor(f / cols)] as const] : []));
    }, [cols, rows, tw, th, real, seed]);
    const w = 100 / cols;
    const h = 100 / rows;
    return (
        <svg className="oca-crowd-poster absolute inset-0 size-full" data-size={size} aria-hidden>
            <defs>
                <pattern id={`${id}-place`} width={`${w}%`} height={`${h}%`} patternUnits="userSpaceOnUse" viewBox={`0 0 ${tw} ${th}`}>
                    <path d={glyph(EDGE, grid)} fill="currentColor" opacity={GHOST_ALPHA} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${id}-place)`} />
            <g fill="var(--oca-orange, var(--brand))">
                {backed.map(([x, y]) => (
                    <svg key={`${x} ${y}`} x={`${x * w}%`} y={`${y * h}%`} width={`${w}%`} height={`${h}%`} viewBox={`0 0 ${tw} ${th}`}>
                        <path d={glyph(CELLS, grid)} />
                    </svg>
                ))}
            </g>
        </svg>
    );
}

interface Grid {
    cols: number;
    rows: number;
    /** A place's tile, in figure cells. */
    tw: number;
    th: number;
}

interface Crowd extends Grid {
    /** Per figure: backed, its ink (0 to 1), when it comes apart (0 to 1). */
    backed: Uint8Array;
    shade: Float32Array;
    leave: Float32Array;
    /** Per square: its figure, its cell, on the edge, a little lag, and where its dust goes (in cells). */
    fig: Uint16Array;
    cx: Uint8Array;
    cy: Uint8Array;
    edge: Uint8Array;
    lag: Float32Array;
    dx: Float32Array;
    fall: Float32Array;
}

function build({ cols, rows, tw, th }: Grid, real: number, seed: number): Crowd {
    const rand = seeded(seed);
    const count = cols * rows;
    // Backed figures: off the edges and apart from each other, so each reads on its own.
    const backed = new Uint8Array(count);
    const picked: [number, number][] = [];
    const want = Math.min(real, count);
    for (let gap = 2.4, tries = 0; picked.length < want && tries < 4000; tries++) {
        if (tries % 500 === 499) gap *= 0.8;
        const x = Math.floor(rand() * cols);
        const y = Math.floor(rand() * rows);
        const edge = cols > 4 && rows > 3 && tries < 2000 && (x === 0 || y === 0 || x === cols - 1 || y === rows - 1);
        if (edge || backed[y * cols + x] || picked.some(([px, py]) => Math.hypot(px - x, py - y) < gap)) continue;
        backed[y * cols + x] = 1;
        picked.push([x, y]);
    }
    const n = count * CELLS.length;
    const c: Crowd = {
        cols,
        rows,
        tw,
        th,
        backed,
        shade: Float32Array.from({ length: count }, () => 0.75 + 0.25 * rand()),
        leave: Float32Array.from({ length: count }, () => rand()),
        fig: new Uint16Array(n),
        cx: new Uint8Array(n),
        cy: new Uint8Array(n),
        edge: new Uint8Array(n),
        lag: new Float32Array(n),
        dx: new Float32Array(n),
        fall: new Float32Array(n),
    };
    let k = 0;
    for (let f = 0; f < count; f++) {
        for (const [x, y] of CELLS) {
            c.fig[k] = f;
            c.cx[k] = x;
            c.cy[k] = y;
            c.edge[k] = EDGE.some(([ex, ey]) => ex === x && ey === y) ? 1 : 0;
            // A figure comes apart from its feet up, each grain a little on its own.
            c.lag[k] = 0.04 * ((FIG_H - y) / FIG_H) + 0.03 * rand();
            c.dx[k] = (rand() - 0.5) * 5;
            c.fall[k] = 10 + 22 * rand();
            k++;
        }
    }
    return c;
}

function crowdScene(grids: { wide: Crowd; narrow: Crowd }, surface: Mounted['surface'], progress: () => number) {
    // A leaving copy draws its dust and its outline: two squares a cell at most.
    const batch = new Batch(Math.max(grids.wide.fig.length, grids.narrow.fig.length) * 2);
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
            for (let k = 1; k <= COPY_LEVELS; k++) styles.push(rgba(ink.base, (COPY_ALPHA * k) / COPY_LEVELS));
            styles.push(rgba(ink.base, GHOST_ALPHA / 2), rgba(ink.base, GHOST_ALPHA));
            last = -1;
        },
        frame() {
            const p = progress();
            // The scroll is the clock: an unchanged story is an unchanged picture.
            if (p === last || !ink) return false;
            last = p;
            const dpr = surface.dpr;
            const c = surface.width < NARROW_BELOW ? grids.narrow : grids.wide;
            const tw = surface.width / c.cols;
            const th = surface.height / c.rows;
            // Whole device pixels a cell, so every figure is the same crisp pixel art; a pixel's gap between squares when there is room.
            const cell = Math.max(1, Math.round(Math.min(tw / c.tw, th / c.th) * dpr)) / dpr;
            const side = cell * dpr >= 3 ? cell - 1 / dpr : cell;
            const snap = (v: number) => Math.round(v * dpr) / dpr;
            const warm = smoothstep((p - 0.4) / 0.22);
            styles[BACKED] = rgba(mix(ink.base, ink.heat, warm), Math.max(COPY_ALPHA, warm) * smoothstep(p / 0.12));
            surface.clear();
            batch.reset();
            for (let k = 0; k < c.fig.length; k++) {
                const f = c.fig[k]!;
                const col = f % c.cols;
                const row = Math.floor(f / c.cols);
                // The crowd arrives row by row, each person settling into place.
                const arrive = smoothstep((p - 0.012 * row) / 0.1);
                if (arrive <= 0) continue;
                const x = snap(col * tw + (tw - FIG_W * cell) / 2) + c.cx[k]! * cell + side / 2;
                const y = snap(row * th + (th - FIG_H * cell) / 2) + (c.cy[k]! - (1 - arrive)) * cell + side / 2;
                if (c.backed[f]) {
                    batch.add(BACKED, x, y, side);
                    continue;
                }
                const gone = smoothstep((p - 0.26 - 0.24 * c.leave[f]! - c.lag[k]!) / 0.16);
                if (gone > 0 && c.edge[k]) batch.add(gone < 0.6 ? GHOST : GHOST + 1, x, y, side);
                const level = Math.round(COPY_LEVELS * c.shade[f]! * arrive * (1 - gone));
                // Dust drifts a little sideways and falls faster as it goes.
                if (level > 0) batch.add(level - 1, x + c.dx[k]! * gone * cell, y + c.fall[k]! * gone * gone * cell, side * (1 - 0.5 * gone));
            }
            batch.draw(surface.ctx, styles, dpr);
            return false;
        },
    };
}
