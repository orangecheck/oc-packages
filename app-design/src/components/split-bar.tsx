import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * Where a payment goes, as one bar: each segment's width is its share. Made for
 * the orange band ("What it costs"). The band turns the card surface orange, so a
 * card share and its legend square draw a ring in the text colour (ink there).
 */
export interface SplitSegment {
    pct: number;
    label: ReactNode;
    tone?: 'ink' | 'card';
}

export function SplitBar({
    segments,
    caption,
    className,
}: {
    segments: SplitSegment[];
    caption?: ReactNode;
    className?: string;
}) {
    return (
        <figure className={cn('flex flex-col gap-5', className)}>
            {caption ? <figcaption className="text-[0.9375rem]">{caption}</figcaption> : null}
            <div className="flex h-16 w-full gap-1.5 overflow-hidden rounded-none md:h-20">
                {segments.map((s, i) => (
                    <div
                        key={i}
                        className={cn(
                            'flex min-w-[4.25rem] items-end rounded-none px-3 pb-2.5 md:px-4 md:pb-3',
                            s.tone === 'card' ? 'bg-oca-surface text-oca-surface-foreground ring-2 ring-current ring-inset' : 'bg-oca-ink text-oca-ink-foreground'
                        )}
                        style={{ flexBasis: `${s.pct}%` }}
                    >
                        <span
                            // One size for every figure, so they sit on one line; it fits a segment at its min width.
                            className="oca-tabular text-[1.125rem] leading-none tracking-[-0.02em] md:text-[1.75rem] md:font-light"
                        >
                            {s.pct}%
                        </span>
                    </div>
                ))}
            </div>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {segments.map((s, i) => (
                    <div key={i} className="flex items-baseline gap-2.5">
                        <dt className="sr-only">{s.pct}%</dt>
                        <span
                            aria-hidden
                            className={cn(
                                'inline-block size-2.5 shrink-0 translate-y-[-1px] rounded-none',
                                s.tone === 'card' ? 'bg-oca-surface ring-1 ring-current' : 'bg-oca-ink'
                            )}
                        />
                        <dd className="text-[0.9375rem] leading-snug">{s.label}</dd>
                    </div>
                ))}
            </dl>
        </figure>
    );
}
