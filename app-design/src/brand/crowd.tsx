import type { CSSProperties } from 'react';

import { cn } from '../lib/cn';

/*
 * "A bot farm can pretend to be a crowd": a crowd of identical figures in
 * perspective, nearer rows larger, with a few real ones in orange. Identical on
 * purpose: copies are what a bot farm is. Positions come from a fixed seed so
 * server and client draw the same crowd.
 */

export interface CrowdProps {
    cols?: number;
    rows?: number;
    /** How many figures are real (orange). */
    real?: number;
    seed?: number;
    /** Ground it sits on: figures are light on ink, dark on canvas. */
    tone?: 'ink' | 'canvas';
    /** Spoken by screen readers. */
    label?: string;
    /**
     * Let the copies leave as an ancestor's `--p` (0 to 1, set by ScrollStory)
     * rises: each fake falls away at its own moment and the real ones grow.
     */
    story?: boolean;
    className?: string;
}

const CELL_W = 22;
const CELL_H = 27;

function picks(count: number, total: number, seed: number): Set<number> {
    let s = seed >>> 0;
    const out = new Set<number>();
    while (out.size < Math.min(count, total)) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        out.add(s % total);
    }
    return out;
}

export function Crowd({
    cols = 26,
    rows = 9,
    real = 7,
    seed = 21,
    tone = 'ink',
    label = 'A crowd of identical accounts. Only a few are real.',
    story = false,
    className,
}: CrowdProps) {
    const width = cols * CELL_W;
    const scales = Array.from({ length: rows }, (_, r) => 0.5 + 0.5 * (r / Math.max(1, rows - 1)));
    const height = scales.reduce((h, s) => h + CELL_H * s, 0);
    // Real figures only in the nearer half, where they are big enough to see.
    const nearFrom = Math.floor(rows / 2) * cols;
    const realSet = new Set([...picks(real, rows * cols - nearFrom, seed)].map((i) => i + nearFrom));
    const bot = tone === 'ink' ? '#ffffff' : '#0a0a0a';
    // When each copy leaves, from a fixed seed: nearer rows go a little later.
    let lcg = (seed * 7919) >>> 0;
    const leaveAt = () => {
        lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
        return 0.12 + (lcg / 2 ** 32) * 0.6;
    };
    let y = 0;
    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${width} ${Math.ceil(height)}`}
            className={cn('block h-auto w-full overflow-visible', className)}
        >
            {story ? (
                <defs>
                    <radialGradient id="oca-crowd-glow">
                        <stop offset="0" stopColor="#ff7a3d" stopOpacity="0.55" />
                        <stop offset="1" stopColor="#ff7a3d" stopOpacity="0" />
                    </radialGradient>
                </defs>
            ) : null}
            {scales.map((s, r) => {
                const rowY = y;
                y += CELL_H * s;
                const rowW = cols * CELL_W * s;
                const x0 = (width - rowW) / 2;
                return Array.from({ length: cols }, (_, c) => {
                    const i = r * cols + c;
                    const isReal = realSet.has(i);
                    const t = leaveAt();
                    return (
                        <g key={i} transform={`translate(${x0 + c * CELL_W * s} ${rowY}) scale(${s})`}>
                            {isReal && story ? (
                                <circle className="oca-crowd-halo" cx={11} cy={14} r={13} fill="url(#oca-crowd-glow)" />
                            ) : null}
                            <g
                                className={story ? (isReal ? 'oca-crowd-real' : 'oca-crowd-bot') : undefined}
                                style={story && !isReal ? ({ '--t': t.toFixed(3) } as CSSProperties) : undefined}
                                fill={isReal ? 'var(--oca-orange)' : bot}
                                fillOpacity={isReal ? 1 : 0.1 + 0.16 * s}
                            >
                                <circle cx={11} cy={8} r={4.4} />
                                <path d="M3 25a8 8.5 0 0 1 16 0Z" />
                            </g>
                        </g>
                    );
                });
            })}
        </svg>
    );
}
