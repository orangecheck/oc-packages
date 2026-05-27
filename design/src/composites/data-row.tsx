import type { ElementType, ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface DataRowProps {
    /** Primary content (left-aligned, grows to fill). */
    children: ReactNode;
    /** Trailing metadata pinned right (timestamp, count, status pill). */
    meta?: ReactNode;
    /** Optional action(s) rendered after the meta (button, link). */
    action?: ReactNode;
    /** Element to render as — `li` inside a list, `div` otherwise. */
    as?: ElementType;
    className?: string;
}

/**
 * DataRow — the "content left, meta right, optional action" list row
 * reimplemented across me (federations, incidents, grants, distributions,
 * fee entries) and other dashboards. Pair inside a `divide-y border` list.
 * On narrow viewports content and meta stack; from `sm` up they sit on one
 * baseline-aligned line.
 */
export function DataRow({ children, meta, action, as, className }: DataRowProps) {
    const Tag = (as ?? 'div') as ElementType;
    return (
        <Tag
            className={cn(
                'flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4',
                className
            )}
        >
            <div className="min-w-0 flex-1">{children}</div>
            {(meta || action) && (
                <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                    {meta && (
                        <span className="text-muted-foreground font-mono text-[11px] tracking-wide">
                            {meta}
                        </span>
                    )}
                    {action}
                </div>
            )}
        </Tag>
    );
}
