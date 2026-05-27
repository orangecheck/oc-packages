import type { ReactNode } from 'react';

import { StatBlock } from '../primitives/stat-block';
import { cn } from '../tokens/cn';

export interface StatCardProps {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    /** Optional period-over-period delta arrow + colour. */
    delta?: { value: number; suffix?: string } | null;
    tone?: 'default' | 'success' | 'warning' | 'destructive';
    /** Padding density — `sm` for dense grids, `default` for standalone cards. */
    pad?: 'sm' | 'default';
    className?: string;
}

/**
 * StatCard — a single stat in a bordered `bg-card` frame. The standalone
 * counterpart to StatBlock (the bare cell) and StatGrid (a laid-out grid):
 * this is the "one stat in its own card" shape that fleet (`dashboard/Stat`)
 * and me (`StatCell`, `ParticipationFeeCard` tiles, etc.) each hand-roll.
 * Wraps StatBlock so the inner cell stays single-source.
 */
export function StatCard({ pad = 'default', className, ...stat }: StatCardProps) {
    return (
        <div className={cn('border bg-card', pad === 'sm' ? 'p-3 md:p-4' : 'p-5', className)}>
            <StatBlock {...stat} />
        </div>
    );
}
