import { ArrowUpRight } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';

import { PROTOCOLS, protocolSite, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Field, Input, Textarea } from '../primitives/form';
import { ScrollFade } from '../primitives/scroll-fade';
import { StatusBadge } from '../primitives/status-badge';
import { Callout } from './docs';
import { PageHero } from './hero';
import { TextLink } from './text-link';

/*
 * The parts of a protocol's page on ochk.io. Each takes the protocol's slug
 * and reads its word, verb, links and kinds from the registry, so the six
 * pages are the same page with different data and cannot drift.
 */

/** The top of a protocol page: "Protocol · provenance", the title, one line, the ways in. */
export function ProtocolHero({
    protocol,
    title,
    lead,
    actions,
    art,
    children,
    className,
}: {
    protocol: ProtocolSlug;
    title: ReactNode;
    lead?: ReactNode;
    actions?: ReactNode;
    /** Beside the words from md up: the artifact itself, at size. */
    art?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    const p = protocolSite(protocol);
    return (
        <PageHero
            className={className}
            eyebrow={`Protocol · ${p.verb}`}
            title={title}
            lead={lead}
            actions={actions}
            art={art}
        >
            {p.status !== 'live' || children ? (
                <div className="flex flex-col items-start gap-4">
                    {p.status !== 'live' ? <StatusBadge status={p.status} /> : null}
                    {children}
                </div>
            ) : null}
        </PageHero>
    );
}

/** The six protocols as a row of links, the current one underlined. Scrolls sideways on a phone. */
export function ProtocolNav({
    current,
    link = 'page',
    className,
}: {
    current?: ProtocolSlug;
    link?: 'page' | 'tool';
    className?: string;
}) {
    return (
        <nav aria-label="Protocols" className={className}>
            <ScrollFade fade="var(--background)">
                <ul className="flex w-max min-w-full items-center gap-6 border-b border-border">
                    {PROTOCOLS.map((p) => {
                        const on = p.slug === current;
                        return (
                            <li key={p.slug}>
                                <a
                                    href={link === 'tool' ? p.toolHref : p.pageHref}
                                    aria-current={on ? 'page' : undefined}
                                    className={cn(
                                        '-mb-px inline-flex h-11 items-center border-b-2 text-[0.9375rem] transition-colors',
                                        on
                                            ? 'border-foreground text-foreground'
                                            : 'border-transparent text-muted-foreground hover:text-foreground'
                                    )}
                                >
                                    {p.label}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </ScrollFade>
        </nav>
    );
}

/** Which normative file a page summarises: its default file, title and sentence. */
export type SpecFileKind = 'spec' | 'security' | 'rationale';

const SPEC_FILE: Record<SpecFileKind, { file: string; title: string; note: string }> = {
    spec: {
        file: 'SPEC.md',
        title: 'Normative source',
        note: 'This page is a human-readable summary. The authoritative copy lives in the spec repo. If the two ever drift, the repo wins.',
    },
    security: {
        file: 'SECURITY.md',
        title: 'Normative threat model',
        note: 'This page is the short form. The authoritative, numbered threat model lives in the spec repo.',
    },
    rationale: {
        file: 'WHY.md',
        title: 'Design rationale',
        note: 'This page is the short version. The full rationale and the rejected-design log live in the spec repo.',
    },
};

export type SpecCardProps =
    | {
          protocol: ProtocolSlug;
          version: string;
          license?: string;
          /** How many test vectors ship with it. */
          vectors?: number;
          size?: 'md' | 'sm';
          className?: string;
          repo?: never;
      }
    | {
          /** One file in any spec repo, `oc-chat-protocol` included: where a page's normative copy lives. */
          repo: string;
          /** Default: the kind's file (SPEC.md, SECURITY.md, WHY.md). */
          file?: string;
          kind?: SpecFileKind;
          version?: string;
          /** Replaces the kind's sentence. */
          note?: ReactNode;
          className?: string;
          protocol?: never;
      };

/**
 * The spec, as a card: its repository, version, licence, kinds and test
 * vectors, and the way to read it. `sm` is one line, for a reference in
 * running text or a docs page. Given a `repo` instead of a protocol, it is
 * a note naming one file in that repo as the normative copy of the page.
 */
export function SpecCard(props: SpecCardProps) {
    return props.repo !== undefined ? <SpecFileNote {...props} /> : <ProtocolSpecCard {...props} />;
}

function SpecFileNote({ repo, file, kind = 'spec', version, note, className }: Extract<SpecCardProps, { repo: string }>) {
    const d = SPEC_FILE[kind];
    const f = file ?? d.file;
    return (
        <Callout title={version ? `${d.title} · ${version}` : d.title} className={className}>
            <p>{note ?? d.note}</p>
            <p>
                <TextLink href={`https://github.com/orangecheck/${repo}/blob/main/${f}`} className="break-all font-mono text-[0.875rem]">
                    {`${repo}/${f}`}
                </TextLink>
            </p>
        </Callout>
    );
}

function ProtocolSpecCard({ protocol, version, license, vectors, size = 'md', className }: Extract<SpecCardProps, { protocol: ProtocolSlug }>) {
    const p = protocolSite(protocol);
    const repo = `oc-${p.slug}-protocol`;
    const facts: [string, ReactNode][] = [
        ['Version', version],
        ...(license ? ([['Licence', license]] as [string, ReactNode][]) : []),
        ['Nostr kind', p.kinds],
        ...(vectors !== undefined ? ([['Test vectors', String(vectors)]] as [string, ReactNode][]) : []),
    ];
    if (size === 'sm') {
        return (
            <a
                href={p.specHref}
                className={cn(
                    'group flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-[0.875rem] transition-colors hover:border-oca-hairline-strong',
                    className
                )}
            >
                <span className="font-mono text-[0.8125rem] text-foreground">{repo}</span>
                <span className="text-muted-foreground">
                    {facts.map(([k, v]) => (k === 'Version' ? `v${v}` : k === 'Nostr kind' ? `kind ${v}` : v)).join(' · ')}
                </span>
                <span className="ml-auto flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
                    Read the spec <ArrowUpRight aria-hidden className="size-4" />
                </span>
            </a>
        );
    }
    return (
        <div className={cn('flex flex-col gap-6 rounded-[1.25rem] border border-border bg-card p-6 md:p-8', className)}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-[0.875rem] text-muted-foreground">The spec</p>
                    <h3 className="oca-title break-all font-mono text-[1.0625rem] tracking-normal">{repo}</h3>
                </div>
                {p.status !== 'live' ? <StatusBadge status={p.status} /> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {facts.map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1">
                        <dt className="text-[0.8125rem] text-muted-foreground">{k}</dt>
                        <dd className="oca-tabular text-[1.0625rem]">{v}</dd>
                    </div>
                ))}
            </dl>
            <div>
                <Button asChild variant="secondary" size="sm">
                    <a href={p.specHref}>
                        Read the spec <ArrowUpRight aria-hidden />
                    </a>
                </Button>
            </div>
        </div>
    );
}

/**
 * Paste an id, an envelope or a link and go to the page that checks it.
 * Without `onVerify` it is a plain GET form to `action`, so it works before
 * any script has loaded.
 */
export function VerifyBox({
    action,
    param = 'q',
    title,
    description,
    label = 'Id, envelope or link',
    placeholder,
    hint,
    submitLabel = 'Verify',
    multiline = false,
    onVerify,
    className,
}: {
    /** Where the form goes: the tool's verify page. */
    action: string;
    /** The query parameter that carries what was pasted. */
    param?: string;
    title?: ReactNode;
    description?: ReactNode;
    label?: ReactNode;
    placeholder?: string;
    hint?: ReactNode;
    submitLabel?: string;
    /** A textarea, for a whole envelope. */
    multiline?: boolean;
    /** Handle it here instead of navigating. */
    onVerify?: (value: string) => void;
    className?: string;
}) {
    const [value, setValue] = useState('');
    const submit = (e: FormEvent<HTMLFormElement>) => {
        if (!onVerify) return;
        e.preventDefault();
        if (value.trim()) onVerify(value.trim());
    };
    const button = (
        <Button type="submit" className={multiline ? undefined : 'w-full sm:w-auto'}>
            {submitLabel}
        </Button>
    );
    return (
        <form
            action={action}
            method="get"
            onSubmit={submit}
            className={cn('flex flex-col gap-5 rounded-[1.25rem] border border-border bg-card p-6 md:p-8', className)}
        >
            {title || description ? (
                <div className="flex flex-col gap-2">
                    {title ? <h3 className="oca-title">{title}</h3> : null}
                    {description ? <p className="oca-body text-[0.9375rem]">{description}</p> : null}
                </div>
            ) : null}
            {multiline ? (
                <>
                    <Field label={label} hint={hint}>
                        <Textarea
                            name={param}
                            required
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={placeholder}
                            spellCheck={false}
                            className="min-h-32 font-mono text-base md:text-[0.8125rem]"
                        />
                    </Field>
                    <div>{button}</div>
                </>
            ) : (
                <Field label={label} hint={hint} action={button}>
                    <Input
                        name={param}
                        required
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        className="font-mono text-base md:text-[0.875rem]"
                    />
                </Field>
            )}
        </form>
    );
}

export interface ComparisonColumn {
    key: string;
    label: ReactNode;
    /** The one column the page argues for: tinted, read first on a phone. At most one. */
    highlight?: boolean;
    /** A last row's button for this column: "Use OC Stamp", "Read its spec". Say the column's name in it. */
    action?: ReactNode;
}

export interface ComparisonRow {
    label: ReactNode;
    /** One line under the property. */
    note?: ReactNode;
    /** An answer per column key, in words: "Yes", "No", "Only with an x509 chain". */
    values: Record<string, ReactNode>;
}

const TINT = 'bg-[color-mix(in_oklab,var(--oca-orange)_9%,var(--card))]';

/**
 * Systems side by side, a property per row, answers in words (never ✓ ✗ ~).
 * One column is tinted. On a phone each property becomes a card: the tinted
 * answer first and full width, the others two by two, each under its name.
 * Four or more columns wait for a desk to sit side by side.
 */
export function ComparisonTable({
    columns,
    rows,
    label,
    propertyHeading = 'Property',
    className,
}: {
    columns: ComparisonColumn[];
    rows: ComparisonRow[];
    /** The list's name for a screen reader. */
    label: string;
    propertyHeading?: ReactNode;
    className?: string;
}) {
    const wide = columns.length > 3;
    // Static class names per breakpoint, so Tailwind can see them.
    const grid = wide ? 'lg:grid lg:grid-cols-[var(--oca-compare)]' : 'md:grid md:grid-cols-[var(--oca-compare)]';
    const desk = wide ? 'lg' : 'md';
    const style = {
        // The argued-for column gets a little more room: its answers carry the page.
        '--oca-compare': ['minmax(0, 1.4fr)', ...columns.map((c) => (c.highlight ? 'minmax(0, 1.3fr)' : 'minmax(0, 1fr)'))].join(' '),
    } as CSSProperties;
    const ordered = [...columns].sort((a, b) => Number(Boolean(b.highlight)) - Number(Boolean(a.highlight)));
    return (
        <ul aria-label={label} style={style} className={cn('divide-y divide-border rounded-[1.25rem] border border-border bg-card', className)}>
            <li
                aria-hidden
                className={cn(
                    'hidden gap-5 px-5 py-4 text-[0.875rem] font-medium text-muted-foreground',
                    wide ? 'lg:grid lg:px-8' : 'md:grid md:px-8',
                    grid
                )}
            >
                <span>{propertyHeading}</span>
                {columns.map((c) => (
                    <span key={c.key} className={cn(c.highlight && cn(TINT, '-my-4 px-4 py-4 text-oca-accent-ink'))}>
                        {c.label}
                    </span>
                ))}
            </li>
            {rows.map((r, ri) => (
                <li key={ri} className={cn('grid grid-cols-1 gap-3 px-5 py-5', wide ? 'lg:items-start lg:gap-5 lg:px-8' : 'md:items-start md:gap-5 md:px-8', grid)}>
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="oca-title-sm">{r.label}</span>
                        {r.note ? <span className="text-[0.875rem] leading-snug text-muted-foreground">{r.note}</span> : null}
                    </div>
                    <div className={cn('grid grid-cols-2 gap-1', desk === 'lg' ? 'lg:contents' : 'md:contents')}>
                        {columns.map((c) => {
                            // On a phone the tinted answer leads; on a desk the columns keep their order.
                            return (
                                <div
                                    key={c.key}
                                    style={{ '--oca-order': ordered.indexOf(c) } as CSSProperties}
                                    className={cn(
                                        // Two rows of the pair's grid (name, answer), so answers line up
                                        // across a pair even when one name wraps.
                                        'order-[var(--oca-order)] row-span-2 grid min-w-0 grid-rows-subgrid gap-1 rounded-xl px-3 py-2.5',
                                        desk === 'lg'
                                            ? 'lg:order-none lg:row-span-1 lg:flex lg:flex-col'
                                            : 'md:order-none md:row-span-1 md:flex md:flex-col',
                                        c.highlight
                                            ? cn(
                                                  TINT,
                                                  'col-span-2',
                                                  desk === 'lg'
                                                      ? 'lg:col-span-1 lg:-my-5 lg:self-stretch lg:rounded-none lg:px-4 lg:py-5'
                                                      : 'md:col-span-1 md:-my-5 md:self-stretch md:rounded-none md:px-4 md:py-5'
                                              )
                                            : desk === 'lg'
                                              ? 'lg:p-0'
                                              : 'md:p-0'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'text-[0.8125rem]',
                                            c.highlight ? 'text-oca-accent-ink' : 'text-muted-foreground',
                                            desk === 'lg' ? 'lg:sr-only' : 'md:sr-only'
                                        )}
                                    >
                                        {c.label}
                                    </span>
                                    <span className={cn('text-[0.9375rem]', c.highlight && 'font-medium')}>
                                        {r.values[c.key] ?? '—'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </li>
            ))}
            {columns.some((c) => c.action) ? (
                // Under each column its way in; on a phone the tinted one first, then the rest.
                <li className={cn('flex flex-col gap-2 px-5 py-5', wide ? 'lg:items-center lg:gap-5 lg:px-8' : 'md:items-center md:gap-5 md:px-8', grid)}>
                    <span aria-hidden className={cn('hidden', desk === 'lg' ? 'lg:block' : 'md:block')} />
                    {columns.map((c) => (
                        <div
                            key={c.key}
                            style={{ '--oca-order': ordered.indexOf(c) } as CSSProperties}
                            className={cn('order-[var(--oca-order)] flex min-w-0', desk === 'lg' ? 'lg:order-none' : 'md:order-none')}
                        >
                            {c.action ?? null}
                        </div>
                    ))}
                </li>
            ) : null}
        </ul>
    );
}
