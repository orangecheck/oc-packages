import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';

// Bundlers replace process.env.NODE_ENV; the typeof guard covers one that doesn't.
declare const process: { env: { NODE_ENV?: string } } | undefined;

const N = new Intl.NumberFormat('en-US');

/**
 * Which rows are showing, and the way to the next page and back. `pageIndex`
 * counts from 0: page one is 0, its rows are `pageIndex * pageSize` up to the
 * next page's first. One page or fewer shows nothing.
 */
export function Pagination({
    pageIndex,
    pageSize,
    total,
    onPage,
    label = 'Pagination',
    className,
}: {
    /** From 0. */
    pageIndex: number;
    pageSize: number;
    total: number;
    onPage: (pageIndex: number) => void;
    /** The navigation's name for a screen reader: "Stamps, pages". Default "Pagination", apart from the shell's "Pages". */
    label?: string;
    className?: string;
}) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const index = Math.min(Math.max(0, pageIndex), pages - 1);
    if (index !== pageIndex && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(`Pagination: pageIndex ${pageIndex} is outside 0–${pages - 1}; it counts from 0.`);
    }
    if (total <= pageSize) return null;
    const from = index * pageSize + 1;
    const to = Math.min(total, (index + 1) * pageSize);
    return (
        <nav aria-label={label} className={cn('flex items-center justify-between gap-4', className)}>
            <p aria-live="polite" className="oca-tabular text-[0.875rem] text-muted-foreground">
                {N.format(from)}–{N.format(to)} of {N.format(total)}
            </p>
            <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => onPage(index - 1)} className="pl-3">
                    <ChevronLeft aria-hidden />
                    Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={index >= pages - 1} onClick={() => onPage(index + 1)} className="pr-3">
                    Next
                    <ChevronRight aria-hidden />
                </Button>
            </div>
        </nav>
    );
}
