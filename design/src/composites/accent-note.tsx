import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

/**
 * AccentNote — a left-bar aside for a single emphasized line of copy. Use for a
 * caveat, footnote, or pull-quote beside body text. AccentList is the stepped
 * variant: a vertical stack of titled items with one "active" entry expanded.
 * Both are skin-agnostic — token colors only — and re-skin per skin + mode.
 */

export interface AccentNoteProps {
    /** Optional bold lead phrase rendered inline before the body. */
    lead?: ReactNode;
    children: ReactNode;
    tone?: 'default' | 'onBrand';
    className?: string;
}

export function AccentNote({ lead, children, tone = 'default', className }: AccentNoteProps) {
    const onBrand = tone === 'onBrand';
    return (
        <div
            className={cn(
                'border-l-2 pl-4 text-sm leading-relaxed',
                onBrand
                    ? 'border-primary-foreground/60 text-primary-foreground/80'
                    : 'border-primary text-muted-foreground',
                className,
            )}
        >
            {lead && (
                <strong
                    className={cn(
                        'mr-1.5 font-semibold',
                        onBrand ? 'text-primary-foreground' : 'text-foreground',
                    )}
                >
                    {lead}
                </strong>
            )}
            {children}
        </div>
    );
}

export interface AccentListItem {
    title: ReactNode;
    children?: ReactNode;
    active?: boolean;
}

export interface AccentListProps {
    items: AccentListItem[];
    className?: string;
}

export function AccentList({ items, className }: AccentListProps) {
    return (
        <div className={cn('flex flex-col', className)}>
            {items.map((item, i) => (
                <div
                    key={i}
                    className={cn('border-l-2 py-2 pl-5', item.active ? 'border-primary' : 'border-border')}
                >
                    <div
                        className={cn(
                            'font-semibold',
                            item.active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {item.title}
                    </div>
                    {item.active && item.children && (
                        <div className="text-muted-foreground mt-1 text-sm leading-relaxed">
                            {item.children}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
