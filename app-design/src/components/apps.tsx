import { Check, Lock } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';
import { Badge } from '../primitives/badge';

/*
 * Parts the family's apps share: the ring a one-time code counts down on, a
 * plan's card, and the preview of what a sign-in or a plan unlocks.
 */

/* ── CountdownRing ───────────────────────────────────────────────────── */

function onSecond(tick: () => void) {
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * Seconds left in a cycle, as a ring that empties and the number beside it,
 * red for the last few. Given only `period` it follows the clock in windows
 * aligned to the epoch, as a TOTP code does; pass `remaining` to drive it.
 * The server draws the full ring with no number, so hydration matches.
 */
export function CountdownRing({
    period,
    remaining,
    warnAt = 5,
    size = 18,
    showSeconds = true,
    className,
}: {
    /** Seconds in one cycle: 30 for most TOTP codes. */
    period: number;
    /** Seconds left. Default: from the clock. */
    remaining?: number;
    /** From here down it turns red. */
    warnAt?: number;
    /** The ring's diameter, in pixels. */
    size?: number;
    /** The "12s" beside the ring. */
    showSeconds?: boolean;
    className?: string;
}) {
    const now = useSyncExternalStore(onSecond, nowSeconds, () => null);
    const left = remaining ?? (now === null ? null : period - (now % period));
    const share = left === null ? 1 : Math.max(0, Math.min(1, left / period));
    const warn = left !== null && left <= warnAt;
    const r = size / 2 - 1.5;
    const c = 2 * Math.PI * r;
    return (
        <span
            role="timer"
            aria-label={left === null ? undefined : `${left} second${left === 1 ? '' : 's'} left`}
            className={cn('inline-flex items-center gap-1.5', warn ? 'text-destructive' : 'text-muted-foreground', className)}
        >
            <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={2} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - share)}
                    // A new cycle refills at once rather than winding back over a second.
                    className={cn(left !== null && left < period && 'transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none')}
                />
            </svg>
            {showSeconds && left !== null ? <span className="text-[0.8125rem] oca-tabular">{left}s</span> : null}
        </span>
    );
}

/* ── PlanCard ────────────────────────────────────────────────────────── */

/**
 * One plan, for a pricing grid: its name and line, the price and what it is
 * per, what it includes, and the way to take it. `highlight` is the one the
 * page argues for; `badge` names a state ("Your plan", "Recommended").
 * Lay four out with `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`; compare them
 * row by row in a ComparisonTable.
 */
export function PlanCard({
    name,
    subtitle,
    price,
    period,
    footnote,
    features = [],
    action,
    badge,
    badgeTone = 'neutral',
    highlight = false,
    as: Tag = 'h3',
    className,
}: {
    name: ReactNode;
    /** One line: who it is for. */
    subtitle?: ReactNode;
    /** The figure: <Sats value={…} />, "Free". */
    price: ReactNode;
    /** What the price is for: "a month", "once". */
    period?: ReactNode;
    /** Under the price: "≈ $12", "billed yearly". */
    footnote?: ReactNode;
    features?: ReactNode[];
    /** At the foot: the button. */
    action?: ReactNode;
    badge?: ReactNode;
    badgeTone?: 'neutral' | 'brand' | 'success' | 'muted';
    highlight?: boolean;
    /** The plan's heading level, where the page puts the card. Default h3. */
    as?: HeadingTag;
    className?: string;
}) {
    return (
        <section
            className={cn(
                'flex h-full flex-col gap-5 rounded-[1.25rem] border bg-card p-6',
                highlight ? 'border-foreground shadow-sm ring-1 ring-foreground' : 'border-border',
                className
            )}
        >
            <div className="flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                    <Tag className="text-[1.0625rem] font-medium leading-snug">{name}</Tag>
                    {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
                </div>
                {subtitle ? <p className="text-[0.875rem] leading-snug text-muted-foreground">{subtitle}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="oca-display-3 oca-tabular">{price}</span>
                    {period ? <span className="text-[0.9375rem] text-muted-foreground">{period}</span> : null}
                </p>
                {footnote ? <p className="text-[0.8125rem] text-muted-foreground">{footnote}</p> : null}
            </div>
            {features.length > 0 ? (
                <ul className="flex flex-col gap-2.5 text-[0.9375rem]">
                    {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                            <Check aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0">{f}</span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {action ? <div className="mt-auto flex flex-col pt-1 [&>*]:w-full">{action}</div> : null}
        </section>
    );
}

/* ── LockedPreview ───────────────────────────────────────────────────── */

/**
 * What a sign-in or a plan unlocks: a real sample of it, faded, out of reach
 * of the pointer, the keyboard and a screen reader, with the way in over its
 * foot. With no sample, the card alone.
 */
export function LockedPreview({
    title,
    description,
    action,
    children,
    as: Tag = 'h2',
    className,
}: {
    /** What opens: "Your watchlist". */
    title: ReactNode;
    /** One line: what it takes ("Sign in. It's free."). */
    description?: ReactNode;
    /** The way in: a button or a link. */
    action: ReactNode;
    /** The sample, drawn as it would be. */
    children?: ReactNode;
    /**
     * The title's heading level. Default h2: a gate is often the whole page
     * under its header, and a page needs a heading.
     */
    as?: HeadingTag;
    className?: string;
}) {
    return (
        <div className={cn('relative', className)}>
            {children ? (
                <div
                    inert
                    aria-hidden
                    data-oca-locked=""
                    className="pointer-events-none max-h-[28rem] select-none overflow-hidden [mask-image:linear-gradient(to_bottom,#000_25%,transparent_85%)]"
                >
                    {children}
                </div>
            ) : null}
            <div className={cn('relative mx-auto flex max-w-md flex-col items-center gap-4 rounded-[1.25rem] border border-border bg-card px-6 py-7 text-center shadow-sm', children && '-mt-40')}>
                <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
                    <Lock className="size-[1.125rem]" />
                </span>
                <div className="flex flex-col gap-1.5">
                    <Tag className="text-[1.0625rem] font-medium leading-snug">{title}</Tag>
                    {description ? <p className="text-[0.9375rem] leading-snug text-muted-foreground">{description}</p> : null}
                </div>
                <div className="flex flex-wrap justify-center gap-2">{action}</div>
            </div>
        </div>
    );
}
