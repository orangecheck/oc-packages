import type { ReactNode } from 'react';

import { IsoCheck } from '../brand/iso-check';
import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';
import { Accordion, AccordionItem } from '../primitives/accordion';
import { Reveal } from './motion';
import { Section, SectionIntro } from './section';
import { Display, Eyebrow } from './typography';

/**
 * A section's title on a public page: eyebrow, headline, one line. It rises
 * into place the first time it is seen (`reveal={false}` keeps it still).
 */
export function SectionHeading({
    eyebrow,
    title,
    lead,
    id,
    onInk = false,
    level = 2,
    as = 'h2',
    align = 'start',
    reveal = true,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    lead?: ReactNode;
    /** The heading's id, for a link to the section. */
    id?: string;
    /** On an ink band: the eyebrow and lead take the ink tones. */
    onInk?: boolean;
    /** Visual size. 3 for a block inside a section. */
    level?: 2 | 3;
    as?: 'h2' | 'h3';
    align?: 'start' | 'center';
    reveal?: boolean;
    className?: string;
}) {
    return (
        <SectionIntro align={align} reveal={reveal} className={cn('max-w-3xl gap-4 md:gap-4', className)}>
            {eyebrow ? <Eyebrow onInk={onInk}>{eyebrow}</Eyebrow> : null}
            <Display level={level} as={as} id={id} className="scroll-mt-24">
                {title}
            </Display>
            {lead ? <p className={cn('oca-lead', onInk && 'text-oca-ink-muted')}>{lead}</p> : null}
        </SectionIntro>
    );
}

/**
 * One titled block of facts, for pages where a reader checks a claim: a
 * heading, one or two sentences, a link or two beside the title saying where
 * the full number lives, then the facts.
 */
export function FactBlock({
    id,
    title,
    description,
    aside,
    children,
    as: Tag = 'h2',
    className,
}: {
    id?: string;
    title: ReactNode;
    description?: ReactNode;
    /** Links beside the title: the source, the raw data. */
    aside?: ReactNode;
    children?: ReactNode;
    /** The title's heading level, where the page puts it. Default h2. */
    as?: HeadingTag;
    className?: string;
}) {
    return (
        <section id={id} className={cn('flex scroll-mt-24 flex-col gap-6', className)}>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-8">
                <div className="flex max-w-[44rem] flex-col gap-3">
                    <Tag className="oca-display-3">{title}</Tag>
                    {description ? <div className="oca-body text-[1.0625rem]">{description}</div> : null}
                </div>
                {aside ? <div className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-[0.9375rem]">{aside}</div> : null}
            </div>
            {children}
        </section>
    );
}

export interface FactRow {
    key: string;
    title: ReactNode;
    /** A figure beside the title: a limit, a count. */
    figure?: ReactNode;
    fields: { label: ReactNode; value: ReactNode }[];
}

/**
 * A table that stays readable on a phone: one row per subject, each value
 * under its own label. Wide pages lay the values side by side.
 */
export function FactRows({
    rows,
    columns = 1,
    label,
    as: Tag = 'h3',
    className,
}: {
    rows: FactRow[];
    /** Two columns of fields from md up. */
    columns?: 1 | 2;
    /** The list's name for a screen reader. */
    label: string;
    /** Each row's heading level, where the page puts the list. Default h3. */
    as?: HeadingTag;
    className?: string;
}) {
    return (
        <ul aria-label={label} className={cn('divide-y divide-border rounded-[1.25rem] border border-border bg-card', className)}>
            {rows.map((r) => (
                <li key={r.key} className="flex flex-col gap-5 px-5 py-6 md:px-8 md:py-7">
                    {/* The figure keeps its own line end; a long title wraps beside it. */}
                    <div className="flex items-baseline justify-between gap-x-6">
                        <Tag className="oca-title min-w-0 text-pretty">{r.title}</Tag>
                        {r.figure ? (
                            <span className="oca-tabular shrink-0 whitespace-nowrap text-[1.75rem] leading-none tracking-[-0.02em]">
                                {r.figure}
                            </span>
                        ) : null}
                    </div>
                    <dl className={columns === 2 ? 'grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2' : 'flex flex-col gap-4'}>
                        {r.fields.map((f, i) => (
                            <div key={i} className="flex min-w-0 flex-col gap-1">
                                <dt className="text-[0.875rem] font-medium text-muted-foreground">{f.label}</dt>
                                <dd className="break-words text-[1rem] leading-relaxed">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                </li>
            ))}
        </ul>
    );
}

export interface Endpoint {
    href: string;
    /** What it returns, in a line. */
    description: ReactNode;
    /** Shown instead of the address (a path for a long URL). */
    label?: string;
}

/** Public endpoints and what each returns: the same numbers, for your own tooling. Each opens raw, in a new tab. */
export function EndpointList({ items, label, className }: { items: Endpoint[]; label?: string; className?: string }) {
    return (
        <ul aria-label={label} className={cn('divide-y divide-border rounded-[1.25rem] border border-border bg-card', className)}>
            {items.map((a) => (
                <li key={a.href}>
                    <a
                        href={a.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-accent/60 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                    >
                        <code className="break-all text-[0.875rem] text-foreground">{a.label ?? a.href}</code>
                        <span className="text-[0.875rem] text-muted-foreground sm:text-right">
                            {a.description}
                            <span className="sr-only"> (opens in a new tab)</span>
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    );
}

/**
 * A row of short claims between two hairlines, under a hero: an icon in the
 * accent and a few words each. Two to a row on a phone, four on a desk.
 */
export function ProofStrip({ items, className }: { items: { icon?: ReactNode; label: ReactNode }[]; className?: string }) {
    return (
        <div className={cn('border-y border-border', className)}>
            <ul className="oca-container grid grid-cols-2 gap-x-6 gap-y-4 py-6 md:grid-cols-4">
                {items.map((it, i) => (
                    <li
                        key={i}
                        className="flex items-center gap-3 text-[0.9375rem] [&_svg]:size-[1.1rem] [&_svg]:shrink-0 [&_svg]:text-oca-accent-ink"
                    >
                        {it.icon ? <span aria-hidden className="flex">{it.icon}</span> : null}
                        {it.label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** The last band of a page: one large line, the actions, and the check settling beside them. */
export function Closing({
    title,
    lead,
    actions,
    fineprint,
    art,
    as: Tag = 'h2',
    className,
}: {
    title: ReactNode;
    lead?: ReactNode;
    actions?: ReactNode;
    /** Small print under the actions: a credit (Acknowledgement), what a button commits you to. */
    fineprint?: ReactNode;
    /** Beside the words from md up. Defaults to the check; `null` leaves it out. */
    art?: ReactNode;
    /** The title's heading level, where the page puts it. Default h2. */
    as?: HeadingTag;
    className?: string;
}) {
    return (
        <Section className={cn('overflow-hidden', className)}>
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12">
                <Reveal className="flex flex-col items-start gap-8 md:col-span-7">
                    <div className="flex flex-col gap-5">
                        <Tag className="oca-display-1 text-[clamp(2.5rem,1.5rem+4vw,5rem)] leading-[1]">{title}</Tag>
                        {lead ? <p className="oca-lead max-w-[34rem]">{lead}</p> : null}
                    </div>
                    {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
                    {/* 52ch in em: a ch is the face's 0, which the fallback draws 6% narrower, so the measure moved at the swap. */}
                    {fineprint ? <div className="max-w-[32.7em] text-[0.875rem] leading-relaxed text-muted-foreground">{fineprint}</div> : null}
                </Reveal>
                {art !== null ? (
                    // Room under the check on a phone, so its glow fades before the band ends.
                    <div aria-hidden className="flex justify-center max-md:pb-16 md:col-span-5">
                        {art ?? <IsoCheck size={340} settle tilt className="max-w-full" />}
                    </div>
                ) : null}
            </div>
        </Section>
    );
}

/** Questions and their answers, one open at a time. One sentence an answer, where it can be. */
export function Faq({
    items,
    className,
}: {
    items: { q: ReactNode; a: ReactNode; id?: string }[];
    className?: string;
}) {
    return (
        <Accordion single className={className}>
            {items.map((it, i) => (
                <AccordionItem key={it.id ?? i} id={it.id} title={it.q}>
                    {it.a}
                </AccordionItem>
            ))}
        </Accordion>
    );
}
