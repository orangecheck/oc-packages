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
    const start = page * pageSize;
    const shown = Math.max(0, Math.min(pageSize, total - start));
    return (
        <div className={'flex items-center justify-between ' + (className ?? 'mt-3')}>
            <span className="text-muted-foreground/70 font-mono text-[10px]">
                {start + 1}–{start + shown} of {total}
            </span>
            <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page === 0}>
                    <ChevronLeft className="size-4" /> prev
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPage(page + 1)}
                    disabled={start + pageSize >= total}
                >
                    next <ChevronRight className="size-4" />
                </Button>
            </div>
        </div>
    );
}
