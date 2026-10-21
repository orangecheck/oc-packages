import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';

/*
 * The deck's "What you get" panel: a dark card of packages, each a peach title,
 * a coloured identifier and a // comment. The identifier's colour says what it
 * is, the way an editor would: a package, a component tag, a licence link.
 */
export interface PackageItem {
    title: ReactNode;
    /** The thing itself: an npm name, a JSX tag, a licence line. */
    code: ReactNode;
    kind?: 'package' | 'tag' | 'link';
    /** Rendered after `// `. */
    note?: ReactNode;
    href?: string;
}

const KIND = {
    package: 'text-oca-code-package',
    tag: 'text-oca-code-tag',
    link: 'text-oca-code-link',
} as const;

export function PackageCard({ items, as: Tag = 'h3', className }: { items: PackageItem[]; as?: HeadingTag; className?: string }) {
    return (
        <div
            className={cn(
                'grid gap-x-10 gap-y-7 rounded-[1.25rem] border border-oca-ink-line bg-oca-ink-card p-6 text-oca-ink-foreground md:grid-cols-2 md:p-9',
                className
            )}
        >
            {items.map((it, i) => {
                // The design sets identifiers in the text face, not mono: they read as names here.
                const code = <span className={cn('text-[0.9375rem]', KIND[it.kind ?? 'package'])}>{it.code}</span>;
                return (
                    <div key={i} className="flex min-w-0 flex-col gap-1.5">
                        <Tag className="text-[1.125rem] font-semibold tracking-[-0.01em] text-oca-ink-title">{it.title}</Tag>
                        {it.href ? (
                            <a href={it.href} className="w-fit underline decoration-transparent underline-offset-4 hover:decoration-current">
                                {code}
                            </a>
                        ) : (
                            code
                        )}
                        {it.note ? (
                            <p className="text-[0.9375rem] leading-relaxed text-oca-ink-subtle">
                                <span aria-hidden>{'// '}</span>
                                {it.note}
                            </p>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
