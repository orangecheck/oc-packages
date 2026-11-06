import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';
import { sectionVariants } from './section';

/*
 * The deck's "What you get" panel: a dark card of packages, each a peach title,
 * a coloured identifier and a // comment. The identifier's colour says what it
 * is, the way an editor would: a package, a component tag, a licence link.
 * With a `tone` it is instead a tile, as ochk.app's /apps draws one: a square
 * panel in that tone, an icon and a mono label across its top, a title, a note,
 * then whatever it holds (an install line, a code sample, a list).
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

interface PackagePanelProps {
    items: PackageItem[];
    as?: HeadingTag;
    className?: string;
    tone?: undefined;
}

export interface PackageTileProps {
    /** The tile's ground: `card` (white), `ink` or `brand` (orange). */
    tone: 'card' | 'ink' | 'brand';
    /** A line icon at the top left, drawn at 40px; orange on ink. */
    icon?: ReactNode;
    /** The mono line at the top right, for example `01 · @orangecheck/me-client`. */
    label?: ReactNode;
    title: ReactNode;
    note?: ReactNode;
    /** What the tile holds under its note. */
    children?: ReactNode;
    as?: HeadingTag;
    className?: string;
    items?: undefined;
}

export type PackageCardProps = PackagePanelProps | PackageTileProps;

export function PackageCard(props: PackageCardProps) {
    if (props.tone) {
        const { tone, icon, label, title, note, children, as: Tag = 'h3', className } = props;
        return (
            <article data-oca-package-tile={tone} className={cn(sectionVariants({ tone, space: 'none' }), 'flex min-w-0 flex-col gap-6 p-6 md:p-8', className)}>
                {icon || label ? (
                    <div className="flex items-start justify-between gap-4">
                        <span aria-hidden className={cn('[&_svg]:size-10 [&_svg]:stroke-[1.5]', tone === 'ink' && 'text-oca-accent-display')}>
                            {icon}
                        </span>
                        {label ? <span className="oca-label text-right normal-case">{label}</span> : null}
                    </div>
                ) : null}
                <div className="flex flex-col gap-3">
                    <Tag className="text-[1.75rem] font-light leading-tight tracking-[-0.025em]">{title}</Tag>
                    {note ? <p className="max-w-[34rem] text-[1rem] leading-relaxed text-muted-foreground">{note}</p> : null}
                </div>
                {children}
            </article>
        );
    }
    const { items, as: Tag = 'h3', className } = props;
    return (
        <div
            className={cn(
                'grid gap-x-10 gap-y-7 rounded-none border border-oca-ink-line bg-oca-ink-card p-6 text-oca-ink-foreground md:grid-cols-2 md:p-9',
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
