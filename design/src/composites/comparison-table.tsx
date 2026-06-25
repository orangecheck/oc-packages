import type { ReactNode } from 'react';

import { Check, X } from 'lucide-react';

import { cn } from '../tokens/cn';

export interface ComparisonRow {
    label: ReactNode;
    theirs: ReactNode;
    ours: ReactNode;
}

export interface ComparisonTableProps {
    rows: ComparisonRow[];
    columns?: { feature?: string; theirs: string; ours: string };
    className?: string;
}

/**
 * ComparisonTable — a two-column "them vs us" feature matrix for marketing pages.
 * the ours column is tinted (bg-accent/40) and its checks read text-primary; the
 * theirs column reads muted with X glyphs. skin-agnostic, scrolls on small screens.
 */
export function ComparisonTable({ rows, columns, className }: ComparisonTableProps) {
    const cols = { feature: '', theirs: 'A normal login', ours: 'OrangeCheck', ...columns };
    return (
        <div className={cn('overflow-hidden rounded-xl border', className)}>
            <div className="overflow-x-auto">
                <div className="min-w-[32rem]">
                    <div className="grid grid-cols-3">
                        <div className="label-mono text-muted-foreground px-4 py-3.5 sm:px-6">
                            {cols.feature}
                        </div>
                        <div className="px-4 py-3.5 font-semibold text-foreground sm:px-6">
                            {cols.theirs}
                        </div>
                        <div className="bg-accent/60 px-4 py-3.5 font-semibold text-primary sm:px-6">
                            {cols.ours}
                        </div>
                    </div>
                    {rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-3 border-t">
                            <div className="px-4 py-3.5 font-medium text-foreground sm:px-6">
                                {row.label}
                            </div>
                            <div className="text-muted-foreground flex items-center gap-2 px-4 py-3.5 sm:px-6">
                                <X className="text-muted-foreground/70 size-4" />
                                <span>{row.theirs}</span>
                            </div>
                            <div className="bg-accent/40 flex items-center gap-2 px-4 py-3.5 text-foreground sm:px-6">
                                <Check className="size-4 text-primary" />
                                <span>{row.ours}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
