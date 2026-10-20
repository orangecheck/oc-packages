import { ChevronDown, ChevronRight, PanelLeft } from 'lucide-react';
import Link from 'next/link.js';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { OnThisPage, useHeadings } from '../components/docs';
import type { TocItem } from '../components/hero';
import { DOCS_HREF, OCHK_IO, OCHK_IO_FOOTER, OCHK_IO_NAV } from '../family';
import { cn } from '../lib/cn';
import type { NavItem } from '../lib/nav';
import { Badge } from '../primitives/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../primitives/overlay';
import { StatusBadge, type Status } from '../primitives/status-badge';
import { SiteFooter, SiteHeader, SkipLink } from './site';

/* ── The docs' navigation ────────────────────────────────────────────── */

export interface DocsNavItem {
    href: string;
    label: ReactNode;
    /** A status word ("testing") or a small badge of your own. */
    badge?: Status | ReactNode;
}

export interface DocsNavSection {
    label: string;
    items: DocsNavItem[];
}

const STATUS_WORDS = new Set<string>(['live', 'testing', 'not-yet', 'paused', 'good', 'caution', 'refused']);

/** "/stamp/verify/" and "/stamp/verify?x#y" are the page "/stamp/verify". */
const pathOf = (href: string) => href.split(/[?#]/)[0]!.replace(/(.)\/$/, '$1');

/**
 * The docs' sections, each folding open. The section holding this page is
 * always open and the page is marked with a bar beside it; other sections
 * open on a press and close again when you move to another section.
 */
export function DocsNav({
    sections,
    current,
    onNavigate,
    className,
}: {
    sections: readonly DocsNavSection[];
    /** This page's path, as the items' hrefs write it. */
    current: string;
    onNavigate?: () => void;
    className?: string;
}) {
    const here = pathOf(current);
    const activeSection = useMemo(
        () => sections.findIndex((s) => s.items.some((i) => pathOf(i.href) === here)),
        [sections, here]
    );
    const [peeked, setPeeked] = useState<Set<number>>(() => new Set());
    useEffect(() => setPeeked(new Set()), [activeSection]);
    const activeRef = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        const id = requestAnimationFrame(() => activeRef.current?.scrollIntoView({ block: 'nearest' }));
        return () => cancelAnimationFrame(id);
    }, [here]);
    const base = useId();
    return (
        <nav aria-label="Docs" className={cn('flex flex-col gap-0.5', className)}>
            {sections.map((section, si) => {
                const isActive = si === activeSection;
                const open = isActive || peeked.has(si);
                const panel = `${base}-s${si}`;
                return (
                    <div key={section.label}>
                        <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={panel}
                            onClick={() => {
                                if (isActive) return;
                                setPeeked((p) => {
                                    const n = new Set(p);
                                    if (n.has(si)) n.delete(si);
                                    else n.add(si);
                                    return n;
                                });
                            }}
                            className={cn(
                                'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] transition-colors',
                                isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                isActive && 'cursor-default'
                            )}
                        >
                            {section.label}
                            <ChevronRight
                                aria-hidden
                                className={cn('size-3.5 shrink-0 text-oca-subtle transition-transform duration-200', open && 'rotate-90')}
                            />
                        </button>
                        <ul id={panel} hidden={!open} className="mb-2 ml-2.5 mt-0.5 border-l border-border">
                            {section.items.map((item) => {
                                const on = pathOf(item.href) === here;
                                const badge =
                                    typeof item.badge === 'string' && STATUS_WORDS.has(item.badge) ? (
                                        <StatusBadge status={item.badge as Status} />
                                    ) : item.badge ? (
                                        <Badge tone="muted">{item.badge}</Badge>
                                    ) : null;
                                return (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            ref={on ? activeRef : undefined}
                                            onClick={onNavigate}
                                            aria-current={on ? 'page' : undefined}
                                            className={cn(
                                                '-ml-px flex min-h-9 items-center gap-2 border-l-2 py-1.5 pl-3.5 pr-2 text-[0.875rem] leading-snug transition-colors',
                                                on
                                                    ? 'border-foreground font-medium text-foreground'
                                                    : 'border-transparent text-muted-foreground hover:border-oca-hairline-strong hover:text-foreground'
                                            )}
                                        >
                                            <span className="min-w-0 flex-1">{item.label}</span>
                                            {badge}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                );
            })}
        </nav>
    );
}

/* ── The shell ───────────────────────────────────────────────────────── */

/** ochk.io's navigation with Docs marked: the docs are a part of ochk.io, not a site beside it. */
export const DOCS_HEADER_NAV: readonly NavItem[] = OCHK_IO_NAV.map((n) => (n.href === DOCS_HREF ? { ...n, active: true } : n));

export interface DocsShellProps {
    /** The docs' sections, for the sidebar and the phone's menu. */
    nav: readonly DocsNavSection[];
    /** This page's path, as the nav's hrefs write it. */
    current: string;
    /** Replace the header. Default: ochk.io's, with Docs marked. */
    header?: ReactNode;
    /** The default header's search control (a SearchDialog). */
    search?: ReactNode;
    /** The default header's actions (a SessionAccount, a Sign in). */
    actions?: ReactNode;
    /** Above the page: Breadcrumbs. */
    breadcrumbs?: ReactNode;
    /**
     * The page's sections. Default: read from the page's h2s and h3s once it
     * renders, again whenever `current` changes.
     */
    toc?: TocItem[];
    /** Under the page: DocsPager. */
    pager?: ReactNode;
    /** Replace the footer. Default: ochk.io's, with the family and the legal row. */
    footer?: ReactNode;
    children: ReactNode;
}

/**
 * The docs' frame, in ochk.io's header and footer: the sections on the
 * left, the page in the middle, what is on it on the right. Below lg the
 * sections open from a bar under the header; below xl "On this page" folds
 * above the text. The page's text sits in #docs-content.
 */
export function DocsShell({
    nav,
    current,
    header,
    search,
    actions,
    breadcrumbs,
    toc,
    pager,
    footer,
    children,
}: DocsShellProps) {
    const [menu, setMenu] = useState(false);
    useEffect(() => setMenu(false), [current]);
    const read = useHeadings('#docs-content', current);
    const items = toc ?? read.items;
    const activeId = toc ? undefined : read.activeId;
    const here = pathOf(current);
    const place = useMemo(() => {
        for (const s of nav) {
            const it = s.items.find((i) => pathOf(i.href) === here);
            if (it) return { section: s.label, page: it.label };
        }
        return null;
    }, [nav, here]);
    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <SkipLink />
            {header ?? <SiteHeader home={OCHK_IO} family="docs" nav={DOCS_HEADER_NAV} search={search} actions={actions} />}
            {/* Below lg: the sections behind one button, and where you are beside it. */}
            <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90 md:top-[4.5rem] lg:hidden">
                <div className="oca-container flex h-12 items-center gap-2">
                    <Sheet open={menu} onOpenChange={setMenu}>
                        <SheetTrigger className="-ml-2 inline-flex h-10 min-w-0 items-center gap-2 rounded-full px-2.5 text-[0.875rem] hover:bg-accent">
                            <PanelLeft aria-hidden className="size-[1.125rem] shrink-0" />
                            <span className="sr-only">Docs menu. </span>
                            {place ? (
                                <span className="flex min-w-0 items-center gap-1.5">
                                    <span className="shrink-0 text-muted-foreground">{place.section}</span>
                                    <ChevronRight aria-hidden className="size-3.5 shrink-0 text-oca-subtle" />
                                    <span className="truncate font-medium">{place.page}</span>
                                </span>
                            ) : (
                                <span className="font-medium">Docs</span>
                            )}
                        </SheetTrigger>
                        <SheetContent side="left" className="w-[min(88vw,22rem)] gap-0 p-0">
                            <div className="border-b border-border px-5 py-4 pr-14">
                                <SheetTitle className="text-[1.0625rem] font-medium">Docs</SheetTitle>
                            </div>
                            <div className="overflow-y-auto p-3">
                                <DocsNav sections={nav} current={current} onNavigate={() => setMenu(false)} />
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
            <div className="oca-container flex-1">
                <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[13.5rem_minmax(0,1fr)_11rem]">
                    <div className="sticky top-[4.5rem] hidden max-h-[calc(100dvh-4.5rem)] self-start overflow-y-auto overscroll-contain py-8 pr-1 lg:block">
                        <DocsNav sections={nav} current={current} />
                    </div>
                    <main id="main-content" className="min-w-0 pb-16 pt-6 md:pt-8">
                        {/* Below lg the bar under the header already says where you are. */}
                        {breadcrumbs ? <div className="mb-6 max-lg:hidden">{breadcrumbs}</div> : null}
                        {items.length > 1 ? (
                            <details className="group mb-8 rounded-2xl border border-border bg-card xl:hidden">
                                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
                                    On this page
                                    <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                                </summary>
                                <OnThisPage items={items} activeId={activeId} title={null} className="px-4 pb-4" />
                            </details>
                        ) : null}
                        <article id="docs-content" className="max-w-[46rem]">
                            {children}
                        </article>
                        {pager ? <div className="mt-16 max-w-[46rem]">{pager}</div> : null}
                    </main>
                    <div className="sticky top-[4.5rem] hidden max-h-[calc(100dvh-4.5rem)] self-start overflow-y-auto py-10 xl:block">
                        {items.length > 1 ? <OnThisPage items={items} activeId={activeId} /> : null}
                    </div>
                </div>
            </div>
            {footer ?? <SiteFooter columns={OCHK_IO_FOOTER} family legal signature={false} />}
        </div>
    );
}
