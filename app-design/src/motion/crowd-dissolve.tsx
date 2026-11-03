import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';

import { cn } from '../lib/cn';
import { prefersStill, seeded, smoothstep, useMotionSetting, whenIdle } from './env';
import { Batch, inks, mix, rgba, type Inks } from './paint';
import { mountScene, type Mounted } from './scene';
import { watchStory } from './story';

/*
 * "To an app you look like everyone else": a crowd of pixel people on an even
 * grid. As a ScrollStory plays, the copies come apart into dust and fall away,
 * each leaving a ghost in its place, while the backed few warm to orange; at
 * the end the grid still shows how many there were, and which were real. The
 * scroll is the clock: it draws only when the story's `--p` changes, so a page
 * at rest draws nothing. About 4,000 squares, in at most 16 colour buckets.
 *
 * It takes Crowd's props, so a page swaps `<Crowd story>` for it by name.
 */

export interface CrowdDissolveProps {
    /** Places across and down the grid. */
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

// A person on a 7 x 10 grid of squares: a round head over square shoulders, big enough to read as someone.
const FIGURE = ['..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......', '.#####.', '#######', '#######', '#######'];
const CELLS: [number, number][] = FIGURE.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [[x, y] as [number, number]] : [])));
const PX = 10; // cells from one place to the next across
const PY = 13; // and down
const SQUARE = 0.84; // a square's side, of its cell
const COPY_LEVELS = 14; // alpha buckets 1..14 for the copies and their ghosts; 15 is the backed figures
const COPY_ALPHA = 0.72;
const GHOST = 2; // the ghost's bucket: about a tenth of full ink

/** The grid's size in cells: the canvas and the poster both fit it to their box, centred. */
const across = (cols: number) => cols * PX - (PX - FIGURE[0]!.length);
const down = (rows: number) => rows * PY - (PY - FIGURE.length);
/** One figure as squares in its own cells, for the poster. */
const GLYPH = CELLS.map(([x, y]) => `M${x + (1 - SQUARE) / 2} ${y + (1 - SQUARE) / 2}h${SQUARE}v${SQUARE}h-${SQUARE}z`).join('');

export function CrowdDissolve({
    cols = 12,
    rows = 7,
    real = 8,
    seed = 21,
    tone = 'auto',
    label = 'A crowd of identical accounts. The copies fall away and leave empty places; the backed few stay, lit in orange.',
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
    }, [cols, rows, real, seed, tone, setting]);

    useEffect(() => wake.current(), [progress]);

    return (
        <div
            ref={box}
            role="img"
            aria-label={label}
            className={cn('oca-crowd relative', className)}
            style={style}
            data-ground={tone === 'ink' ? 'dark' : tone === 'canvas' ? 'light' : undefined}
        >
            <CrowdPoster cols={cols} rows={rows} real={real} seed={seed} />
            <canvas ref={canvas} aria-hidden className="absolute inset-0 size-full" />
        </div>
    );
}

/** The end state, what a page without script shows: a grid of ghosts (one pattern), and the backed figures over it. */
function CrowdPoster({ cols, rows, real, seed }: { cols: number; rows: number; real: number; seed: number }) {
    const id = useId().replace(/[^a-zA-Z0-9-]/g, '');
    const backed = useMemo(() => {
        const c = build(cols, rows, real, seed);
        return [...c.backed].flatMap((b, f) => (b ? [[(f % cols) * PX, Math.floor(f / cols) * PY] as const] : []));
    }, [cols, rows, real, seed]);
    return (
        <svg viewBox={`0 0 ${across(cols)} ${down(rows)}`} className="oca-crowd-poster absolute inset-0 size-full" aria-hidden>
            <defs>
                <pattern id={`${id}-place`} width={PX} height={PY} patternUnits="userSpaceOnUse">
                    <path d={GLYPH} fill="currentColor" />
                </pattern>
                <path id={`${id}-figure`} d={GLYPH} />
            </defs>
            <rect width={cols * PX} height={rows * PY} fill={`url(#${id}-place)`} opacity={(GHOST / COPY_LEVELS) * COPY_ALPHA} />
            <g fill="var(--oca-orange, var(--brand))">
                {backed.map(([x, y]) => (
                    <use key={`${x} ${y}`} href={`#${id}-figure`} x={x} y={y} />
                ))}
            </g>
        </svg>
    );
}

interface Crowd {
    /** Per figure: backed, its ink (0 to 1), when it comes apart (0 to 1). */
    backed: Uint8Array;
    shade: Float32Array;
    leave: Float32Array;
    /** Per square: its figure, its cell, and where its dust goes (in cells). */
    fig: Uint16Array;
    cx: Uint8Array;
    cy: Uint8Array;
    dx: Float32Array;
    dy: Float32Array;
    rows: number;
    cols: number;
}

function build(cols: number, rows: number, real: number, seed: number): Crowd {
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
        const edge = cols > 4 && rows > 3 && (x === 0 || y === 0 || x === cols - 1 || y === rows - 1);
        if (edge || backed[y * cols + x] || picked.some(([px, py]) => Math.hypot(px - x, py - y) < gap)) continue;
        backed[y * cols + x] = 1;
        picked.push([x, y]);
    }
    const n = count * CELLS.length;
    const c: Crowd = {
        backed,
        shade: Float32Array.from({ length: count }, () => 0.75 + 0.25 * rand()),
        leave: Float32Array.from({ length: count }, () => rand()),
        fig: new Uint16Array(n),
        cx: new Uint8Array(n),
        cy: new Uint8Array(n),
        dx: new Float32Array(n),
        dy: new Float32Array(n),
        rows,
        cols,
    };
    let k = 0;
    for (let f = 0; f < count; f++) {
        for (const [x, y] of CELLS) {
            const a = rand() * Math.PI * 2;
            const r = 3 + 9 * rand();
            c.fig[k] = f;
            c.cx[k] = x;
            c.cy[k] = y;
            c.dx[k] = Math.cos(a) * r;
            c.dy[k] = Math.sin(a) * r - 6;
            k++;
        }
    }
    return c;
}

function crowdScene(c: Crowd, surface: Mounted['surface'], progress: () => number) {
    const n = c.fig.length;
    // A leaving copy draws its dust and its ghost: two squares a cell at most.
    const batch = new Batch(n * 2);
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
            for (let k = 0; k <= COPY_LEVELS; k++) styles.push(rgba(ink.base, (COPY_ALPHA * k) / COPY_LEVELS));
            last = -1;
        },
        frame() {
            const p = progress();
            // The scroll is the clock: an unchanged story is an unchanged picture.
            if (p === last || !ink) return false;
            last = p;
            const cell = Math.min(surface.width / across(c.cols), surface.height / down(c.rows));
            const x0 = (surface.width - across(c.cols) * cell) / 2;
            const y0 = (surface.height - down(c.rows) * cell) / 2;
            const side = cell * SQUARE;
            const warm = smoothstep((p - 0.38) / 0.25);
            styles[COPY_LEVELS + 1] = rgba(mix(ink.base, ink.heat, warm), Math.max(COPY_ALPHA, warm) * smoothstep(p / 0.12));
            surface.clear();
            batch.reset();
            for (let k = 0; k < n; k++) {
                const f = c.fig[k]!;
                const row = Math.floor(f / c.cols);
                // The crowd arrives row by row, each person settling down into place.
                const arrive = smoothstep((p - 0.012 * row) / 0.1);
                if (arrive <= 0) continue;
                const hx = x0 + ((f % c.cols) * PX + c.cx[k]! + 0.5) * cell;
                const hy = y0 + (row * PY + c.cy[k]! + 0.5 - (1 - arrive) * 2) * cell;
                if (c.backed[f]) {
                    batch.add(COPY_LEVELS + 1, hx, hy, side);
                    continue;
                }
                const gone = smoothstep((p - 0.3 - 0.22 * c.leave[f]!) / 0.18);
                if (gone > 0) batch.add(Math.max(1, Math.round(GHOST * gone)), hx, hy, side);
                const level = Math.round(COPY_LEVELS * c.shade[f]! * arrive * (1 - gone));
                if (level > 0) batch.add(level, hx + c.dx[k]! * gone * cell, hy + c.dy[k]! * gone * cell, side * (1 - 0.45 * gone));
            }
            batch.draw(surface.ctx, styles, surface.dpr);
            return false;
        },
    };
}
