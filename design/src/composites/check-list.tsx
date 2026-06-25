import type { ReactNode } from 'react';

import { Check } from 'lucide-react';

import { cn } from '../tokens/cn';

export interface CheckListProps {
    /** Each item: a check glyph + this label. */
    items: ReactNode[];
    orientation?: 'horizontal' | 'vertical';
    tone?: 'default' | 'onBrand';
    className?: string;
}

/**
 * CheckList — a compact run of checkmarked points. use horizontal under a hero
 * or CTA for an inline "what you get" row; vertical for a small feature stack.
 * `tone="onBrand"` when it sits on a brand/dark band.
 */
export function CheckList({
    items,
    orientation = 'horizontal',
    tone = 'default',
    className,
}: CheckListProps) {
    const glyph = tone === 'onBrand' ? 'text-brand-foreground' : 'text-primary';
    const label = tone === 'onBrand' ? 'text-brand-foreground/90' : 'text-foreground';

    return (
        <ul
            className={cn(
                orientation === 'horizontal'
                    ? 'flex flex-wrap gap-x-6 gap-y-2 text-sm'
                    : 'flex flex-col gap-2 text-sm',
                className
            )}
        >
            {items.map((item, i) => (
                <li key={i} className={cn('inline-flex items-center gap-2', label)}>
                    <Check className={cn('size-4 shrink-0', glyph)} />
                    {item}
                </li>
            ))}
        </ul>
    );
}
