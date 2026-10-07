'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './button';

export interface PaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    className?: string;
}

/**
 * The family's consistent pagination control: a "start–end of total" range
 * label plus prev / next chevron buttons. Page-index based (0-based). Renders
 * nothing when everything fits on one page.
 */
export function Pagination({ page, pageSize, total, onPage, className }: PaginationProps) {
    if (total <= pageSize) return null;
    // A shrinking total must not leave the label at "51–50 of 50".
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    const current = Math.min(page, last);
    const start = current * pageSize;
    const shown = Math.min(pageSize, total - start);
    return (
        <nav aria-label="pagination" className={'flex items-center justify-between ' + (className ?? 'mt-3')}>
            <span aria-live="polite" className="text-muted-foreground font-mono text-[11px]">
                {start + 1}–{start + shown} of {total}
            </span>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onPage(current - 1)} disabled={current === 0}>
                    <ChevronLeft className="size-4" /> prev
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPage(current + 1)}
                    disabled={current >= last}
                >
                    next <ChevronRight className="size-4" />
                </Button>
            </div>
        </nav>
    );
}
