import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';

import { Lockup, Mark } from '../brand/mark';
import { familyByGroup, GET_AN_ACCOUNT, LEGAL_LINKS, OCHK_IO, OCHK_IO_FOOTER, PROTOCOLS, type FamilySlug } from '../family';
import { cn } from '../lib/cn';
import type { FooterColumn, NavItem } from '../lib/nav';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetTitle, SheetTrigger } from '../primitives/overlay';
import { ThemeToggle } from './app-shell';
import { FamilyList, FamilyMenu } from './family-menu';
import { ProductLockup } from './product-lockup';

export type { FooterColumn, NavItem } from '../lib/nav';

function NavLink({
    item,
    className,
    onNavigate,
    line = false,
}: {
    item: NavItem;
    className?: string;
    onNavigate?: () => void;
    /** Mark the active item with a bar on the header's bottom edge (the tool header). */
    line?: boolean;
}) {
    const cls = cn(
        'rounded-full px-3 py-2 text-[0.9375rem] transition-colors',
        item.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        line && 'relative after:absolute after:inset-x-3 after:-bottom-[0.625rem] after:h-0.5 after:rounded-full',
        line && item.active && 'after:bg-foreground',
        className
    );
    if (item.external) {
        return (
            <a href={item.href} className={cls} rel="noreferrer" onClick={onNavigate}>
                {item.label}
            </a>
        );
    }
    return (
        <Link href={item.href} className={cls} aria-current={item.active ? 'page' : undefined} onClick={onNavigate}>
            {item.label}
        </Link>
    );
}

/** A link with its one line, as a dropdown lists them. */
function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
    const body = (
        <>
            <span className="text-[0.9375rem] font-medium leading-6 text-foreground">{item.label}</span>
            {item.description ? (
                <span className="text-[0.8125rem] leading-snug text-muted-foreground">{item.description}</span>
            ) : null}
        </>
    );
    const cls = cn(
        'flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors hover:bg-accent',
        item.active && 'bg-muted hover:bg-muted dark:bg-white/[0.06]'
    );
    return item.external ? (
        <a href={item.href} className={cls} rel="noreferrer" onClick={onNavigate}>
            {body}
        </a>
    ) : (
        <Link href={item.href} className={cls} aria-current={item.active ? 'page' : undefined} onClick={onNavigate}>
            {body}
        </Link>
    );
}

/** "All protocols" for a "Protocols" menu; a parent with a node for a label gets "See all". */
const seeAll = (item: NavItem) => (typeof item.label === 'string' ? `All ${item.label.toLowerCase()}` : 'See all');

/** One level of links under a word in the header. */
function NavDropdown({ item }: { item: NavItem }) {
    const [open, setOpen] = useState(false);
    const active = item.active || item.children?.some((c) => c.active);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                className={cn(
                    'group inline-flex items-center gap-1 rounded-full py-2 pl-3 pr-2.5 text-[0.9375rem] transition-colors md:max-lg:pl-2.5 md:max-lg:pr-2',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground data-[state=open]:text-foreground'
                )}
            >
                {item.label}
                <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </PopoverTrigger>
            <PopoverContent align="center" sideOffset={10} className="w-[min(calc(100vw-2rem),26rem)] p-2">
                <ul className="flex flex-col">
                    {item.children?.map((c) => (
                        <li key={c.href}>
                            <NavRow item={c} onNavigate={() => setOpen(false)} />
                        </li>
                    ))}
                </ul>
                <div className="mt-1.5 border-t border-border px-1 pt-1.5">
                    <NavLink
                        item={{ ...item, label: seeAll(item), children: undefined }}
                        className="block rounded-xl px-2 py-2 text-[0.875rem]"
                        onNavigate={() => setOpen(false)}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}

export interface SiteHeaderProps {
    home?: string;
    /** Replaces the lockup (and the product word). */
    brand?: ReactNode;
    /** The site's own word beside the lockup: "orangecheck | stamp". */
    product?: string;
    /** Mount the family menu beside the lockup. Pass the site's slug to mark it. */
    family?: boolean | FamilySlug;
    nav?: readonly NavItem[];
    /** A search control, set before the actions. */
    search?: ReactNode;
    actions?: ReactNode;
    /**
     * `site`: a public page's header, the navigation centred. `tool`: 56px,
     * full width, a hairline under it, the navigation after the lockup.
     */
    variant?: 'site' | 'tool';
    /** Leave the navigation out of the phone's menu (a page whose tab bar already holds it). */
    navOnPhone?: boolean;
    /** At the top of the phone's menu: links the actions hold on a wider screen. */
    menu?: ReactNode;
    className?: string;
}

/**
 * The header's "Get an account", in the registry's words. On ochk.io and its
 * docs it links ochk.app; ochk.app passes its own sign-in as `href`.
 */
export function AccountCta({ href = GET_AN_ACCOUNT.href, className }: { href?: string; className?: string }) {
    return (
        <Button asChild size="sm" className={className}>
            <a href={href}>{GET_AN_ACCOUNT.label}</a>
        </Button>
    );
}

/**
 * The header: lockup (and the site's word), navigation, search and actions.
 * Below md the navigation, and the family when it is on, move into one sheet;
 * the actions stay.
 */
export function SiteHeader({
    home = '/',
    brand,
    product,
    family,
    nav = [],
    search,
    actions,
    variant = 'site',
    navOnPhone = true,
    menu: menuExtra,
    className,
}: SiteHeaderProps) {
    const [open, setOpen] = useState(false);
    const tool = variant === 'tool';
    const size = tool ? 24 : 28;
    const current = typeof family === 'string' ? family : undefined;
    const phoneNav = navOnPhone ? nav : [];
    const menu = phoneNav.length > 0 || Boolean(family) || Boolean(menuExtra);
    const brandNode = brand ?? <ProductLockup size={size} product={product} />;
    const navigation =
        nav.length > 0 ? (
            <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                {nav.map((n) =>
                    n.children?.length ? (
                        <NavDropdown key={n.href} item={n} />
                    ) : (
                        // Between md and lg the family menu and the actions share the row: tighter.
                        <NavLink key={n.href} item={n} line={tool} className={tool ? undefined : 'md:max-lg:px-2.5'} />
                    )
                )}
            </nav>
        ) : null;
    return (
        <header
            className={cn(
                'sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90',
                tool ? 'border-border' : 'border-transparent',
                className
            )}
        >
            <div
                className={cn(
                    'flex items-center justify-between gap-4',
                    tool ? 'h-14 px-4 md:px-6' : 'oca-container h-16 md:h-[4.5rem] md:max-lg:gap-2',
                    // Three columns, the outer two each at least their content: the
                    // navigation stays centred whatever the actions hold, so it does
                    // not shift when they change (signed out to signed in).
                    !tool &&
                        nav.length > 0 &&
                        'md:grid md:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)]'
                )}
            >
                <div className={cn('flex min-w-0 items-center gap-1', tool ? 'md:gap-1' : 'justify-self-start')}>
                    <Link href={home} className="-ml-1 min-w-0 rounded-lg p-1">
                        {brandNode}
                        {/* Read as "orangecheck home": the name starts with what the link shows. */}
                        <span className="sr-only"> home</span>
                    </Link>
                    {family ? <FamilyMenu current={current} className="max-md:hidden" /> : null}
                    {tool && navigation ? <div className="ml-5">{navigation}</div> : null}
                </div>
                {!tool ? navigation : null}
                <div className="flex items-center gap-2 justify-self-end">
                    {search}
                    {actions}
                    {menu ? (
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger
                                className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent md:hidden"
                                aria-label="Open menu"
                            >
                                <Menu className="size-5" />
                            </SheetTrigger>
                            <SheetContent side="right" className="pt-16">
                                <SheetTitle className="sr-only">Menu</SheetTitle>
                                {menuExtra ? (
                                    <div className={cn('flex flex-col', (phoneNav.length > 0 || family) && 'border-b border-border pb-3')}>
                                        {menuExtra}
                                    </div>
                                ) : null}
                                {phoneNav.length > 0 ? (
                                    <nav aria-label="Main" className="flex flex-col">
                                        {phoneNav.map((n) =>
                                            n.children?.length ? (
                                                <div key={n.href} className="flex flex-col py-2">
                                                    <p className="px-3 pb-1 text-[0.8125rem] text-muted-foreground">{n.label}</p>
                                                    {n.children.map((c) => (
                                                        <NavLink
                                                            key={c.href}
                                                            item={c}
                                                            className="rounded-xl px-3 py-2.5 text-[1.0625rem]"
                                                            onNavigate={() => setOpen(false)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <NavLink
                                                    key={n.href}
                                                    item={n}
                                                    className="rounded-xl px-3 py-3 text-[1.0625rem]"
                                                    onNavigate={() => setOpen(false)}
                                                />
                                            )
                                        )}
                                    </nav>
                                ) : null}
                                {family ? (
                                    <details className={cn('group', phoneNav.length > 0 && 'mt-2 border-t border-border pt-4')}>
                                        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 text-[1.0625rem] [&::-webkit-details-marker]:hidden">
                                            All orangecheck sites
                                            <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                                        </summary>
                                        <FamilyList current={current} onNavigate={() => setOpen(false)} stack className="mt-2" />
                                    </details>
                                ) : null}
                            </SheetContent>
                        </Sheet>
                    ) : null}
                </div>
            </div>
        </header>
    );
}

/** The first thing a keyboard reaches: a way past the header to the page. */
export function SkipLink({ href = '#main-content', children = 'Skip to content' }: { href?: string; children?: ReactNode }) {
    return (
        <a
            href={href}
            // Focus lands on the target itself, so a reader starts there: a plain <main> takes focus only with a tabindex.
            onClick={() => {
                const to = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
                if (to && !to.hasAttribute('tabindex')) to.setAttribute('tabindex', '-1');
            }}
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-[0.9375rem] focus:font-medium focus:text-foreground focus:shadow-md"
        >
            {children}
        </a>
    );
}

const BANNER_TONE = {
    neutral: 'border-border bg-muted',
    brand: 'border-[color-mix(in_oklab,var(--oca-orange)_30%,var(--border))] bg-[color-mix(in_oklab,var(--oca-orange)_9%,var(--background))]',
    danger: 'border-[color-mix(in_oklab,var(--destructive)_35%,var(--border))] bg-[color-mix(in_oklab,var(--destructive)_8%,var(--background))]',
} as const;

/**
 * One strip above the header: an outage, or a notice everyone must see. The
 * rule that shows it stays with each site; this is only how it looks. Three
 * tones, as a Notice has, and ink text on every one.
 */
export function SiteBanner({
    tone = 'neutral',
    children,
    action,
    className,
}: {
    tone?: keyof typeof BANNER_TONE;
    children: ReactNode;
    /** A link to where the full story is ("Status"). */
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div role="status" aria-live="polite" data-tone={tone} className={cn('border-b text-[0.875rem]', BANNER_TONE[tone], className)}>
            <div className="oca-container flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <p className="flex min-w-0 items-baseline gap-2.5 leading-snug">
                    {tone !== 'neutral' ? (
                        <span
                            aria-hidden
                            className={cn(
                                'size-2 shrink-0 translate-y-[-0.05em] rounded-full',
                                tone === 'brand' ? 'bg-oca-orange' : 'bg-destructive'
                            )}
                        />
                    ) : null}
                    <span>{children}</span>
                </p>
                {/* On a phone the link wraps under the words, lined up with them, not the dot. */}
                {action ? <div className={cn('shrink-0 font-medium', tone !== 'neutral' && 'max-sm:pl-[1.125rem]')}>{action}</div> : null}
            </div>
        </div>
    );
}

/** A link in the footer's lists: 44px tall on phones. */
const FOOT_LINK = 'inline-flex min-h-11 items-center transition-colors hover:text-foreground md:min-h-0';

function LegalRow({ links }: { links: readonly NavItem[] }) {
    return (
        <div className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Legal">
                <ul className="flex flex-wrap gap-x-5">
                    {/* Two links may share an address; the label and place keep them apart. */}
                    {links.map((l, i) => (
                        <li key={`${i}:${l.label}`}>
                            {l.href.startsWith('/') ? (
                                <Link href={l.href} className={FOOT_LINK}>
                                    {l.label}
                                </Link>
                            ) : (
                                <a href={l.href} className={FOOT_LINK}>
                                    {l.label}
                                </a>
                            )}
                        </li>
                    ))}
                </ul>
            </nav>
            <p>© {new Date().getFullYear()} OrangeCheck</p>
        </div>
    );
}

export interface SiteFooterProps {
    columns?: readonly FooterColumn[];
    /** Add the family's columns from the registry: orangecheck, Protocols, Apps, Public goods. */
    family?: boolean;
    /**
     * The legal row: Privacy, Terms, Security, Trademarks, Contact. `true` links
     * ochk.io's documents; a product that hosts its own passes its links
     * (`SELF_HOSTED_LEGAL_LINKS`).
     */
    legal?: boolean | readonly NavItem[];
    /** One row, for tools: the lockup, the protocols when `family`, legal and meta. */
    compact?: boolean;
    fineprint?: ReactNode;
    meta?: ReactNode;
    /** The mark and wordmark at display size, closing the page. */
    signature?: boolean;
    className?: string;
}

/**
 * The footer, in the deck's register: a line of fine print, columns of links,
 * the family when it is on, the legal row and the support credit. Any number
 * of columns: the lockup shares their row up to five, then takes its own.
 * Links are 44px tall on phones.
 */
export function SiteFooter({
    columns = [],
    family = false,
    legal = false,
    compact = false,
    fineprint,
    meta,
    signature = true,
    className,
}: SiteFooterProps) {
    const legalLinks = legal === true ? LEGAL_LINKS : legal || null;
    if (compact) {
        return (
            // The tools' column (ToolColumn): the lockup lines up with the page's title.
            <footer className={cn('border-t border-border bg-background px-4 text-[0.875rem] text-muted-foreground md:px-8', className)}>
                <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-x-8 gap-y-3 py-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        {/* The lockup keeps its size; its target is 44px tall, clear of the links under it. */}
                        <a
                            href={OCHK_IO}
                            className="relative rounded-lg text-foreground before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2"
                        >
                            <Lockup size={22} />
                        </a>
                        {family ? (
                            <nav aria-label="Protocols">
                                <ul className="flex flex-wrap gap-x-4">
                                    {PROTOCOLS.map((p) => (
                                        <li key={p.slug}>
                                            <a href={p.pageHref} className={FOOT_LINK}>
                                                {p.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </nav>
                        ) : null}
                    </div>
                    {legalLinks || meta ? (
                        <div className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:flex-wrap sm:items-center">
                            {legalLinks ? <LegalRow links={legalLinks} /> : null}
                            {meta}
                        </div>
                    ) : null}
                </div>
            </footer>
        );
    }
    const cols: FooterColumn[] = [
        ...columns,
        ...(family
            ? familyByGroup().map((g) => ({
                  // The lockup above already says orangecheck.
                  heading: g.id === 'orangecheck' ? 'Start here' : g.label,
                  links: g.sites.map((s) => ({ href: s.href, label: s.label, external: true })),
              }))
            : []),
    ];
    const n = cols.length;
    const inline = n <= 5;
    const grid = {
        '--oca-footer-md': `repeat(${Math.max(1, Math.min(n, 4))}, minmax(0, 1fr))`,
        '--oca-footer-lg': inline
            ? `minmax(0, 1.3fr) repeat(${Math.max(1, n)}, minmax(0, 1fr))`
            : `repeat(${Math.min(n, 6)}, minmax(0, 1fr))`,
    } as CSSProperties;
    return (
        <footer className={cn('border-t border-border bg-background', className)}>
            <div
                style={grid}
                className="oca-container grid grid-cols-1 gap-y-6 pb-6 pt-8 md:grid-cols-[var(--oca-footer-md)] md:gap-x-6 md:gap-y-10 md:py-16 lg:grid-cols-[var(--oca-footer-lg)]"
            >
                <div className={cn('col-span-full flex flex-col gap-4', inline && 'lg:col-span-1')}>
                    {/* On a phone the signature below says the name; the lockup would say it twice. */}
                    <Lockup size={26} className={signature ? 'max-md:hidden' : undefined} />
                    {fineprint ? <p className="max-w-xs text-[0.9375rem] leading-relaxed text-muted-foreground">{fineprint}</p> : null}
                </div>
                {/* On a phone each group folds shut, a native disclosure that needs no script: the footer is a screen, not two. */}
                <div className="col-span-full divide-y divide-border border-y border-border md:hidden">
                    {cols.map((col, i) => (
                        <details key={`${i}:${col.heading}`} className="group">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[0.9375rem] font-medium [&::-webkit-details-marker]:hidden">
                                {col.heading}
                                <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="grid grid-cols-2 gap-x-6 pb-3">
                                {col.links.map((l, j) => (
                                    <NavLink key={`${j}:${l.label}`} item={l} className="-mx-3 flex min-h-11 items-center text-[0.9375rem]" />
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
                {cols.map((col, i) => (
                    <div key={`${i}:${col.heading}`} className="hidden min-w-0 flex-col gap-1 md:flex">
                        <p className="mb-2 text-[0.875rem] font-medium">{col.heading}</p>
                        <div className="flex flex-col gap-1">
                            {col.links.map((l, j) => (
                                <NavLink key={`${j}:${l.label}`} item={l} className="-mx-3 py-1.5 text-[0.9375rem]" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            {signature ? (
                <div aria-hidden className="oca-container select-none overflow-hidden pb-5 md:pb-12">
                    <div className="flex items-end gap-[0.18em] text-[clamp(3rem,11.5vw,10rem)] leading-[0.78] tracking-[-0.065em] [font-family:var(--oc-font-display)]">
                        <span className="mb-[0.06em] inline-block w-[1.1em] shrink-0">
                            <Mark className="block h-auto w-full" />
                        </span>
                        <span>orangecheck</span>
                    </div>
                </div>
            ) : null}
            {legalLinks || meta ? (
                <div className="oca-container">
                    {/* The rule spans the content, not the gutters. */}
                    <div className="flex flex-col gap-3 border-t border-border py-6 text-[0.875rem] text-muted-foreground">
                        {legalLinks ? <LegalRow links={legalLinks} /> : null}
                        {meta}
                    </div>
                </div>
            ) : null}
        </footer>
    );
}

/**
 * ochk.io's footer, word for word, for ochk.io and the docs it serves: its
 * column and the family's, the fine print, who supports the open work, the
 * theme switch and the legal row. Pass `columns` to write ochk.io's own links
 * relative (oc-www, so they stay on the host that serves it).
 */
export function OchkIoFooter({ columns = OCHK_IO_FOOTER, className }: { columns?: readonly FooterColumn[]; className?: string }) {
    return (
        <SiteFooter
            columns={columns}
            family
            legal
            fineprint="Open protocols on Bitcoin. Anyone can check the result."
            meta={
                // The switch sits beside the line, not under it, so a phone spends no row on it.
                <div className="flex items-center justify-between gap-4">
                    <p>
                        Open-source work on orangecheck is <span className="whitespace-nowrap">supported by OpenSats.</span>
                    </p>
                    <ThemeToggle className="-mx-3 shrink-0" />
                </div>
            }
            className={className}
        />
    );
}
