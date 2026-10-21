import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
    FAMILY,
    PROTOCOL_ORDER,
    protocolSite,
    type FamilyGroup,
    type FamilySlug,
    type ProtocolSlug,
    type SiteStatus,
} from '../family';
import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';
import { useInDocs } from '../lib/docs-context';
import { Badge } from '../primitives/badge';
import { StatusBadge } from '../primitives/status-badge';

/*
 * A card that is one link: the title carries the link and stretches over the
 * card, so the name is what a screen reader hears, and the whole card shows
 * one focus ring when the keyboard reaches it.
 */
const CARD =
    'group relative flex h-full flex-col rounded-[1.25rem] border border-border bg-card p-6 transition-colors hover:border-oca-hairline-strong md:p-7 ' +
    'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background';
const STRETCH = 'outline-none after:absolute after:inset-0 after:rounded-[1.25rem] after:content-[""]';

const pad = (n: number) => String(n + 1).padStart(2, '0');

/**
 * The six protocols as cards, from the registry, in the family's order: the
 * verb's word, what it carries, one line, its Nostr kinds. `link` picks the
 * protocol's page on ochk.io, its tools, or its docs.
 */
export function ProtocolGrid({
    protocols = PROTOCOL_ORDER,
    link = 'page',
    as: Tag = 'h3',
    className,
}: {
    protocols?: readonly ProtocolSlug[];
    link?: 'page' | 'tool' | 'docs';
    /** Each protocol's heading level, where the page puts the grid. Default h3. */
    as?: HeadingTag;
    className?: string;
}) {
    // Inside the docs, their pages are this site's: through the router, under its base path.
    const inDocs = useInDocs();
    return (
        <ul className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-5', className)}>
            {protocols.map((slug) => {
                const p = protocolSite(slug);
                const i = PROTOCOL_ORDER.indexOf(slug);
                return (
                    <li key={slug}>
                        <div className={cn(CARD, 'gap-4')}>
                            <div className="flex items-center justify-between gap-3">
                                <span className="oca-numeral">
                                    {pad(i)} <span className="ml-1.5 capitalize">{p.verb}</span>
                                </span>
                                {p.status !== 'live' ? <StatusBadge status={p.status} /> : null}
                            </div>
                            <Tag className="oca-display-3">
                                {link === 'docs' && inDocs ? (
                                    <Link href={`/${p.slug}`} className={STRETCH}>
                                        {p.label}
                                    </Link>
                                ) : (
                                    <a
                                        href={link === 'tool' ? p.toolHref : link === 'docs' ? p.docsHref : p.pageHref}
                                        className={STRETCH}
                                    >
                                        {p.label}
                                    </a>
                                )}
                            </Tag>
                            <p className="oca-body">{p.line}</p>
                            <div className="mt-auto flex items-center justify-between gap-3 pt-2 text-[0.875rem] text-muted-foreground">
                                <span className="oca-tabular">Nostr kind {p.kinds}</span>
                                {/* A tool is another site; a page or the docs are on ochk.io. */}
                                {link === 'tool' ? (
                                    <ArrowUpRight
                                        aria-hidden
                                        className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                                    />
                                ) : (
                                    <ArrowRight
                                        aria-hidden
                                        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                                    />
                                )}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export interface AppCardProps {
    name: ReactNode;
    line: ReactNode;
    href: string;
    /** The protocols it shows, as chips. */
    protocols?: readonly ProtocolSlug[];
    status?: SiteStatus;
    /** The name's heading level, where the page puts the card. Default h3. */
    as?: HeadingTag;
    className?: string;
}

/** One app: its name, one line, the protocols it shows, and where it is. The card is the link. */
export function AppCard({ name, line, href, protocols = [], status = 'live', as: Tag = 'h3', className }: AppCardProps) {
    return (
        <div className={cn(CARD, 'gap-3', className)}>
            <div className="flex items-start justify-between gap-3">
                <Tag className="oca-title">
                    <a href={href} className={STRETCH}>
                        {name}
                    </a>
                </Tag>
                {status !== 'live' ? <StatusBadge status={status} /> : null}
            </div>
            <p className="oca-body text-[0.9375rem]">{line}</p>
            <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                {protocols.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                        Shows
                        {protocols.map((p) => (
                            <Badge key={p} tone="muted">
                                {p}
                            </Badge>
                        ))}
                    </p>
                ) : (
                    <span />
                )}
                <span className="flex shrink-0 items-center gap-1 text-[0.875rem] text-muted-foreground transition-colors group-hover:text-foreground">
                    {href.replace(/^https?:\/\//, '')}
                    <ArrowUpRight aria-hidden className="size-4" />
                </span>
            </div>
        </div>
    );
}

/** The apps in a group, from the registry: `app` for the showcase apps, `public-good` for globe and btc. */
export function AppGrid({
    group = 'app',
    sites,
    as,
    className,
}: {
    group?: Extract<FamilyGroup, 'app' | 'public-good'>;
    /** Pick and order the apps yourself instead. */
    sites?: readonly FamilySlug[];
    /** Each app's heading level, where the page puts the grid. Default h3. */
    as?: HeadingTag;
    className?: string;
}) {
    const list = sites
        ? sites.map((slug) => FAMILY.find((s) => s.slug === slug)).filter((s) => s !== undefined)
        : FAMILY.filter((s) => s.group === group);
    return (
        <ul className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-5', className)}>
            {list.map((s) => (
                <li key={s.slug}>
                    <AppCard name={s.label} line={s.line} href={s.href} protocols={s.protocols} status={s.status} as={as} />
                </li>
            ))}
        </ul>
    );
}
