import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { clamp01, easeOut, finePointer, glide, prefersStill, seeded, smoothstep, useMotionSetting, whenReady } from './env';
import { Batch, inks, mix, rgba, type Surface } from './paint';
import { bustPoints, type Points } from './points';
import { PORTRAIT_POSTER, PORTRAIT_POSTER_DARK } from './portrait-poster';
import { mountScene, type Mounted, type SceneParts } from './scene';

/*
 * A person made of dots. A loose cloud gathers into the portrait, notes on
 * hairline leaders name what the account does, one orange "real" wave rises
 * through the figure, and the scene sleeps. It draws nothing at rest; a fine
 * pointer parts the dots like a lens while it moves.
 *
 * The figure says where it is on data-phase: "forming" while the play runs,
 * paused or not, and "formed" in its last frame, as the loop goes to sleep,
 * so a page that waits for it sees no frame after. The lens may wake the loop
 * again without changing it; a replay is "forming" until it sleeps once
 * more. The notes come in on data-notes, once the dots have gathered.
 *
 * Still first: the page paints a poster (the settled portrait as one SVG path,
 * or a faint cloud where the scene will play) and the canvas starts when the
 * main thread is idle, so first paint and LCP never wait on it. The notes are
 * DOM text, readable and selectable; the canvas is decoration.
 */

export interface Callout {
    /** Where the + lands, in the portrait's unit square (0,0 top left). */
    at: readonly [number, number];
    label: ReactNode;
    /** The label's side; the nearer edge by default. */
    side?: 'left' | 'right';
    /**
     * Where the label's near end sits, in the same square. By default just
     * outside the square on its side, level with `at`.
     */
    to?: readonly [number, number];
}

export interface ParticlePortraitProps {
    /** The dots, or a loader for them; a bust drawn from shapes by default (bustPoints). */
    points?: Points | (() => Promise<Points>);
    /** Notes on the picture, in reading order. */
    callouts?: readonly Callout[];
    /** What the picture shows, for screen readers. */
    alt: string;
    /** 'auto' follows the theme; pin it for a band of its own colour. */
    ground?: 'auto' | 'light' | 'dark';
    /** Part the dots under a fine pointer. */
    lens?: boolean;
    /** Shown until the canvas draws, without script, and under reduced motion. The bust's own with the default points; none with others. */
    poster?: ReactNode;
    /** The control's words. */
    labels?: { pause?: string; play?: string; replay?: string };
    className?: string;
    style?: CSSProperties;
}

// The timeline, in seconds of play.
const DRIFT = 0.3; // the cloud before it gathers
const GATHER = 1.0; // each dot's flight
const SPREAD = 0.6; // the latest dot leaves this much after the first
const FORMED = DRIFT + SPREAD + GATHER; // the notes come in
const WAVE = FORMED + 0.15; // the front starts below the figure
const WAVE_RISE = 1.3; // the front crosses it
const WAVE_LAG = 0.9; // the back follows
const END = WAVE + WAVE_LAG + WAVE_RISE + 0.1;
const DOT = 0.76; // a screened dot's width at full tone, of the pitch
const STIPPLE = 0.62; // a stippled dot's width, of the spacing at full density
const CLOUD_ALPHA = 0.45;
const LEVELS = 8; // alpha levels while gathering, heat levels while the wave passes

type Phase = 'forming' | 'formed';
type Play = 'playing' | 'paused' | 'done';

export function ParticlePortrait({
    points,
    callouts = [],
    alt,
    ground = 'auto',
    lens = true,
    poster,
    labels,
    className,
    style,
}: ParticlePortraitProps) {
    const root = useRef<HTMLElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const [play, setPlay] = useState<Play>('playing');
    const control = useRef<{ toggle(): void } | null>(null);
    const setting = useMotionSetting();

    useEffect(() => {
        const el = stage.current;
        const cv = canvas.current;
        const fig = root.current;
        if (!el || !cv || !fig) return;
        const still = prefersStill();
        const setNotes = (on: boolean) => fig.toggleAttribute('data-notes', on);
        const setPhase = (p: Phase) => {
            if (fig.dataset.phase !== p) fig.dataset.phase = p;
            if (p === 'formed') setNotes(true);
        };
        let mounted: Mounted | null = null;
        let gone = false;
        // Hydrate when idle; at once when the scene comes back after a change of setting.
        const cancelIdle = whenReady(fig, async () => {
            let pts: Points;
            try {
                pts = typeof points === 'function' ? await points() : (points ?? (await bustPoints()));
            } catch {
                setPhase('formed');
                return;
            }
            if (gone) return;
            mounted = mountScene(
                cv,
                el,
                (surface, wake) => portraitScene(pts, surface, wake, el, { still, lens: lens && !still && finePointer(), setPhase, setNotes, setPlay, control }),
                // Written to the DOM, not to state: the first frame costs no React render.
                {
                    ground,
                    onDraw: () => (fig.dataset.live = ''),
                    // A scene that failed shows its poster and its notes, and asks for nothing more.
                    onFail: () => {
                        delete fig.dataset.live;
                        fig.dataset.fallback = '';
                        setPhase('formed');
                    },
                }
            );
            mounted.wake();
        });
        return () => {
            gone = true;
            cancelIdle();
            mounted?.stop();
            control.current = null;
        };
    }, [points, ground, lens, setting]);

    // Labels beside the square only where the widest fits there; otherwise the numbered marks and the legend, as
    // below 46rem (data-crowded). A label starts just outside the square, so the stage must be 1.04 squares and two
    // labels wide: measured against the story's widest label ("Drawn from shapes, not a photo", 232px with its
    // padding), a 702px-tall stage switches at 1194px wide, so 1440 keeps its labels and 768 to 1180 list them.
    // Read with the labels drawn, in the frame after a resize, so nothing is painted between; a label the 46rem
    // query hides reads as spilling, which only repeats the legend that query already shows.
    useEffect(() => {
        const el = stage.current;
        const fig = root.current;
        if (!el || !fig || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() =>
            requestAnimationFrame(() => {
                fig.removeAttribute('data-crowded');
                const s = el.getBoundingClientRect();
                const spill = (l: Element) => l.getBoundingClientRect().left < s.left || l.getBoundingClientRect().right > s.right;
                fig.toggleAttribute('data-crowded', [...el.querySelectorAll('.oca-note-label')].some(spill));
            })
        );
        ro.observe(fig);
        return () => ro.disconnect();
    }, [callouts]);

    const words = { pause: 'Pause animation', play: 'Play animation', replay: 'Replay animation', ...labels };
    const placed = callouts.map((c, i) => {
        const side = c.side ?? (c.at[0] < 0.5 ? 'left' : 'right');
        const to = c.to ?? ([side === 'left' ? -0.02 : 1.02, c.at[1]] as const);
        return { ...c, side, to, i };
    });
    return (
        <figure
            ref={root}
            className={cn('oca-portrait relative m-0 flex flex-col', className)}
            style={style}
            data-ground={ground === 'auto' ? undefined : ground}
        >
            <div ref={stage} className="oca-portrait-stage relative min-h-[18rem] flex-1">
                <div className="oca-portrait-poster" aria-hidden>
                    {poster ?? (points ? null : (
                        <svg viewBox="0 0 1000 1000" className="size-full">
                            <path className="oca-portrait-ink" d={PORTRAIT_POSTER} fill="currentColor" />
                            <path className="oca-portrait-light" d={PORTRAIT_POSTER_DARK} fill="currentColor" />
                        </svg>
                    ))}
                </div>
                <div className="oca-portrait-cloud" aria-hidden />
                <canvas ref={canvas} aria-hidden className="oca-portrait-canvas absolute inset-0 size-full" />
                {placed.length ? (
                    <ul className="oca-portrait-notes">
                        {placed.map(({ at, to, side, label, i }) => (
                            <li
                                key={i}
                                className="oca-note"
                                data-side={side}
                                style={{ '--i': i, '--ax': at[0], '--ay': at[1], '--lx': to[0], '--ly': to[1] } as CSSProperties}
                            >
                                <Leader at={at} to={to} />
                                <span className="oca-note-mark" aria-hidden>
                                    <svg viewBox="0 0 14 14" width="14" height="14">
                                        <path d="M7 0v14M0 7h14" stroke="currentColor" strokeWidth="1.2" />
                                    </svg>
                                    <span className="oca-note-num">{i + 1}</span>
                                </span>
                                <span className="oca-note-label">{label}</span>
                            </li>
                        ))}
                    </ul>
                ) : null}
                <button
                    type="button"
                    className="oca-portrait-control"
                    aria-label={play === 'playing' ? words.pause : play === 'paused' ? words.play : words.replay}
                    title={play === 'playing' ? words.pause : play === 'paused' ? words.play : words.replay}
                    onClick={() => control.current?.toggle()}
                >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                        {play === 'playing' ? (
                            <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
                        ) : play === 'paused' ? (
                            <path d="M4.5 3v10l8-5z" fill="currentColor" />
                        ) : (
                            <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        )}
                    </svg>
                </button>
            </div>
            {placed.length ? (
                <ol className="oca-portrait-legend">
                    {placed.map(({ label, i }) => (
                        <li key={i}>
                            <span className="oca-note-num" aria-hidden>
                                {i + 1}
                            </span>
                            {label}
                        </li>
                    ))}
                </ol>
            ) : null}
            <figcaption className="sr-only">{alt}</figcaption>
        </figure>
    );
}

/** A dashed hairline from the + to the label: an SVG over the box between them, so the dashes stay in pixels. */
function Leader({ at, to }: { at: readonly [number, number]; to: readonly [number, number] }) {
    const x0 = Math.min(at[0], to[0]);
    const y0 = Math.min(at[1], to[1]);
    const down = (to[0] - at[0]) * (to[1] - at[1]) >= 0;
    return (
        <svg
            className="oca-note-leader"
            aria-hidden
            style={{ '--x0': x0, '--y0': y0, '--w': Math.abs(to[0] - at[0]), '--h': Math.abs(to[1] - at[1]) } as CSSProperties}
        >
            <line x1="0" y1={down ? '0' : '100%'} x2="100%" y2={down ? '100%' : '0'} />
        </svg>
    );
}

interface PortraitOptions {
    still: boolean;
    lens: boolean;
    setPhase(p: Phase): void;
    /** The notes in or out: in once the dots have gathered. */
    setNotes(on: boolean): void;
    setPlay(p: Play): void;
    /** Where the pause button finds the scene. */
    control: { current: { toggle(): void } | null };
}

/** The drawing: positions, the gather, the wave and the lens, for points in a unit square fitted to the box. */
function portraitScene(pts: Points, surface: Surface, wake: () => void, host: HTMLElement, o: PortraitOptions): SceneParts {
    const n = pts.count;
    const rand = seeded(0x51ee);
    // The cloud the dots start in: a loose band across the whole box, as fractions of it.
    const su = new Float32Array(n);
    const sv = new Float32Array(n);
    const phase = new Float32Array(n);
    const delay = new Float32Array(n);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
        cx += pts.x[i]!;
        cy += pts.y[i]!;
    }
    cx /= n || 1;
    cy /= n || 1;
    let far = 0;
    for (let i = 0; i < n; i++) far = Math.max(far, Math.hypot(pts.x[i]! - cx, pts.y[i]! - cy));
    for (let i = 0; i < n; i++) {
        const r = rand();
        su[i] = 0.03 + 0.94 * rand();
        sv[i] = 0.5 + Math.pow(r, 0.7) * (rand() < 0.5 ? -1 : 1) * 0.34 + 0.07 * Math.sin(su[i]! * 9);
        phase[i] = rand() * Math.PI * 2;
        // The figure gathers from its middle out, a little unevenly.
        delay[i] = SPREAD * (0.7 * (Math.hypot(pts.x[i]! - cx, pts.y[i]! - cy) / (far || 1)) + 0.3 * rand());
    }

    const batch = new Batch(n);
    let styles: string[] = [];
    // Per dot, for the ground it is on: whether it is drawn, and its full width as a fraction of the pitch.
    const drawn = new Uint8Array(n);
    const width = new Float32Array(n);
    let t = o.still ? END : 0;
    let paused = false;
    let done = o.still;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, k: 0, on: false };

    o.control.current = {
        toggle() {
            if (done) {
                // Replay the wave: the figure stays, the light passes again.
                t = WAVE;
                done = false;
                paused = false;
                o.setPlay('playing');
            } else {
                paused = !paused;
                o.setPlay(paused ? 'paused' : 'playing');
                if (paused) pointer.on = false;
            }
            wake();
        },
    };

    const move = (e: PointerEvent) => {
        // Paused means still, and the control is not part of the picture.
        if (paused || (e.target as Element | null)?.closest?.('.oca-portrait-control')) return leave();
        const b = host.getBoundingClientRect();
        pointer.tx = e.clientX - b.left;
        pointer.ty = e.clientY - b.top;
        if (!pointer.on) {
            pointer.x = pointer.tx;
            pointer.y = pointer.ty;
        }
        pointer.on = true;
        wake();
    };
    function leave() {
        if (!pointer.on) return;
        pointer.on = false;
        wake();
    }
    if (o.lens) {
        host.addEventListener('pointermove', move);
        host.addEventListener('pointerleave', leave);
    }

    // Under reduced motion it is formed in its one frame, as it sleeps.
    if (o.still) o.setPlay('done');
    return {
        theme(dark: boolean) {
            for (let i = 0; i < n; i++) {
                if (pts.grounds) {
                    // A stipple: the dots for this ground, a little larger where the picture is fuller.
                    drawn[i] = pts.grounds[i]! & (dark ? 2 : 1) ? 1 : 0;
                    width[i] = STIPPLE * (0.8 + 0.2 * (dark ? 1 - pts.tone[i]! : pts.tone[i]!));
                } else {
                    // A screen: every dot, as wide as its ink.
                    drawn[i] = 1;
                    width[i] = Math.sqrt(pts.tone[i]!) * DOT;
                }
            }
            const { base, heat } = inks(dark);
            styles = [];
            for (let k = 0; k < LEVELS; k++) styles.push(rgba(base, CLOUD_ALPHA + ((1 - CLOUD_ALPHA) * k) / (LEVELS - 1)));
            for (let k = 0; k < LEVELS; k++) styles.push(rgba(mix(base, heat, k / (LEVELS - 1))));
        },
        frame(_now: number, dt: number) {
            if (!paused && !done) t = Math.min(END, t + dt);
            const W = surface.width;
            const H = surface.height;
            const side = Math.min(W, H);
            const ox = (W - side) / 2;
            const oy = (H - side) / 2;
            const pitch = pts.pitch * side;
            pointer.x += (pointer.tx - pointer.x) * 0.2;
            pointer.y += (pointer.ty - pointer.y) * 0.2;
            pointer.k += ((pointer.on ? 1 : 0) - pointer.k) * 0.14;
            const L = side * 0.15;
            const lensOn = pointer.k > 0.01;

            // The wave: a front rising from below the figure, its back a moment behind.
            const front = t < WAVE ? -1 : -0.15 + 1.4 * glide(clamp01((t - WAVE) / WAVE_RISE));
            const back = t < WAVE + WAVE_LAG ? -1 : -0.15 + 1.4 * glide(clamp01((t - WAVE - WAVE_LAG) / WAVE_RISE));

            surface.clear();
            batch.reset();
            for (let i = 0; i < n; i++) {
                if (!drawn[i]) continue;
                const tx = ox + pts.x[i]! * side;
                const ty = oy + pts.y[i]! * side;
                const full = Math.max(1, width[i]! * pitch);
                let x = tx;
                let y = ty;
                let s = full;
                let bucket = LEVELS - 1;
                if (t < FORMED) {
                    const e = easeOut(clamp01((t - DRIFT - delay[i]!) / GATHER));
                    const wob = 0.012 * side * (1 - e);
                    const fx = su[i]! * W + Math.sin(t * 0.8 + phase[i]!) * wob;
                    const fy = sv[i]! * H + Math.cos(t * 0.7 + phase[i]!) * wob;
                    x = fx + (tx - fx) * e;
                    y = fy + (ty - fy) * e;
                    s = 1.5 + (full - 1.5) * e;
                    bucket = Math.round(e * (LEVELS - 1));
                } else if (front > -1) {
                    // Distance from just below the figure's foot, so the light climbs it.
                    const d = Math.hypot(pts.x[i]! - 0.5, pts.y[i]! - 1.05);
                    const h = Math.max(0, smoothstep((front - d) / 0.16) - smoothstep((back - d) / 0.16));
                    if (h > 0.01) {
                        bucket = LEVELS + Math.round(h * (LEVELS - 1));
                        s = full * (1 + 0.12 * h);
                    }
                }
                if (lensOn) {
                    const dx = x - pointer.x;
                    const dy = y - pointer.y;
                    const dd = Math.hypot(dx, dy);
                    if (dd < L) {
                        const f = (1 - dd / L) * pointer.k;
                        s *= 1 - 0.7 * f * f;
                        if (dd > 0.001) {
                            x += (dx / dd) * f * pitch * 2.4;
                            y += (dy / dd) * f * pitch * 2.4;
                        }
                    }
                }
                batch.add(bucket, x, y, s);
            }
            batch.draw(surface.ctx, styles, surface.dpr);

            o.setNotes(t >= FORMED);
            if (!done && t >= END) {
                done = true;
                o.setPlay('done');
            }
            const settled = Math.abs(pointer.tx - pointer.x) < 0.2 && Math.abs(pointer.ty - pointer.y) < 0.2 && Math.abs((pointer.on ? 1 : 0) - pointer.k) < 0.01;
            const more = (!done && !paused) || !settled;
            if (done && !more) o.setPhase('formed');
            else if (!done && t > 0) o.setPhase('forming');
            return more;
        },
        dispose() {
            o.control.current = null;
            host.removeEventListener('pointermove', move);
            host.removeEventListener('pointerleave', leave);
        },
    };
}
