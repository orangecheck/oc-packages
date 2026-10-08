'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './button';

export interface PaginationProps {
    /** Zero-based page index: the first page is 0. */
    pageIndex?: number;
    /**
     * @deprecated Use `pageIndex`. Same zero-based value; the name hid the base, and
     * four of six call sites passed 1-based numbers, which skipped the first page.
     */
    page?: number;
    pageSize: number;
    total: number;
    /** Called with the zero-based index of the page to show. */
    onPage: (pageIndex: number) => void;
    className?: string;
}

// Read NODE_ENV without depending on @types/node (this is a browser package).
const NODE_ENV = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env
    ?.NODE_ENV;
const warned = new Set<string>();
function warnOnce(key: string, message: string) {
    if (NODE_ENV === 'production' || warned.has(key)) return;
    warned.add(key);
    console.warn(`[Pagination] ${message}`);
}

/**
 * The family's consistent pagination control: a "start–end of total" range
 * label plus prev / next chevron buttons. Zero-based `pageIndex`. Renders
 * nothing when everything fits on one page.
 */
export function Pagination({ pageIndex, page, pageSize, total, onPage, className }: PaginationProps) {
    if (pageIndex === undefined && page !== undefined) {
        warnOnce('page', '`page` is deprecated; pass the zero-based `pageIndex` instead.');
    }
    const index = pageIndex ?? page ?? 0;
    if (total <= pageSize) return null;
    const last = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (index > last) {
        warnOnce(
            'range',
            `pageIndex ${index} is past the last page (${last}) for ${total} rows. pageIndex is zero-based; a 1-based value skips the first page.`
        );
    }
    // A shrinking total (or a 1-based caller on the last page) must not leave the
    // label at "51–50 of 50".
    const current = Math.min(Math.max(0, index), last);
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
