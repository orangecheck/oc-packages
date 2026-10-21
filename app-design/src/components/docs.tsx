import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import {
    Children,
    isValidElement,
    useEffect,
    useId,
    useRef,
    useState,
    type HTMLAttributes,
    type ReactElement,
    type ReactNode,
    type RefObject,
    type TableHTMLAttributes,
} from 'react';

import { cn } from '../lib/cn';
import { InTableContext } from '../lib/in-table';
import { Badge } from '../primitives/badge';
import { ScrollFade } from '../primitives/scroll-fade';
import { Skeleton } from '../primitives/feedback';
import { StatusBadge, type Status } from '../primitives/status-badge';
import { CodeBlock } from './code-block';
import { Notice } from './data';
import { useActiveHeading, type TocItem } from './hero';

/*
 * The parts of a docs page: where you are (Breadcrumbs), where to go next
 * (DocsPager), what is on this page (OnThisPage), and the blocks MDX writes
 * with (Callout, Steps, LinkCard, ApiTable, MdxTable, Diagram). DocsShell
 * (chrome) puts them in place; mdxComponents (./mdx) maps markdown onto them.
 */

const isInternal = (href: string) => href.startsWith('/') || href.startsWith('#');

/** A router link for this site's pages, a plain anchor for another site. */
function DocLink({ href, className, children, ...rest }: { href: string; className?: string; children: ReactNode; 'aria-label'?: string }) {
    return isInternal(href) ? (
        <Link href={href} className={className} {...rest}>
            {children}
        </Link>
    ) : (
        <a href={href} className={className} {...rest}>
            {children}
        </a>
    );
}

/* ── Breadcrumbs ─────────────────────────────────────────────────────── */

export interface Crumb {
    label: ReactNode;
    /** Omit for the page you are on. */
    href?: string;
}

/** Where this page sits: docs › section › page, with room on the right for "View source". */
export function Breadcrumbs({ items, action, className }: { items: Crumb[]; action?: ReactNode; className?: string }) {
    return (
        <div className={cn('flex min-h-11 items-center justify-between gap-4 sm:min-h-0', className)}>
            <nav aria-label="Breadcrumb" className="min-w-0">
                <ol className="flex min-w-0 items-center gap-1.5 text-[0.875rem] text-muted-foreground">
                    {items.map((c, i) => {
                        const last = i === items.length - 1;
                        return (
                            <li key={i} className={cn('flex items-center gap-1.5', last ? 'min-w-0' : 'shrink-0')}>
                                {c.href && !last ? (
                                    <DocLink href={c.href} className="inline-flex min-h-11 items-center transition-colors hover:text-foreground sm:min-h-0">
                                        {c.label}
                                    </DocLink>
                                ) : (
                                    <span aria-current={last ? 'page' : undefined} className={cn('truncate', last && 'text-foreground')}>
                                        {c.label}
                                    </span>
                                )}
                                {!last ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-oca-subtle" /> : null}
                            </li>
                        );
                    })}
                </ol>
            </nav>
            {action ? <div className="shrink-0 text-[0.875rem]">{action}</div> : null}
        </div>
    );
}

/* ── Previous / next ─────────────────────────────────────────────────── */

export interface PagerLink {
    href: string;
    label: ReactNode;
    /** The section it is in, when that differs from this page's. */
    section?: ReactNode;
}

/** The page before and after this one, as two cards at the foot of the page. */
export function DocsPager({ prev, next, className }: { prev?: PagerLink; next?: PagerLink; className?: string }) {
    if (!prev && !next) return null;
    const card = (l: PagerLink, dir: 'prev' | 'next') => (
        <DocLink
            href={l.href}
            className={cn(
                'group flex min-h-20 flex-col justify-center gap-1 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-oca-hairline-strong',
                dir === 'next' && 'items-end text-right sm:col-start-2'
            )}
        >
            <span className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                {dir === 'prev' ? <ArrowLeft aria-hidden className="size-3.5" /> : null}
                {dir === 'prev' ? 'Previous' : 'Next'}
                {l.section ? <span aria-hidden>·</span> : null}
                {l.section ? <span className="truncate">{l.section}</span> : null}
                {dir === 'next' ? <ArrowRight aria-hidden className="size-3.5" /> : null}
            </span>
            <span className="text-[1rem] font-medium leading-snug text-foreground">{l.label}</span>
        </DocLink>
    );
    return (
        <nav aria-label="Previous and next page" className={cn('grid grid-cols-1 gap-3 border-t border-border pt-8 sm:grid-cols-2', className)}>
            {prev ? card(prev, 'prev') : null}
            {next ? card(next, 'next') : null}
        </nav>
    );
}

/* ── On this page ────────────────────────────────────────────────────── */

/**
 * The page's h2s and h3s with ids, read from the rendered page. `key` (the
 * path) reads them again after a client-side move to another page.
 */
export function useHeadings(selector = '#docs-content', key?: string): { items: TocItem[]; activeId?: string } {
    const [items, setItems] = useState<TocItem[]>([]);
    useEffect(() => {
        const read = () => {
            const root = document.querySelector(selector);
            if (!root) return setItems([]);
            setItems(
                Array.from(root.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]')).map((h) => ({
                    id: h.id,
                    // The anchor link's "#" is not part of the name.
                    label: (h.querySelector('[data-heading-text]') ?? h).textContent?.trim() ?? '',
                    level: h.tagName === 'H3' ? 3 : 2,
                }))
            );
        };
        // Once after paint, once more for late layout (fonts, images).
        const raf = requestAnimationFrame(read);
        const t = setTimeout(read, 80);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(t);
        };
    }, [selector, key]);
    const activeId = useActiveHeading(items.map((i) => i.id));
    return { items, activeId };
}

/** The list of a page's sections, the one being read marked. h3s sit in under their h2. */
export function OnThisPage({
    items,
    activeId,
    title = 'On this page',
    onNavigate,
    className,
}: {
    items: TocItem[];
    activeId?: string;
    /** `null` for no visible title. */
    title?: ReactNode;
    onNavigate?: () => void;
    className?: string;
}) {
    const id = useId();
    if (items.length === 0) return null;
    return (
        // With no visible title (a folded list under its own summary) the name is still "On this page".
        <nav aria-labelledby={title ? id : undefined} aria-label={title ? undefined : 'On this page'} className={className}>
            {title ? (
                <p id={id} className="mb-3 text-[0.875rem] font-medium">
                    {title}
                </p>
            ) : null}
            <ul>
                {items.map((t) => {
                    const on = t.id === activeId;
                    return (
                        <li key={t.id}>
                            <a
                                href={`#${t.id}`}
                                onClick={onNavigate}
                                aria-current={on ? 'location' : undefined}
                                className={cn(
                                    'block border-l py-1.5 text-[0.875rem] leading-snug transition-colors',
                                    t.level === 3 ? 'pl-7' : 'pl-4',
                                    on ? 'border-foreground text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                                )}
                            >
                                {t.label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

/* ── Blocks MDX writes with ──────────────────────────────────────────── */

const CALLOUT_TONE = { note: 'neutral', warning: 'brand', danger: 'danger' } as const;

/**
 * A note set apart from the text: `note` (the default), `warning` for
 * something that costs you if missed, `danger` for something that breaks.
 * It is part of the page, so it is a note to a screen reader, never an alert.
 */
export function Callout({
    tone = 'note',
    title,
    children,
    className,
}: {
    tone?: keyof typeof CALLOUT_TONE;
    title?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <Notice
            tone={CALLOUT_TONE[tone]}
            title={title}
            role="note"
            // Markdown paragraphs inside take the note's size, not the page's.
            className={cn('my-6 [&_p]:my-0 [&_p]:text-[0.9375rem] [&_p]:leading-relaxed [&_p+p]:mt-3', className)}
        >
            {children}
        </Notice>
    );
}

/** One step of a guide: a title and whatever it takes (text, code). */
export function Step({ title, id, children }: { title: ReactNode; id?: string; children?: ReactNode }) {
    return (
        <li className="relative pb-8 pl-11 last:pb-0 [counter-increment:oca-step]">
            {/* The number, and the line down to the next one. */}
            <span
                aria-hidden
                className="absolute left-0 top-0 flex size-7 items-center justify-center rounded-full border border-oca-hairline-strong bg-card text-[0.8125rem] oca-tabular text-foreground before:content-[counter(oca-step)]"
            />
            <span aria-hidden className="absolute bottom-1 left-[0.8125rem] top-9 w-px bg-border" />
            <h3 id={id} className="scroll-mt-28 pt-0.5 text-[1.0625rem] font-medium leading-snug tracking-[-0.008em] text-foreground">
                {title}
            </h3>
            <div className="mt-2 text-muted-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{children}</div>
        </li>
    );
}

/**
 * A guide's steps, numbered, each with its title and body. For instructions
 * a reader follows in order; ProgressSteps is for where something stands.
 */
export function Steps({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <ol className={cn('not-prose my-8 flex flex-col [counter-reset:oca-step] [&>li:last-child>span:nth-child(2)]:hidden', className)}>
            {children}
        </ol>
    );
}

/** A card that leads somewhere: a title, one line, an optional icon. */
export function LinkCard({
    href,
    title,
    description,
    icon,
    meta,
    className,
}: {
    href: string;
    title: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    /** Top right, beside the arrow: a status, a count. */
    meta?: ReactNode;
    className?: string;
}) {
    const Arrow = isInternal(href) ? ArrowRight : ArrowUpRight;
    return (
        <DocLink
            href={href}
            className={cn(
                'group flex h-full flex-col gap-3 rounded-[1.25rem] border border-border bg-card p-5 transition-colors hover:border-oca-hairline-strong',
                className
            )}
        >
            <span className="flex items-start justify-between gap-3">
                {icon ? (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground [&_svg]:size-[1.125rem]">
                        {icon}
                    </span>
                ) : (
                    <span className="text-[1rem] font-medium leading-snug text-foreground">{title}</span>
                )}
                <span className="flex shrink-0 items-center gap-2">
                    {meta}
                    <Arrow aria-hidden className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </span>
            </span>
            {icon ? <span className="text-[1rem] font-medium leading-snug text-foreground">{title}</span> : null}
            {description ? <span className="text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</span> : null}
        </DocLink>
    );
}

/** LinkCards in a grid: one column on a phone, two or three beside each other. */
export function CardGrid({ columns = 2, children, className }: { columns?: 2 | 3; children: ReactNode; className?: string }) {
    return (
        <div className={cn('not-prose my-6 grid grid-cols-1 gap-3 sm:grid-cols-2', columns === 3 && 'lg:grid-cols-3', className)}>
            {children}
        </div>
    );
}

/* ── Tables ──────────────────────────────────────────────────────────── */

/**
 * A markdown table: hairline rules, a quiet header, and sideways scrolling
 * with an edge that says so when it is wider than the column. Code in a
 * cell drops its pill, so an API table reads as a list of names.
 */
/**
 * A markdown table. Cells wrap at word boundaries, and inline code in them
 * breaks after its punctuation (`oc_session_expired` at an underscore), so a
 * table scrolls, with the fade, only when its words cannot fit: never
 * because a cell kept a minimum width.
 */
export function MdxTable({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
    return (
        <div className="not-prose my-6 overflow-hidden rounded-2xl border border-border bg-card">
            <ScrollFade fade="var(--card)">
                <InTableContext.Provider value={true}>
                    <table
                        className={cn(
                            'w-full border-collapse text-left text-[0.875rem] leading-relaxed',
                            '[&_th]:border-b [&_th]:border-oca-hairline-strong [&_th]:bg-oca-table-head [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-[0.8125rem] [&_th]:font-medium [&_th]:text-foreground sm:[&_th]:whitespace-nowrap sm:[&_th]:px-4',
                            '[&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:text-muted-foreground [&_tbody_tr:first-child_td]:border-t-0 sm:[&_td]:px-4',
                            '[&_td_code]:bg-transparent [&_td_code]:p-0 [&_td_code]:text-foreground [&_td:first-child]:text-foreground',
                            '[&_[align=center]]:text-center [&_[align=right]]:text-right',
                            className
                        )}
                        {...props}
                    />
                </InTableContext.Provider>
            </ScrollFade>
        </div>
    );
}

export interface ApiRow {
    name: string;
    /** The row's anchor: a link to `#id` lands on this row. */
    id?: string;
    type?: ReactNode;
    required?: boolean;
    default?: ReactNode;
    description?: ReactNode;
    /** Where it is defined: a link to the source line. Its column is named once, in the header. */
    source?: ReactNode;
    deprecated?: boolean;
    /** Where the member stands, when it is not simply live. */
    status?: Exclude<Status, 'live' | 'good' | 'caution' | 'refused'>;
}

const said = (n: ReactNode) => n !== undefined && n !== null && n !== false && n !== '';

/**
 * Parameters, props or fields: name and type in mono, required or default,
 * what it does and where it is defined. A table from sm up; on a phone each
 * row is a card with the name and type on top. One set of rows serves both,
 * so a row's `id` is a single anchor. A column nobody fills is left out.
 */
export function ApiTable({
    rows,
    caption,
    nameHeader = 'Name',
    className,
}: {
    rows: ApiRow[];
    caption?: string;
    nameHeader?: string;
    className?: string;
}) {
    const hasDefault = rows.some((r) => r.default !== undefined);
    const hasDescription = rows.some((r) => said(r.description));
    const hasSource = rows.some((r) => said(r.source));
    const cell = 'px-4 py-3 max-sm:p-0';
    return (
        <div className={cn('not-prose my-6 overflow-hidden rounded-2xl border border-border bg-card', className)}>
            <ScrollFade fade="var(--card)">
                <table className="w-full border-collapse text-left text-[0.875rem] max-sm:block">
                    {caption ? <caption className="sr-only">{caption}</caption> : null}
                    <thead className="max-sm:sr-only">
                        <tr className="border-b border-oca-hairline-strong bg-oca-table-head text-[0.8125rem]">
                            <th scope="col" className="px-4 py-2.5 font-medium">{nameHeader}</th>
                            <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                            {hasDefault ? <th scope="col" className="px-4 py-2.5 font-medium">Default</th> : null}
                            {hasDescription ? <th scope="col" className="px-4 py-2.5 font-medium">Description</th> : null}
                            {hasSource ? <th scope="col" className="px-4 py-2.5 font-medium">Defined in</th> : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border max-sm:block">
                        {rows.map((r) => (
                            <tr
                                key={r.id ?? r.name}
                                id={r.id}
                                className="scroll-mt-28 align-top target:bg-muted max-sm:flex max-sm:flex-col max-sm:gap-1.5 max-sm:px-4 max-sm:py-3.5"
                            >
                                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                                    <span className="flex flex-col items-start gap-1 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2">
                                        <code className={cn('font-mono text-[0.8125rem] text-foreground max-sm:text-[0.875rem]', r.deprecated && 'line-through decoration-oca-subtle')}>
                                            {r.name}
                                        </code>
                                        {r.required ? <span className="text-[0.75rem] text-oca-accent-ink">Required</span> : null}
                                        {r.deprecated ? <Badge tone="muted">Deprecated</Badge> : null}
                                        {r.status ? <StatusBadge status={r.status} /> : null}
                                    </span>
                                </th>
                                <td className={cn(cell, 'font-mono text-[0.8125rem] text-muted-foreground max-sm:break-all', !said(r.type) && 'max-sm:hidden')}>
                                    {r.type ?? '—'}
                                </td>
                                {hasDefault ? (
                                    <td className={cn(cell, 'font-mono text-[0.8125rem] text-muted-foreground max-sm:order-last', r.default === undefined && 'max-sm:hidden')}>
                                        <span className="font-sans sm:hidden">Default </span>
                                        {r.default ?? '—'}
                                    </td>
                                ) : null}
                                {hasDescription ? (
                                    <td className={cn(cell, 'leading-relaxed text-muted-foreground', !said(r.description) && 'max-sm:hidden')}>
                                        {r.description}
                                    </td>
                                ) : null}
                                {hasSource ? (
                                    <td className={cn(cell, 'text-[0.8125rem] text-muted-foreground max-sm:order-last max-sm:break-all', !said(r.source) && 'max-sm:hidden')}>
                                        {r.source}
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ScrollFade>
        </div>
    );
}

/* ── Diagrams ────────────────────────────────────────────────────────── */

/** The two calls Diagram makes on mermaid; the package does not depend on it. */
export interface MermaidLike {
    initialize(config: Record<string, unknown>): void;
    render(id: string, text: string): Promise<{ svg: string }>;
}

export type MermaidLoader = () => Promise<MermaidLike | { default: MermaidLike }>;

function useDarkMode(): boolean {
    const [dark, setDark] = useState(false);
    useEffect(() => {
        const root = document.documentElement;
        const read = () => setDark(root.classList.contains('dark'));
        read();
        const mo = new MutationObserver(read);
        mo.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => mo.disconnect();
    }, []);
    return dark;
}

/** Mermaid's palette from the tokens on the page, so a diagram follows light and dark. */
function mermaidTheme(el: HTMLElement): Record<string, string> {
    const css = getComputedStyle(el);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const card = v('--card');
    const muted = v('--muted');
    const text = v('--foreground');
    const subtle = v('--muted-foreground');
    const line = v('--input');
    const hair = v('--oca-hairline-strong');
    return {
        background: 'transparent',
        fontFamily: css.fontFamily,
        fontSize: '14px',
        textColor: text,
        mainBkg: card,
        primaryColor: card,
        primaryTextColor: text,
        primaryBorderColor: hair,
        secondaryColor: muted,
        secondaryTextColor: text,
        secondaryBorderColor: hair,
        tertiaryColor: muted,
        tertiaryTextColor: text,
        tertiaryBorderColor: hair,
        nodeBorder: hair,
        lineColor: line,
        edgeLabelBackground: card,
        clusterBkg: muted,
        clusterBorder: hair,
        titleColor: text,
        noteBkgColor: muted,
        noteTextColor: text,
        noteBorderColor: hair,
        actorBkg: card,
        actorBorder: hair,
        actorTextColor: text,
        actorLineColor: line,
        signalColor: text,
        signalTextColor: text,
        labelBoxBkgColor: card,
        labelBoxBorderColor: hair,
        labelTextColor: text,
        loopTextColor: subtle,
        activationBkgColor: muted,
        activationBorderColor: hair,
        sequenceNumberColor: card,
    };
}

/*
 * Mermaid draws at 100% width with its own size as a max-width, so a wide
 * diagram shrinks to fit and its labels with it. Give it its own width
 * instead, and read that width back: one up to a third wider than the
 * column scales down to fit (its 14px labels stay at 10.5px or more); a
 * wider one keeps its type size and scrolls sideways.
 */
const FIT = 4 / 3;

function naturalSize(svg: string): { svg: string; width: number | null } {
    const w = svg.match(/viewBox="[\d.-]+ [\d.-]+ ([\d.]+) [\d.]+"/)?.[1];
    if (!w) return { svg, width: null };
    const width = Math.ceil(Number(w));
    return {
        svg: svg.replace(/<svg([^>]*?)\swidth="100%"/, `<svg$1 width="${width}"`).replace(/max-width:\s*[\d.]+px;?/, ''),
        width,
    };
}

/** The width a diagram has to fill: the figure, less the well's padding. */
function useInnerWidth(ref: RefObject<HTMLElement | null>, padding: number): number | null {
    const [width, setWidth] = useState<number | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth - padding));
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref, padding]);
    return width;
}

/**
 * A mermaid diagram drawn in the page's own colours, again whenever the
 * page turns light or dark. Pass `load` (`() => import('mermaid')`) so
 * mermaid is fetched only on a page that draws one. If it cannot be drawn,
 * the source shows instead.
 */
export function Diagram({ chart, caption, load, className }: { chart: string; caption?: ReactNode; load: MermaidLoader; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const dark = useDarkMode();
    const raw = useId();
    const [drawn, setDrawn] = useState<{ svg: string; width: number | null } | null>(null);
    const [failed, setFailed] = useState(false);
    const room = useInnerWidth(ref, 48);
    const fits = drawn?.width != null && room != null && drawn.width <= room * FIT;
    useEffect(() => {
        let live = true;
        const el = ref.current;
        if (!el) return;
        (async () => {
            try {
                const mod = await load();
                const mermaid = 'default' in mod ? mod.default : mod;
                mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: mermaidTheme(el) });
                const { svg } = await mermaid.render(`oca-diagram-${raw.replace(/[^a-zA-Z0-9]/g, '')}-${dark ? 'd' : 'l'}`, chart);
                if (live) {
                    setDrawn(naturalSize(svg));
                    setFailed(false);
                }
            } catch {
                if (live) setFailed(true);
            }
        })();
        return () => {
            live = false;
        };
    }, [chart, dark, load, raw]);
    if (failed) return <CodeBlock code={chart} caption="Diagram (shown as its source)" className={cn('my-6', className)} />;
    return (
        <figure ref={ref} className={cn('not-prose my-6 overflow-hidden rounded-[1.25rem] border border-border bg-card', className)}>
            {drawn ? (
                <ScrollFade fade="var(--card)">
                    <div
                        data-fit={fits ? '' : undefined}
                        className={cn(
                            'flex justify-center p-6 [&_svg]:h-auto',
                            fits ? 'w-full [&_svg]:max-w-full' : 'w-max min-w-full [&_svg]:max-w-none'
                        )}
                        role="img"
                        aria-label={typeof caption === 'string' ? caption : 'Diagram'}
                        dangerouslySetInnerHTML={{ __html: drawn.svg }}
                    />
                </ScrollFade>
            ) : (
                <div role="status" aria-label="Drawing the diagram" className="p-6">
                    <Skeleton className="h-40 w-full rounded-xl" />
                </div>
            )}
            {caption ? <figcaption className="border-t border-border px-5 py-3 text-[0.8125rem] text-muted-foreground">{caption}</figcaption> : null}
        </figure>
    );
}

/* ── Headings with anchors ───────────────────────────────────────────── */

const HEADING = {
    h1: 'oca-display-3 mb-4 text-foreground',
    h2: 'mb-3 mt-12 text-[1.375rem] font-medium leading-tight tracking-[-0.015em] text-foreground md:text-[1.5rem]',
    h3: 'mb-2 mt-9 text-[1.125rem] font-medium leading-snug tracking-[-0.01em] text-foreground',
    h4: 'mb-2 mt-7 text-[1rem] font-medium leading-snug text-foreground',
} as const;

/**
 * A docs heading. With an id it carries a "#" link to itself, shown on
 * hover or focus, so a reader can copy a link to the section.
 */
export function DocsHeading({
    as: Tag,
    id,
    children,
    className,
    ...props
}: HTMLAttributes<HTMLHeadingElement> & { as: keyof typeof HEADING }) {
    return (
        <Tag id={id} className={cn('group scroll-mt-28', HEADING[Tag], className)} {...props}>
            <span data-heading-text="">{children}</span>
            {id && Tag !== 'h1' ? (
                <a
                    href={`#${id}`}
                    className="ml-2 inline-block rounded-md px-1 align-baseline text-[0.85em] font-normal text-oca-subtle no-underline opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                    <span aria-hidden>#</span>
                    <span className="sr-only">Link to this section</span>
                </a>
            ) : null}
        </Tag>
    );
}

/** Text of an MDX `<code>` child, which may arrive as a string or pieces of one. */
export function codeText(node: ReactNode): string {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(codeText).join('');
    if (isValidElement(node)) return codeText((node as ReactElement<{ children?: ReactNode }>).props.children);
    return '';
}

/** The language of an MDX code fence, from its `language-xx` class. */
export function codeLang(node: ReactNode): string | undefined {
    const child = Children.toArray(node)[0];
    if (!isValidElement(child)) return undefined;
    const cls = (child as ReactElement<{ className?: string }>).props.className ?? '';
    return cls.match(/language-([\w+-]+)/)?.[1];
}
