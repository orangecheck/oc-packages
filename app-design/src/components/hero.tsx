import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Section } from './section';

/*
 * The top of every public page. Two shapes:
 *
 * - `page` (default): the home page's register. Eyebrow, a display headline,
 *   one line of lead, actions, and optional art beside it.
 * - `document`: for pages that are read top to bottom (privacy, terms,
 *   security, changelog). A centred column with the same eyebrow and a
 *   display headline that is always larger than the document's own h2s.
 */
export interface PageHeroProps {
    eyebrow?: ReactNode;
    title: ReactNode;
    /** One or two sentences. */
    lead?: ReactNode;
    actions?: ReactNode;
    /** Beside the text from md up; below it on a phone. `page` only. */
    art?: ReactNode;
    /** A line of fine print under the lead ("Updated 15 October 2026"). */
    meta?: ReactNode;
    /** Anything else under the actions: a status pill, a stat row. */
    children?: ReactNode;
    variant?: 'page' | 'document';
    /** `xl` is the home page's size; content pages default to `lg`. `page` only. */
    size?: 'lg' | 'xl';
    className?: string;
}

export function PageHero({
    eyebrow,
    title,
    lead,
    actions,
    art,
    meta,
    children,
    variant = 'page',
    size = 'lg',
    className,
}: PageHeroProps) {
    if (variant === 'document') {
        return (
            <Section space="none" className={cn('pb-12 pt-12 md:pb-16 md:pt-20', className)}>
                <DocHeader className="mx-auto max-w-[42rem]" {...{ eyebrow, title, lead, meta, actions }}>
                    {children}
                </DocHeader>
            </Section>
        );
    }
    return (
        <Section space="none" className={cn('pb-14 pt-12 md:pb-20 md:pt-20', className)}>
            <div className={cn('grid grid-cols-1 gap-10', art && 'items-center md:grid-cols-12')}>
                <div className={cn('flex flex-col items-start gap-6', art ? 'md:col-span-7' : 'max-w-[52rem]')}>
                    {eyebrow ? <p className="oca-eyebrow">{eyebrow}</p> : null}
                    <h1 className={size === 'xl' ? 'oca-display-1' : 'oca-display-2'}>{title}</h1>
                    {lead ? <p className="oca-lead max-w-[38rem]">{lead}</p> : null}
                    {meta ? <p className="text-[0.875rem] text-muted-foreground">{meta}</p> : null}
                    {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
                    {children}
                </div>
                {art ? <div className="md:col-span-5">{art}</div> : null}
            </div>
        </Section>
    );
}

/**
 * A document's title block. PageHero's `document` variant wraps it in a band;
 * DocLayout's `header` takes it bare, so it lines up with the text below.
 */
export function DocHeader({
    eyebrow,
    title,
    lead,
    meta,
    actions,
    children,
    className,
}: Pick<PageHeroProps, 'eyebrow' | 'title' | 'lead' | 'meta' | 'actions' | 'children' | 'className'>) {
    return (
        <div className={cn('flex flex-col gap-5', className)}>
            {eyebrow ? <p className="oca-eyebrow">{eyebrow}</p> : null}
            <h1 className="oca-display-2">{title}</h1>
            {lead ? <p className="oca-lead">{lead}</p> : null}
            {meta ? <p className="text-[0.875rem] text-muted-foreground">{meta}</p> : null}
            {actions ? <div className="mt-1 flex flex-wrap gap-3">{actions}</div> : null}
            {children}
        </div>
    );
}

export interface TocItem {
    id: string;
    label: ReactNode;
}

function useActiveHeading(ids: string[]): string | undefined {
    const [active, setActive] = useState<string | undefined>(ids[0]);
    const key = ids.join('|');
    useEffect(() => {
        const els = key
            .split('|')
            .map((id) => document.getElementById(id))
            .filter((el): el is HTMLElement => el !== null);
        if (els.length === 0) return;
        const io = new IntersectionObserver(
            (entries) => {
                const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (hit) setActive(hit.target.id);
            },
            { rootMargin: '-80px 0px -65% 0px' }
        );
        els.forEach((el) => io.observe(el));
        return () => io.disconnect();
    }, [key]);
    return active;
}

/**
 * A readable column for a long document, with its table of contents: a sticky
 * list beside it on desktop, a folded "On this page" above it on a phone. The
 * ids are the ids of the document's h2s. Pass the title as `header` (a
 * DocHeader) so it sits on the same column as the text.
 */
export function DocLayout({
    toc,
    header,
    children,
    className,
}: {
    toc?: TocItem[];
    header?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    const active = useActiveHeading(toc?.map((t) => t.id) ?? []);
    const links = () =>
        toc?.map((t) => (
            <li key={t.id}>
                <a
                    href={`#${t.id}`}
                    aria-current={active === t.id ? 'location' : undefined}
                    className={cn(
                        'block border-l py-1.5 pl-4 text-[0.875rem] leading-snug transition-colors',
                        active === t.id
                            ? 'border-foreground text-foreground'
                            : 'border-border text-muted-foreground hover:text-foreground'
                    )}
                >
                    {t.label}
                </a>
            </li>
        ));
    const hasToc = !!toc && toc.length > 0;
    return (
        <div className={cn('oca-container pb-24', header ? 'pt-12 md:pt-20' : null, className)}>
            <div
                className={cn(
                    'mx-auto grid grid-cols-1 gap-8',
                    hasToc
                        ? 'max-w-[42rem] lg:max-w-[64rem] lg:grid-cols-[13rem_minmax(0,42rem)] lg:gap-x-16 lg:gap-y-10'
                        : 'max-w-[42rem]'
                )}
            >
                {header ? <div className={cn(hasToc && 'lg:col-start-2', 'pb-4')}>{header}</div> : null}
                {hasToc ? (
                    <>
                        <nav
                            aria-label="On this page"
                            className={cn('sticky top-24 hidden self-start lg:block', header && 'lg:row-start-2')}
                        >
                            <p className="mb-3 text-[0.875rem] font-medium">On this page</p>
                            <ul>{links()}</ul>
                        </nav>
                        <details className="group rounded-2xl border border-border bg-card px-4 py-3 lg:hidden">
                            <summary className="cursor-pointer list-none text-[0.9375rem] font-medium marker:hidden">
                                On this page
                            </summary>
                            <ul className="mt-3">{links()}</ul>
                        </details>
                    </>
                ) : null}
                <div className={cn('min-w-0', hasToc && 'lg:col-start-2', hasToc && header && 'lg:row-start-2')}>
                    {children}
                </div>
            </div>
        </div>
    );
}
