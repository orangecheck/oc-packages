import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * Where a payment goes, as one bar: each segment's width is its share. Made for
 * the orange band ("What it costs"), where ink and white both clear contrast.
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
            <div className="flex h-16 w-full gap-1.5 overflow-hidden rounded-[1.25rem] md:h-20">
                {segments.map((s, i) => (
                    <div
                        key={i}
                        className={cn(
                            'flex min-w-0 items-end rounded-[1rem] px-4 pb-3',
                            s.tone === 'card' ? 'bg-white text-oca-ink' : 'bg-oca-ink text-white'
                        )}
                        style={{ flexBasis: `${s.pct}%` }}
                    >
                        <span className="oca-tabular text-[1.5rem] leading-none tracking-[-0.02em] md:text-[1.875rem]">
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
                                'inline-block size-2.5 shrink-0 translate-y-[-1px] rounded-full',
                                s.tone === 'card' ? 'bg-white' : 'bg-oca-ink'
                            )}
                        />
                        <dd className="text-[0.9375rem] leading-snug">{s.label}</dd>
                    </div>
                ))}
            </dl>
        </figure>
    );
}
