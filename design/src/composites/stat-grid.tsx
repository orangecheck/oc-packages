import type { ReactNode } from 'react';

export interface StatItem {
    /** Short uppercased label rendered in mono. */
    label: string;
    /** Primary value · already formatted as a string. */
    value: string;
    /** Optional secondary line · USD conversion, "last 30 days", etc. */
    sub?: string;
    /** When true, value is rendered in primary tone (use for headline metric). */
    accent?: boolean;
    /** Optional tone for the value (overrides accent). */
    tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';
}

export interface StatGridProps {
    items: StatItem[];
    columns?: 1 | 2 | 3 | 4;
    className?: string;
}

const TONE_CLASS = {
    default: '',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
} as const;

const COL_CLASS = {
    1: '',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
} as const;

/**
 * StatGrid — the canonical stats row used across family dashboards.
 * Lifted from oc-me-web's `me/ui/StatGrid`. Grid of equal-width tiles
 * separated by 1px borders. Always pre-format the value string —
 * the component does no number formatting.
 */
export function StatGrid({ items, columns = 3, className = '' }: StatGridProps) {
    return (
        <div className={`bg-border grid gap-px border ${COL_CLASS[columns]} ${className}`}>
            {items.map((it, i) => (
                <Tile key={`${it.label}-${i}`} item={it} />
            ))}
        </div>
    );
}

function Tile({ item }: { item: StatItem }) {
    const tone = item.tone ?? (item.accent ? 'primary' : 'default');
    return (
        <div className="bg-background p-5">
            <div className="text-muted-foreground/80 font-mono text-[10px] tracking-widest uppercase">
                {item.label}
            </div>
            <div
                className={`font-display mt-1 text-2xl font-bold tabular-nums tracking-tight ${TONE_CLASS[tone]}`}
            >
                {item.value}
            </div>
            {item.sub && (
                <div className="text-muted-foreground/70 mt-1 font-mono text-[10px] tracking-widest uppercase">
                    {item.sub}
                </div>
            )}
        </div>
    );
}

export function StatTile({ children, ...item }: StatItem & { children?: ReactNode }) {
    return (
        <div>
            <Tile item={item} />
            {children}
        </div>
    );
}
