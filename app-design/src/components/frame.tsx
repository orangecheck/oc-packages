import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * 2.0's specification-drawing parts (PLAN §2, §4): the one mono label, the
 * framed column, the title-block bar and the hairline stat grid. They read
 * their colours from the ground they sit on (Section's bands set them), so a
 * MonoLabel on the ink or burnt band needs no prop.
 */

type LabelTag = 'p' | 'span' | 'div' | 'dt' | 'h2' | 'h3';

export interface MonoLabelProps extends HTMLAttributes<HTMLElement> {
    as?: LabelTag;
    /** The 7px ember square before the text. Default true. */
    mark?: boolean;
}

/**
 * The one eyebrow and label: JetBrains Mono 12px, uppercase, 0.08em, soft, with
 * a 7px ember square. (PLAN §4 calls it Label; the form field's Label already
 * has that name, so this one is MonoLabel.)
 */
export function MonoLabel({ as = 'p', mark = true, className, children, ...props }: MonoLabelProps) {
    return createElement(
        as,
        { 'data-ui': 'label', className: cn('oca-label inline-flex items-center gap-2.5', className), ...props },
        mark ? <span aria-hidden className="size-[7px] shrink-0 bg-oca-accent-display" /> : null,
        children
    );
}

export interface FrameProps extends HTMLAttributes<HTMLDivElement> {
    as?: 'div' | 'main' | 'section' | 'article' | 'header' | 'footer';
    /** The gutter inside the column. Default true; `false` for content that runs to the hairlines. */
    padded?: boolean;
}

/**
 * The framed column every public page is drawn in: 82.5rem at most, a
 * hairline at each edge from 900px, a gutter of 3rem that narrows to 1rem.
 * Frame is for public pages; DocsShell and AppShell keep their own layouts.
 */
export function Frame({ as = 'div', padded = true, className, ...props }: FrameProps) {
    return createElement(as, {
        'data-oca-frame': '',
        className: cn(
            'mx-auto w-full max-w-[82.5rem] border-border min-[900px]:border-x',
            padded && 'px-[clamp(1rem,0.333rem+2.857vw,3rem)]',
            className
        ),
        ...props,
    });
}

export interface SectionBarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    /** The label at the start, drawn with its square ("How it works"). */
    start: ReactNode;
    /** The label at the end ("01 / 04", "Since 2025"). */
    end?: ReactNode;
    /** The start label's element: `h2` when the bar names the section. Default `p`. */
    as?: LabelTag;
}

/** A title-block row: a mono label at each end, on a hairline. */
export function SectionBar({ start, end, as = 'p', className, ...props }: SectionBarProps) {
    return (
        <div
            data-oca-section-bar=""
            className={cn('flex min-h-11 items-center justify-between gap-4 border-b border-border py-2', className)}
            {...props}
        >
            <MonoLabel as={as}>{start}</MonoLabel>
            {end ? <span className="oca-label text-right">{end}</span> : null}
        </div>
    );
}

export interface StatItem {
    value: ReactNode;
    label: ReactNode;
    /** A line under the label: its source, its date. */
    note?: ReactNode;
}

export interface StatRowProps extends HTMLAttributes<HTMLDListElement> {
    items: StatItem[];
    /** Cells per row from md up. Two on a phone. Default: the number of items, at most four. */
    columns?: 2 | 3 | 4;
    /**
     * `md` (default) for a figure ("21", "3 of 5"); `sm` for values longer than one, such as a
     * sats total or a short phrase. A value longer than its cell wraps at either size.
     */
    size?: 'md' | 'sm';
}

const COLUMNS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' } as const;

/** A hairline stat grid: one figure and its label a cell, the cells ruled like a table. */
export function StatRow({ items, columns, size = 'md', className, ...props }: StatRowProps) {
    const cols = columns ?? (Math.min(4, Math.max(2, items.length)) as 2 | 3 | 4);
    return (
        <dl
            data-oca-stat-row=""
            className={cn('grid grid-cols-2 border-l border-t border-border', COLUMNS[cols], className)}
            {...props}
        >
            {items.map((it, i) => (
                <div key={i} className="flex flex-col-reverse justify-end gap-3 border-b border-r border-border p-5 md:p-6">
                    <dt className="flex flex-col gap-1">
                        <span className="oca-label">{it.label}</span>
                        {it.note ? <span className="text-[0.8125rem] text-oca-subtle">{it.note}</span> : null}
                    </dt>
                    <dd className={cn('oca-stat text-foreground', size === 'sm' && '[--oca-stat-size:clamp(1.375rem,0.9rem+2.2vw,3rem)]')}>{it.value}</dd>
                </div>
            ))}
        </dl>
    );
}
