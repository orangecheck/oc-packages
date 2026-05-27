import { Fragment, type ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface DefinitionItem {
    label: ReactNode;
    value: ReactNode;
}

export interface DefinitionListProps {
    items: DefinitionItem[];
    className?: string;
}

/**
 * DefinitionList — the mono-label / value `<dl>` grid reimplemented in agent's
 * inspector, vote's reveal page, and me (BondAnchorCard, OperatorIdentityCard,
 * FrozenBanner). Labels render in uppercase mono; values align in a second
 * column on wider viewports, stacking on narrow ones. Long values (hashes,
 * addresses) wrap via `break-all`.
 */
export function DefinitionList({ items, className }: DefinitionListProps) {
    return (
        <dl
            className={cn(
                'grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[auto_1fr] sm:items-baseline',
                className
            )}
        >
            {items.map((item, i) => (
                <Fragment key={i}>
                    <dt className="label-mono text-muted-foreground text-[10px]">{item.label}</dt>
                    <dd className="text-foreground font-mono text-xs break-all">{item.value}</dd>
                </Fragment>
            ))}
        </dl>
    );
}
