import { useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { ScrollFade } from '../primitives/scroll-fade';
import { CopyButton } from './data';

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

export function PackageCard({ items, className }: { items: PackageItem[]; className?: string }) {
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
                        <h3 className="text-[1.125rem] font-semibold tracking-[-0.01em] text-oca-ink-title">{it.title}</h3>
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

/**
 * A block of code: a header with its name and a copy button, then the code on
 * a dark well that scrolls sideways (with an edge that says so) rather than
 * cutting a line off. Past `maxLines` it folds, with a button to show the rest.
 */
export function CodeBlock({
    code,
    caption,
    copy = true,
    maxLines,
    className,
}: {
    code: string;
    /** The file, language or purpose. Defaults to "Code". */
    caption?: ReactNode;
    copy?: boolean;
    maxLines?: number;
    className?: string;
}) {
    const lines = code.split('\n').length;
    const foldable = maxLines !== undefined && lines > maxLines + 2;
    const [open, setOpen] = useState(false);
    const folded = foldable && !open;
    return (
        <figure
            className={cn(
                'overflow-hidden rounded-[1.25rem] border border-[var(--oca-code-line)] bg-[var(--oca-code-surface)]',
                className
            )}
        >
            <figcaption className="flex h-11 items-center justify-between gap-3 border-b border-[var(--oca-code-line)] pl-5 pr-2">
                <span className="truncate text-[0.8125rem] text-oca-ink-subtle">{caption ?? 'Code'}</span>
                {copy ? (
                    <CopyButton
                        value={code}
                        label="Copy code"
                        className="text-oca-ink-subtle hover:bg-white/10 hover:text-white"
                    />
                ) : null}
            </figcaption>
            <div className="relative">
                <div
                    className={cn(folded && 'overflow-hidden')}
                    style={folded ? { maxHeight: `calc(${maxLines} * 1.625em + 2.5rem)` } : undefined}
                >
                    <ScrollFade fade="var(--oca-code-surface)">
                        <pre className="w-max min-w-full p-5 font-mono text-[0.875rem] leading-[1.625] text-oca-ink-muted [font-variant-ligatures:none]">
                            <code>{code}</code>
                        </pre>
                    </ScrollFade>
                </div>
                {foldable ? (
                    <div
                        className={cn(
                            'flex justify-center px-5 pb-4',
                            folded && 'absolute inset-x-0 bottom-0 pt-16'
                        )}
                        style={
                            folded
                                ? { background: 'linear-gradient(to top, var(--oca-code-surface) 40%, transparent)' }
                                : undefined
                        }
                    >
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className="rounded-full border border-white/20 px-4 py-1.5 text-[0.8125rem] text-white transition-colors hover:bg-white/10"
                        >
                            {open ? 'Show less' : `Show all ${lines} lines`}
                        </button>
                    </div>
                ) : null}
            </div>
        </figure>
    );
}
