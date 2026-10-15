import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Badge } from '../primitives/badge';
import { Card, CardNumeral, CardTitle } from '../primitives/card';

export interface StepItem {
    title: ReactNode;
    body: ReactNode;
    /** A small pill beside the title ("in testing", "on the path"). */
    badge?: ReactNode;
    /** Overrides the automatic 01, 02, 03. */
    numeral?: ReactNode;
}

export interface StepGridProps {
    items: StepItem[];
    /**
     * `cards` (white cards, "Sign in. Earn. Own."), `plain` (open columns,
     * "Ask for something a bot can't fake cheaply.") or `ink` (dark cards,
     * "Why partner now"). Numerals are dropped on `ink`, as the deck does.
     */
    look?: 'cards' | 'plain' | 'ink';
    className?: string;
}

const pad = (n: number) => String(n + 1).padStart(2, '0');

export function StepGrid({ items, look = 'cards', className }: StepGridProps) {
    const cols = items.length >= 3 ? 'md:grid-cols-3' : items.length === 2 ? 'md:grid-cols-2' : '';
    return (
        <ol className={cn('grid gap-4 md:gap-5', cols, className)}>
            {items.map((it, i) =>
                look === 'plain' ? (
                    <li key={i} className="flex flex-col gap-3 pr-4">
                        <CardNumeral>{it.numeral ?? pad(i)}</CardNumeral>
                        <CardTitle className="oca-title-sm">
                            {it.title}
                            {it.badge ? <Badge>{it.badge}</Badge> : null}
                        </CardTitle>
                        <div className="oca-body text-[0.9375rem]">{it.body}</div>
                    </li>
                ) : look === 'ink' ? (
                    <li key={i}>
                        <Card tone="ink" padding="md" className="h-full">
                            <CardTitle className="text-oca-ink-title">
                                {it.title}
                                {it.badge ? <Badge tone="onInk">{it.badge}</Badge> : null}
                            </CardTitle>
                            <div className="mt-3 text-[1rem] leading-relaxed text-oca-ink-muted">{it.body}</div>
                        </Card>
                    </li>
                ) : (
                    <li key={i}>
                        <Card padding="md" className="flex h-full flex-col gap-3">
                            <CardNumeral>{it.numeral ?? pad(i)}</CardNumeral>
                            <CardTitle>
                                {it.title}
                                {it.badge ? <Badge>{it.badge}</Badge> : null}
                            </CardTitle>
                            <div className="oca-body">{it.body}</div>
                        </Card>
                    </li>
                )
            )}
        </ol>
    );
}
