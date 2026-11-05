import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { visibleBottom, visibleObserver } from '../lib/viewport';
import { usePrefersStill } from './parts';

/*
 * A few steps on a rising path: square nodes, the walked part in orange, the
 * rest dotted. The orange line draws itself the first time it comes into
 * view; under reduced motion, and without script, it is simply drawn. The
 * steps are an ordered list in the DOM, laid over the drawing, so they read
 * and translate as text.
 */

export interface PathStep {
    label: ReactNode;
    href?: string;
}

export interface StepPathProps {
    steps: PathStep[];
    /** The step in progress: those before it are done. Default: the first. */
    current?: number;
    /** What a screen reader hears after each step's name. */
    stateWords?: { done: string; current: string; upcoming: string };
    className?: string;
}

const W = 100;
const H = 60;

/** Where the nodes sit, in a 100 × 60 box: the /how drawing for four, an even rise for any other count. */
function nodes(n: number): [number, number][] {
    if (n === 4)
        return [
            [9, 50],
            [37, 25],
            [60, 34],
            [89, 9],
        ];
    if (n < 2) return [[50, 30]];
    return Array.from({ length: n }, (_, i) => {
        const x = 9 + (i * 80) / (n - 1);
        const y = 50 - (i * 41) / (n - 1) + (i > 0 && i < n - 1 ? (i % 2 ? -5 : 7) : 0);
        return [x, y] as [number, number];
    });
}

/** One smooth curve through the points (Catmull-Rom as cubic Béziers), one segment per gap. */
function segments(p: [number, number][]): string[] {
    return p.slice(0, -1).map((a, i) => {
        const b = p[i + 1]!;
        const z = p[i - 1] ?? a;
        const c = p[i + 2] ?? b;
        const c1 = [a[0] + (b[0] - z[0]) / 6, a[1] + (b[1] - z[1]) / 6];
        const c2 = [b[0] - (c[0] - a[0]) / 6, b[1] - (c[1] - a[1]) / 6];
        return `C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b[0]} ${b[1]}`;
    });
}

export function StepPath({ steps, current = 0, stateWords = { done: 'done', current: 'now', upcoming: 'next' }, className }: StepPathProps) {
    const ref = useRef<HTMLDivElement>(null);
    const clip = useId().replace(/:/g, '');
    const still = usePrefersStill();
    // 'drawn' until script decides otherwise: the server's picture is the finished one.
    const [line, setLine] = useState<'drawn' | 'armed' | 'drawing'>('drawn');
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Still, or nothing to say when it is seen: the finished line. Hydration first runs this with the
        // server's answer (not still) and may arm the line, so a reader who asked for stillness must put it back.
        if (still || typeof IntersectionObserver === 'undefined') {
            setLine('drawn');
            return;
        }
        // Already on screen at load (above a phone's TabBar): left alone, so nothing above the fold redraws.
        const r = el.getBoundingClientRect();
        if (r.top < visibleBottom() && r.bottom > 0) return;
        setLine('armed');
        const io = visibleObserver(
            ([e]) => {
                if (e?.isIntersecting) {
                    setLine('drawing');
                    io.disconnect();
                }
            },
            { threshold: 0.5 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [still]);

    const pts = nodes(steps.length);
    const segs = segments(pts);
    const at = Math.min(Math.max(current, 0), steps.length - 1);
    const start = (i: number) => `M${pts[i]![0]} ${pts[i]![1]}`;
    const walked = at > 0 ? start(0) + segs.slice(0, at).join('') : '';
    const ahead = at < steps.length - 1 ? start(at) + segs.slice(at).join('') : '';

    return (
        <div ref={ref} data-line={line} className={cn('@container relative w-full', className)}>
            {/* Room above the top node and below the bottom one for a 44px label, where the drawing's own margin
                (15% of its height, 9cqi) is short of it: none on a wide box, about 1.75rem at 390. */}
            <div className="py-[max(0px,calc(3.75rem-9cqi))]">
                <div className="relative aspect-[5/3]">
                    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible">
                        {/* The walked line is revealed left to right (the path only ever moves right), so a dash never has to match a scaled length. */}
                        <clipPath id={clip}>
                            <rect
                                x={-5}
                                y={-10}
                                width={W + 10}
                                height={H + 20}
                                style={{
                                    transformOrigin: '-5px 0',
                                    transform: line === 'armed' ? 'scaleX(0)' : 'scaleX(1)',
                                    transition: line === 'drawing' ? 'transform 1000ms cubic-bezier(0.16, 1, 0.3, 1)' : undefined,
                                }}
                            />
                        </clipPath>
                        {ahead ? (
                            <path d={ahead} fill="none" strokeWidth={2} strokeLinecap="round" strokeDasharray="0 6" vectorEffect="non-scaling-stroke" className="stroke-muted-foreground opacity-50" />
                        ) : null}
                        {walked ? (
                            <path d={walked} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" clipPath={`url(#${clip})`} className="stroke-oca-accent-display" />
                        ) : null}
                    </svg>
                    <ol className="absolute inset-0">
                        {steps.map((s, i) => {
                            const state = i < at ? 'done' : i === at ? 'current' : 'upcoming';
                            const [x, y] = pts[i]!;
                            // Labels alternate under and over their node, as the path rises and dips. The end ones run inward
                            // from their node and the rest centre on it; each may wrap to stay inside the box.
                            const below = i % 2 === 0;
                            const end = steps.length < 2 ? 'middle' : i === 0 ? 'start' : i === steps.length - 1 ? 'end' : 'middle';
                            const room = { start: `calc(${100 - x}cqi + 0.4375rem)`, end: `calc(${x}cqi + 0.4375rem)`, middle: `${2 * Math.min(x, 100 - x)}cqi` }[end];
                            const words = (
                                <>
                                    {s.label}
                                    <span className="sr-only">, {stateWords[state]}</span>
                                </>
                            );
                            return (
                                <li
                                    key={i}
                                    aria-current={state === 'current' ? 'step' : undefined}
                                    data-state={state}
                                    className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                                    style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'block size-3.5',
                                            state === 'done' && 'bg-oca-accent-display',
                                            state === 'current' && 'border-2 border-oca-accent-display bg-background',
                                            state === 'upcoming' && 'border-[1.5px] border-oca-hairline-strong bg-background'
                                        )}
                                    />
                                    <span
                                        data-edge={end}
                                        className={cn(
                                            'absolute w-max text-[0.8125rem] md:text-[0.9375rem]',
                                            end === 'start' && 'left-0 text-left',
                                            end === 'end' && 'right-0 text-right',
                                            end === 'middle' && 'left-1/2 -translate-x-1/2 text-center',
                                            below ? 'top-full mt-2' : 'bottom-full mb-2',
                                            state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
                                        )}
                                        style={{ maxWidth: room }}
                                    >
                                        {s.href ? (
                                            <a href={s.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:[outline:2px_solid_var(--ring)]">
                                                {words}
                                            </a>
                                        ) : (
                                            words
                                        )}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>
        </div>
    );
}
