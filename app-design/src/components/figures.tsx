import { Info, Maximize2 } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { HIT_32 } from '../lib/hit';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../primitives/overlay';

/*
 * Numbers and where they come from: a panel that opens to the full window,
 * the note that names a figure's source, the card that floats over a canvas,
 * and the parts of a hand-drawn chart. The series colours are tokens
 * (--oca-chart-1…4, -neutral, -up, -down, -grid); a chart library is not.
 */

/* ── Chart colours and chrome ────────────────────────────────────────── */

export type ChartTone = 1 | 2 | 3 | 4 | 'neutral' | 'up' | 'down';

/** The CSS colour for a series: `chartColor(0)` is orange, and indexes past four cycle. */
export function chartColor(series: number | ChartTone): string {
    if (typeof series === 'string') return `var(--oca-chart-${series})`;
    const n = series >= 1 && series <= 4 && Number.isInteger(series) ? series : (((series % 4) + 4) % 4) + 1;
    return `var(--oca-chart-${n})`;
}

export interface LegendItem {
    label: ReactNode;
    /** A series number (1–4), neutral, up or down, or any CSS colour. */
    color: ChartTone | string;
    /** A dashed line in the chart: the swatch is dashed too. */
    dashed?: boolean;
}

/**
 * The frame for a chart drawn by hand in SVG: a legend above, the chart, a
 * caption. Inside it the chart takes the system's chrome by class:
 * `oca-chart-tick` (axis labels), `oca-chart-grid`, `oca-chart-axis`,
 * `oca-chart-zero`, `oca-chart-crosshair`, `oca-chart-marker`; a hover
 * card takes `oca-chart-tooltip`. Colour series with `chartColor(i)`.
 */
export function ChartFrame({
    legend,
    caption,
    children,
    className,
}: {
    legend?: LegendItem[];
    /** Under the chart: what it shows, its window. A SourceNote fits here. */
    caption?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <figure className={cn('oca-chart flex min-w-0 flex-col gap-3', className)}>
            {legend && legend.length > 0 ? (
                <ul className="oca-chart-legend" aria-label="Legend">
                    {legend.map((l, i) => {
                        const c = typeof l.color === 'number' || ['neutral', 'up', 'down'].includes(String(l.color)) ? chartColor(l.color as ChartTone) : String(l.color);
                        return (
                            <li key={i}>
                                <span aria-hidden data-swatch={l.dashed ? 'dashed' : ''} style={{ '--swatch': c } as CSSProperties} />
                                {l.label}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
            <div className="relative min-w-0">{children}</div>
            {caption ? <figcaption className="text-[0.8125rem] leading-snug text-muted-foreground">{caption}</figcaption> : null}
        </figure>
    );
}

/**
 * A small line for a trend, drawn from its numbers: no axes, no labels. It
 * stretches to its box (give it a width with `className`), and its name for
 * a screen reader says what it shows. `tone="trend"` colours it up or down
 * by its last value against its first.
 */
export function Sparkline({
    values,
    label,
    tone = 'ink',
    area = false,
    width = 96,
    height = 24,
    className,
}: {
    values: readonly number[];
    /** What it shows, read in place of the picture: "Sign-ups per day, 30 days, 12 to 40". */
    label: string;
    tone?: 'ink' | 'muted' | 'trend' | ChartTone;
    /** Fill under the line. */
    area?: boolean;
    width?: number;
    height?: number;
    className?: string;
}) {
    const gradient = useId().replace(/[^a-zA-Z0-9]/g, '');
    const pts = values.filter((v) => Number.isFinite(v));
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const span = hi - lo || 1;
    const pad = 1.5;
    const x = (i: number) => (pts.length < 2 ? width / 2 : (i / (pts.length - 1)) * width);
    const y = (v: number) => pad + (1 - (v - lo) / span) * (height - pad * 2);
    const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
    const color =
        tone === 'ink'
            ? 'var(--foreground)'
            : tone === 'muted'
              ? 'var(--muted-foreground)'
              : tone === 'trend'
                ? chartColor(pts.length > 1 && pts[pts.length - 1]! < pts[0]! ? 'down' : 'up')
                : chartColor(tone);
    return (
        <svg
            role="img"
            aria-label={label}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            width={width}
            height={height}
            className={cn('block overflow-visible', className)}
            style={{ color }}
        >
            {pts.length > 0 ? (
                <>
                    {area ? (
                        <>
                            <defs>
                                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor="currentColor" stopOpacity={0.22} />
                                    <stop offset="1" stopColor="currentColor" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <path d={`${line} L${x(pts.length - 1).toFixed(2)},${height} L${x(0).toFixed(2)},${height} Z`} fill={`url(#${gradient})`} />
                        </>
                    ) : null}
                    <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </>
            ) : null}
        </svg>
    );
}

/* ── Where a number comes from ───────────────────────────────────────── */

export interface SourceNoteProps {
    /** Who: "mempool.space", "Bitnodes". */
    source: ReactNode;
    /** Its page or endpoint, linked. */
    href?: string;
    /** How it is read: the endpoint, the method, how to reproduce it. */
    detail?: ReactNode;
    /** When: "Updated 2 min ago", "Every block". */
    updated?: ReactNode;
    /**
     * `popover`: a small "Source" button that opens the note. `line`: the
     * note as one line of fine print, for a place a popover cannot open over
     * (a canvas in full screen) or a footer.
     */
    variant?: 'popover' | 'line';
    className?: string;
}

/** "Where this number comes from": the source named and linked, one press away (or always in view). */
export function SourceNote({ source, href, detail, updated, variant = 'popover', className }: SourceNoteProps) {
    const name = href ? (
        <a href={href} className="text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground" rel="noreferrer" target="_blank">
            {source}
            <span className="sr-only"> (opens in a new tab)</span>
        </a>
    ) : (
        <span className="text-foreground">{source}</span>
    );
    if (variant === 'line') {
        return (
            <p className={cn('text-[0.75rem] leading-snug text-muted-foreground', className)}>
                Source: {name}
                {updated ? <> · {updated}</> : null}
            </p>
        );
    }
    return (
        <Popover>
            <PopoverTrigger
                className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-full px-2 text-[0.75rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    className
                )}
            >
                <Info aria-hidden className="size-3.5" />
                Source
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-[min(calc(100vw-2rem),20rem)] flex-col gap-2 p-4 text-[0.875rem]">
                <p className="text-[0.75rem] text-muted-foreground">Where this number comes from</p>
                <p className="font-medium">{name}</p>
                {detail ? <div className="text-[0.8125rem] leading-snug text-muted-foreground [&_code]:font-mono">{detail}</div> : null}
                {updated ? <p className="text-[0.8125rem] text-muted-foreground">{updated}</p> : null}
            </PopoverContent>
        </Popover>
    );
}

/* ── Panel ───────────────────────────────────────────────────────────── */

/**
 * A titled panel for a chart or a table: its title and one line, actions on
 * the right, the body, and its source at the foot. `expandable` adds a
 * button that opens the same body over the full window (Esc closes it). Give
 * `children` as a function to draw it bigger there: `(expanded) => <Chart
 * height={expanded ? 520 : 240} />`.
 */
export function Panel({
    title,
    description,
    actions,
    source,
    expandable = false,
    children,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    /** Beside the title: a range switch, a menu. */
    actions?: ReactNode;
    /** At the foot: a SourceNote. */
    source?: ReactNode;
    expandable?: boolean;
    children: ReactNode | ((expanded: boolean) => ReactNode);
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const body = (expanded: boolean) => (typeof children === 'function' ? children(expanded) : children);
    const head = (expanded: boolean) => (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            {/* The text takes the room the actions leave, so they stay top right; it wraps only below 12rem. */}
            <div className="flex min-w-[min(100%,12rem)] flex-1 basis-0 flex-col gap-1">
                {expanded ? (
                    <DialogTitle className="text-[1.0625rem] font-medium leading-snug">{title}</DialogTitle>
                ) : (
                    <h3 className="text-[1rem] font-medium leading-snug">{title}</h3>
                )}
                {description ? (
                    expanded ? (
                        <DialogDescription className="text-[0.875rem] leading-snug text-muted-foreground">{description}</DialogDescription>
                    ) : (
                        <p className="text-[0.875rem] leading-snug text-muted-foreground">{description}</p>
                    )
                ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {actions}
                {expandable && !expanded ? (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-label="Open full screen"
                        className={cn(
                            'inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                            HIT_32
                        )}
                    >
                        <Maximize2 aria-hidden className="size-4" />
                    </button>
                ) : null}
            </div>
        </header>
    );
    return (
        <section className={cn('flex min-w-0 flex-col gap-4 rounded-[1.25rem] border border-border bg-card p-5 md:p-6', className)}>
            {head(false)}
            <div className="min-w-0">{body(false)}</div>
            {source ? <div className="-mb-1 border-t border-border pt-3">{source}</div> : null}
            {expandable ? (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent
                        {...(description ? {} : { 'aria-describedby': undefined })}
                        className="flex h-[min(92dvh,56rem)] w-[min(96vw,80rem)] max-w-none flex-col gap-4 overflow-y-auto"
                    >
                        {head(true)}
                        {/* The body scrolls inside itself, so the title stays at the top and the source at the foot. */}
                        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{open ? body(true) : null}</div>
                        {source ? <div className="border-t border-border pt-3">{source}</div> : null}
                    </DialogContent>
                </Dialog>
            ) : null}
        </section>
    );
}

/* ── HudCard ─────────────────────────────────────────────────────────── */

/**
 * A card that floats over a canvas (a globe, a map): translucent, blurred
 * behind, its eyebrow with a live dot, a headline, rows and a footnote. The
 * canvas sets where it sits. Text stays on the card's own background, so it
 * reads whatever the scene draws behind it.
 */
export function HudCard({
    eyebrow,
    live = false,
    title,
    children,
    footer,
    className,
}: {
    /** Small, above: "Next block", "Fees". */
    eyebrow?: ReactNode;
    /** A pulsing dot beside the eyebrow: the figure updates by itself. */
    live?: boolean;
    /** The headline figure. */
    title?: ReactNode;
    children?: ReactNode;
    /** Under a rule: a SourceNote variant="line". */
    footer?: ReactNode;
    className?: string;
}) {
    return (
        <div
            data-oca-hud=""
            className={cn(
                'flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-xl border border-border bg-background/85 p-3 text-[0.8125rem] shadow-sm backdrop-blur-md',
                className
            )}
        >
            {eyebrow ? (
                <p className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                    {live ? <span aria-hidden className="size-1.5 rounded-full bg-oca-orange-deep motion-safe:animate-pulse" /> : null}
                    {eyebrow}
                </p>
            ) : null}
            {title ? <p className="text-[1.125rem] font-medium leading-tight oca-tabular">{title}</p> : null}
            {children}
            {footer ? <div className="border-t border-border pt-2">{footer}</div> : null}
        </div>
    );
}
