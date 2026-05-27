import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface StatBlockProps {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    /** Optional "vs prior period" delta — arrow + colour. */
    delta?: { value: number; suffix?: string } | null;
    tone?: 'default' | 'success' | 'warning' | 'destructive';
    className?: string;
}

/**
 * A single labelled value cell — the building block for every counter grid in a
 * dashboard. Optional delta arrow + colour for period-over-period deltas.
 * (Richer than StatTile: carries a delta. Use StatGrid for laid-out grids.)
 */
export function StatBlock({ label, value, sub, delta, tone = 'default', className }: StatBlockProps) {
    const toneClass =
        tone === 'success'
            ? 'text-success'
            : tone === 'warning'
              ? 'text-warning'
              : tone === 'destructive'
                ? 'text-destructive'
                : 'text-foreground';

    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <span className="label-mono text-[10px]">{label}</span>
            <span
                className={cn(
                    'font-display text-2xl font-bold tracking-tight tabular-nums',
                    toneClass
                )}
            >
                {value}
            </span>
            <div className="flex items-baseline gap-2">
                {sub && (
                    <span className="text-muted-foreground font-mono text-[11px] tracking-wide lowercase">
                        {sub}
                    </span>
                )}
                {delta && (
                    <span
                        className={cn(
                            'font-mono text-[11px] tracking-wide',
                            delta.value > 0
                                ? 'text-success'
                                : delta.value < 0
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                        )}
                    >
                        {delta.value > 0 ? '▲' : delta.value < 0 ? '▼' : '·'}{' '}
                        {Math.abs(delta.value).toFixed(1)}
                        {delta.suffix ?? '%'}
                    </span>
                )}
            </div>
        </div>
    );
}
