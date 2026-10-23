import { ChevronRight, Ellipsis, Menu, Moon, Sun, SunMoon } from 'lucide-react';
import Link from 'next/link';
import { ThemeProvider as NextThemeProvider, useTheme as useNextTheme, type ThemeProviderProps as NextThemeProviderProps } from 'next-themes';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ProductLockup } from './product-lockup';
import type { FamilySlug } from '../family';
import { cn } from '../lib/cn';
import { InColumnContext } from '../lib/column';
import { ShellContext } from '../lib/shell-context';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Sheet,
    SheetContent,
    SheetTitle,
    SheetTrigger,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../primitives/overlay';
import { FamilyMenu } from './family-menu';
import { SkipLink } from './site';

export interface ShellNavItem {
    href: string;
    label: string;
    icon?: ReactNode;
    active?: boolean;
    /** Beside the label: a number shows as a count on a tab or the rail (99+), anything else as a dot. */
    badge?: ReactNode;
}

export interface ShellNavGroup {
    /** Omit for the first, unlabeled group. */
    label?: string;
    items: ShellNavItem[];
}

/**
 * A part of the app with its own pages: "You", "Build", "Operate", "Admin".
 * The sidebar lists one section's pages at a time, under a switcher.
 */
export interface ShellSection {
    id: string;
    /** Short, for the switcher: one word. */
    label: string;
    /** The section's eyebrow on its pages; defaults to `label`. */
    title?: string;
    /** Where the switcher goes: the section's first page. */
    href: string;
    /** With one on every section, phones get the sections as tabs. */
    icon?: ReactNode;
    groups: ShellNavGroup[];
}

export function SideNav({ groups, onNavigate }: { groups: ShellNavGroup[]; onNavigate?: () => void }) {
    return (
        <nav aria-label="Pages" className="flex flex-col gap-5">
            {groups.map((g, gi) => (
                <div key={g.label ?? gi} className="flex flex-col gap-0.5">
                    {g.label ? <p className="px-3 pb-1 text-[0.8125rem] text-muted-foreground">{g.label}</p> : null}
                    {g.items.map((it) => (
                        <Link
                            key={it.href}
                            href={it.href}
                            onClick={onNavigate}
                            aria-current={it.active ? 'page' : undefined}
                            className={cn(
                                'flex h-9 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors',
                                '[&_svg]:size-[1.0625rem] [&_svg]:shrink-0',
                                it.active
                                    ? 'bg-card text-foreground shadow-sm ring-1 ring-border [&_svg]:text-foreground'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                        >
                            {it.icon}
                            <span className="min-w-0 flex-1 truncate">{it.label}</span>
                            {it.badge ? <span className="shrink-0">{it.badge}</span> : null}
                        </Link>
                    ))}
                </div>
            ))}
        </nav>
    );
}

function SectionSwitch({
    sections,
    current,
    onNavigate,
}: {
    sections: ShellSection[];
    current: ShellSection;
    onNavigate?: () => void;
}) {
    // Up to three fit one row of the sidebar; four go two by two, so no label
    // is ever cut short.
    const cols = sections.length <= 3 ? sections.length : 2;
    return (
        <nav
            aria-label="Sections"
            className={cn('grid gap-1 bg-muted p-1', cols === sections.length ? 'rounded-full' : 'rounded-[1.25rem]')}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
            {sections.map((sec) => {
                const on = sec.id === current.id;
                return (
                    <Link
                        key={sec.id}
                        href={sec.href}
                        onClick={onNavigate}
                        aria-current={on ? 'true' : undefined}
                        className={cn(
                            'flex h-8 min-w-0 items-center justify-center rounded-full px-1.5 text-[0.8125rem] font-medium transition-colors',
                            on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        <span className="truncate">{sec.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

/** A count (99+) for a number, a dot for anything else; the badge is read with the label. */
function NavBadge({ badge, className }: { badge: ReactNode; className: string }) {
    if (typeof badge === 'number') {
        return (
            <span
                aria-hidden
                className={cn(
                    'absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-medium leading-none text-primary-foreground ring-2 ring-background oca-tabular',
                    className
                )}
            >
                {badge > 99 ? '99+' : badge}
            </span>
        );
    }
    // The deep orange: a dot is the whole signal, so it must clear 3:1 on the background.
    return <span aria-hidden className={cn('absolute size-2 rounded-full bg-oca-orange-deep ring-2 ring-background', className)} />;
}

const TAB =
    'flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[0.6875rem] leading-none outline-none transition-colors [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

function TabFace({ icon, label, badge, active }: { icon: ReactNode; label: string; badge?: ReactNode; active?: boolean }) {
    return (
        <>
            <span
                className={cn(
                    'relative flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-200',
                    '[&_svg]:size-[1.125rem] [&_svg]:shrink-0',
                    active ? 'bg-card shadow-sm ring-1 ring-border [&_svg]:stroke-2' : '[&_svg]:stroke-[1.75]'
                )}
            >
                {icon}
                {badge ? <NavBadge badge={badge} className={typeof badge === 'number' ? '-top-1 right-0.5' : 'right-2.5 top-0.5'} /> : null}
            </span>
            <span className="max-w-full truncate px-0.5">{label}</span>
            {badge ? <span className="sr-only">{badge}</span> : null}
        </>
    );
}

/**
 * The phone's way around: up to five pages under the thumb, each one tap
 * away. Past five, four tabs and More, a sheet with the rest.
 */
export function TabBar({ items }: { items: ShellNavItem[] }) {
    const [more, setMore] = useState(false);
    const overflow = items.length > 5;
    const shown = overflow ? items.slice(0, 4) : items;
    const rest = overflow ? items.slice(4) : [];
    const restBadge = rest.find((it) => it.badge)?.badge;
    return (
        <nav
            aria-label="Pages"
            data-oca-tabbar=""
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
            <div
                className="mx-auto grid h-14 max-w-[32rem] px-1.5"
                style={{ gridTemplateColumns: `repeat(${shown.length + (overflow ? 1 : 0)}, minmax(0, 1fr))` }}
            >
                {shown.map((it) => (
                    <Link
                        key={it.href}
                        href={it.href}
                        aria-current={it.active ? 'page' : undefined}
                        className={cn(TAB, it.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                    >
                        <TabFace icon={it.icon} label={it.label} badge={it.badge} active={it.active} />
                    </Link>
                ))}
                {overflow ? (
                    <Sheet open={more} onOpenChange={setMore}>
                        <SheetTrigger
                            className={cn(TAB, rest.some((it) => it.active) ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                            <TabFace icon={<Ellipsis />} label="More" badge={restBadge ? true : undefined} active={rest.some((it) => it.active)} />
                        </SheetTrigger>
                        <SheetContent side="bottom" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                            <SheetTitle className="px-1 text-[1.0625rem] font-medium">More</SheetTitle>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                                {rest.map((it) => (
                                    <Link
                                        key={it.href}
                                        href={it.href}
                                        onClick={() => setMore(false)}
                                        aria-current={it.active ? 'page' : undefined}
                                        className={cn(
                                            'flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 text-center text-[0.8125rem] transition-colors',
                                            '[&_svg]:size-5',
                                            it.active ? 'border-foreground bg-card text-foreground' : 'border-border text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        <span className="relative">
                                            {it.icon}
                                            {it.badge ? <NavBadge badge={it.badge} className={typeof it.badge === 'number' ? '-right-3 -top-2' : '-right-1 -top-0.5'} /> : null}
                                        </span>
                                        <span className="max-w-full truncate">{it.label}</span>
                                        {it.badge ? <span className="sr-only">{it.badge}</span> : null}
                                    </Link>
                                ))}
                            </div>
                        </SheetContent>
                    </Sheet>
                ) : null}
            </div>
        </nav>
    );
}

/** Two or more pages, each with an icon, take a tab bar (past five, with More). Without icons, the drawer. */
export function tabsFor(groups: ShellNavGroup[]): ShellNavItem[] | null {
    const items = groups.flatMap((g) => g.items);
    return items.length >= 2 && items.every((it) => it.icon) ? items : null;
}

/** Sections with an icon each are the phone's tabs; their pages stay in the menu. */
function sectionTabs(sections: ShellSection[] | undefined, current: ShellSection | undefined): ShellNavItem[] | null {
    if (!sections || !current || sections.length < 2 || !sections.every((sec) => sec.icon)) return null;
    return sections.map((sec) => ({ href: sec.href, label: sec.label, icon: sec.icon, active: sec.id === current.id }));
}

const activeItem = (groups: ShellNavGroup[]) => groups.flatMap((g) => g.items).find((it) => it.active);

// Bundlers replace process.env.NODE_ENV; the typeof guard covers one that doesn't.
declare const process: { env: { NODE_ENV?: string } } | undefined;

const warned = new Set<string>();

function warnDuplicateLabels(groups: ShellNavGroup[]) {
    if (typeof process === 'undefined' || process.env.NODE_ENV === 'production') return;
    const seen = new Set<string>();
    for (const it of groups.flatMap((g) => g.items)) {
        if (seen.has(it.label) && !warned.has(it.label)) {
            warned.add(it.label);
            console.warn(`AppShell: two pages are labelled "${it.label}"; give each its own name.`);
        }
        seen.add(it.label);
    }
}

/**
 * The signed-in frame: a quiet sidebar on the canvas, content on the right.
 *
 * Give it `sections` and the sidebar shows a switcher (only when there is more
 * than one) and the current section's pages, so it never outgrows the screen;
 * `persistent` groups (Account) follow every section. The section is the one
 * holding an active item, or `activeSection`. On phones a top bar carries the
 * wordmark and the account, a strip under it names the section and page, and
 * the sidebar opens as a sheet. `nav` (flat groups) still works for a simple
 * app, and when every page has an icon, phones get a tab bar instead (past
 * five, four tabs and More): the pages sit under the thumb, the strip and the
 * menu button go (the sheet stays for a `footer`, without the pages), and
 * tablets keep the sheet. Sections with an icon each become the tabs, and
 * their pages stay in the sheet. Pages get the section through context:
 * PageHeader uses it as its eyebrow. `family` puts the family menu beside the
 * lockup. The account control and any banner are slots. `variant="rail"` is
 * the messenger's frame instead.
 */
export function AppShell(props: AppShellProps) {
    return props.variant === 'rail' ? <RailShell {...props} /> : <SidebarShell {...props} />;
}

export interface AppShellProps {
    /**
     * `sidebar` (default): a sidebar of pages from lg, content up to 72rem.
     * `rail`: a messenger's frame. The whole window, an icon rail from md
     * with each page's name on hover, the content full-bleed and managing
     * its own panes and scroll; `header` sits above it.
     */
    variant?: 'sidebar' | 'rail';
    /** Flat groups, for an app without sections. */
    nav?: ShellNavGroup[];
    sections?: ShellSection[];
    activeSection?: string;
    /** The page's name for the place strip, when it is not a nav item of its own. */
    page?: string;
    /** Groups shown under every section, after its own. */
    persistent?: ShellNavGroup[];
    home?: string;
    /** The app's word beside the lockup, as SiteHeader and SignInFrame have it: "orangecheck | vault". */
    product?: string;
    /** Mount the family menu beside the lockup, as SiteHeader does. Pass the site's slug to mark it. */
    family?: boolean | FamilySlug;
    /** The rail's: at its foot from md (an avatar linking to settings). The sidebar's: top right. */
    account?: ReactNode;
    banner?: ReactNode;
    footer?: ReactNode;
    /** `rail` only: the header above the rail and the content (a SiteHeader). */
    header?: ReactNode;
    children: ReactNode;
    className?: string;
}

function SidebarShell({
    nav,
    sections,
    activeSection,
    page: pageOverride,
    persistent = [],
    home = '/',
    product,
    family,
    account,
    banner,
    footer,
    children,
    className,
}: AppShellProps) {
    const [open, setOpen] = useState(false);
    const current =
        sections && sections.length > 0
            ? (sections.find((sec) => sec.id === activeSection) ??
              sections.find((sec) => activeItem(sec.groups)) ??
              sections[0]!)
            : undefined;
    const groups = current ? [...current.groups, ...persistent] : [...(nav ?? []), ...persistent];
    warnDuplicateLabels(groups);
    const sectionTabsFor = sectionTabs(sections, current);
    const tabs = current ? sectionTabsFor : tabsFor(groups);
    const page = activeItem(groups);
    const place = useMemo(
        () => ({
            section: current ? (current.title ?? current.label) : undefined,
            page: pageOverride ?? page?.label,
        }),
        [current, page?.label, pageOverride]
    );
    const familyMenu = family ? <FamilyMenu current={typeof family === 'string' ? family : undefined} /> : null;
    const switcher =
        sections && current && sections.length > 1 ? (
            <SectionSwitch sections={sections} current={current} onNavigate={() => setOpen(false)} />
        ) : null;
    return (
        <ShellContext.Provider value={place}>
            <div
                className={cn(
                    'min-h-dvh bg-background',
                    tabs && 'max-md:pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]',
                    className
                )}
            >
                {/* Past the bar, the sidebar and the account: 8 to 11 stops before the page without it. */}
                <SkipLink />
                <div data-oca-sticky="app-bar" className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md lg:hidden">
                    <div className="flex h-14 items-center gap-2 px-3">
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger
                                className={cn(
                                    'inline-flex size-10 items-center justify-center rounded-full hover:bg-accent',
                                    // The tab bar holds every page; the sheet is left for a footer. Section tabs leave the pages here.
                                    tabs && !sectionTabsFor && !footer && 'max-md:hidden'
                                )}
                                aria-label="Open navigation"
                            >
                                <Menu className="size-5" />
                            </SheetTrigger>
                            <SheetContent side="left" className="flex flex-col gap-6 overflow-y-auto p-4 pt-16">
                                <SheetTitle className="sr-only">Navigation</SheetTitle>
                                {/* On a phone the section tabs are the switcher. */}
                                {switcher ? <div className={sectionTabsFor ? 'max-md:hidden' : undefined}>{switcher}</div> : null}
                                <div className={tabs && !sectionTabsFor ? 'max-md:hidden' : undefined}>
                                    <SideNav groups={groups} onNavigate={() => setOpen(false)} />
                                </div>
                                {footer ? <div className="mt-auto flex flex-col gap-3">{footer}</div> : null}
                            </SheetContent>
                        </Sheet>
                        <Link href={home} aria-label="Home" className="rounded-lg p-1">
                            <ProductLockup size={22} product={product} />
                        </Link>
                        {familyMenu}
                        <div className="ml-auto flex items-center">{account}</div>
                    </div>
                    {place.page ? (
                        <div
                            className={cn(
                                'flex h-9 items-center gap-1.5 border-t border-border px-4 text-[0.875rem]',
                                // The active tab already names the page.
                                tabs && !sectionTabsFor && !pageOverride && 'max-md:hidden'
                            )}
                        >
                            {place.section ? (
                                <>
                                    <span className="shrink-0 text-muted-foreground">{place.section}</span>
                                    <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                                </>
                            ) : null}
                            <span className="truncate font-medium">{place.page}</span>
                        </div>
                    ) : null}
                </div>
                <div className="mx-auto flex w-full max-w-[90rem]">
                    <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex">
                        <div className="flex items-center gap-1">
                            <Link href={home} className="min-w-0 px-2" aria-label="Home">
                                <ProductLockup size={product ? 24 : 26} product={product} />
                            </Link>
                            {familyMenu}
                        </div>
                        {switcher}
                        <SideNav groups={groups} />
                        <div className="mt-auto flex flex-col gap-3">{footer}</div>
                    </aside>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="hidden h-[4.5rem] items-center justify-end gap-3 px-8 lg:flex">{account}</div>
                        {banner ? <div className="px-4 pb-2 pt-4 md:px-8 lg:pt-0">{banner}</div> : null}
                        <main id="main-content" tabIndex={-1} className="flex-1 px-4 pb-16 pt-6 outline-none md:px-8 lg:pt-2">
                            {/* One width for every signed-in page. */}
                            <div className="mx-auto w-full max-w-[72rem]">
                                <InColumnContext.Provider value={true}>{children}</InColumnContext.Provider>
                            </div>
                        </main>
                    </div>
                </div>
                {tabs ? <TabBar items={tabs} /> : null}
            </div>
        </ShellContext.Provider>
    );
}

function RailItem({ item }: { item: ShellNavItem }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Link
                    href={item.href}
                    aria-current={item.active ? 'page' : undefined}
                    className={cn(
                        'relative flex size-10 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        '[&_svg]:size-5 [&_svg]:shrink-0',
                        item.active
                            ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                >
                    {item.icon}
                    {/* The page's name, and its badge, for a screen reader; the tooltip shows the name. */}
                    <span className="sr-only">
                        {item.label}
                        {item.badge ? <>, {item.badge}</> : null}
                    </span>
                    {item.badge ? <NavBadge badge={item.badge} className={typeof item.badge === 'number' ? '-right-1 -top-1' : 'right-1 top-1'} /> : null}
                </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
    );
}

/** The rail frame: header, an icon rail from md, the content full-bleed, the tab bar on a phone. */
function RailShell({ nav = [], persistent = [], page: pageOverride, header, account, banner, children, className }: AppShellProps) {
    const main = nav.flatMap((g) => g.items);
    const foot = persistent.flatMap((g) => g.items);
    warnDuplicateLabels([...nav, ...persistent]);
    const tabs = tabsFor([{ items: [...main, ...foot] }]);
    const active = activeItem([...nav, ...persistent]);
    const place = useMemo(() => ({ page: pageOverride ?? active?.label }), [pageOverride, active?.label]);
    return (
        <ShellContext.Provider value={place}>
            <TooltipProvider delayDuration={300}>
                {/* Contains what is positioned inside it, as ToolShell's app frame does, and clips without scrolling. */}
                <div className={cn('relative flex h-dvh flex-col overflow-clip bg-background', className)}>
                    <SkipLink />
                    {header}
                    {banner}
                    <div className="flex min-h-0 flex-1">
                        <nav aria-label="Pages" className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3 md:flex">
                            {main.map((it) => (
                                <RailItem key={it.href} item={it} />
                            ))}
                            <div className="mt-auto flex flex-col items-center gap-1">
                                {foot.map((it) => (
                                    <RailItem key={it.href} item={it} />
                                ))}
                                {account}
                            </div>
                        </nav>
                        <main
                            id="main-content"
                            tabIndex={-1}
                            className={cn('flex min-h-0 min-w-0 flex-1 flex-col outline-none', tabs && 'max-md:pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]')}
                        >
                            {children}
                        </main>
                    </div>
                    {tabs ? <TabBar items={tabs} /> : null}
                </div>
            </TooltipProvider>
        </ShellContext.Provider>
    );
}

export interface AccountMenuItem {
    label: string;
    href?: string;
    onSelect?: () => void;
    icon?: ReactNode;
    destructive?: boolean;
}

/**
 * A pane's top bar in an app frame: one 56px row, a hairline under it, the
 * same gutter on every pane (a thread, a channel, a setting), so a back
 * button, a title and the actions line up as you move between them, and with
 * a 56px header beside them. It is not a page title: put PageHeader on pages.
 */
export function PaneHeader({ children, className }: { children: ReactNode; className?: string }) {
    return <header className={cn('flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-5', className)}>{children}</header>;
}

/** The account button: initial + short id, a menu of items. */
export function AccountMenu({
    name,
    detail,
    items,
    nameFrom = 'sm',
}: {
    name: string;
    /** A second line: the short did, an address. */
    detail?: string;
    items: (AccountMenuItem | 'separator')[];
    /** The width from which the name shows beside the initial. A header with
     *  navigation beside it needs the room until lg. */
    nameFrom?: 'sm' | 'lg';
}) {
    const initial = name.trim().charAt(0).toUpperCase() || '·';
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className={cn(
                    'inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card pl-1 pr-1 text-[0.9375rem] outline-none transition-colors hover:border-oca-hairline-strong focus-visible:ring-2 focus-visible:ring-ring',
                    nameFrom === 'lg' ? 'lg:pr-3.5' : 'sm:pr-3.5'
                )}
                aria-label={`${name}, account menu`}
            >
                {/* The initial is drawn, not written: the button's text is the name it is read by. */}
                <span
                    aria-hidden
                    data-initial={initial}
                    className="flex size-8 items-center justify-center rounded-full bg-foreground text-[0.8125rem] font-medium text-background before:content-[attr(data-initial)]"
                />
                <span className={cn('max-w-[10rem] truncate', nameFrom === 'lg' ? 'max-lg:hidden' : 'max-sm:hidden')}>
                    {name}
                </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate text-[0.9375rem] font-medium text-foreground">{name}</span>
                    {detail ? <span className="truncate font-mono text-[0.75rem]">{detail}</span> : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {items.map((it, i) =>
                    it === 'separator' ? (
                        <DropdownMenuSeparator key={`sep-${i}`} />
                    ) : it.href ? (
                        <DropdownMenuItem key={it.label} asChild destructive={it.destructive}>
                            <Link href={it.href}>
                                {it.icon}
                                {it.label}
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem key={it.label} onSelect={it.onSelect} destructive={it.destructive}>
                            {it.icon}
                            {it.label}
                        </DropdownMenuItem>
                    )
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

/*
 * A switch changes every colour at once, not as a fade. next-themes'
 * disableTransitionOnChange did that on every load as well (it applies the
 * theme on mount), at two whole-document style recalculations; this does it
 * only when someone switches.
 */
function switchQuietly(apply: () => void) {
    const root = document.documentElement;
    const still = document.createElement('style');
    still.textContent = "[data-oc-app='ochk'] *,[data-oc-app='ochk'] *::before,[data-oc-app='ochk'] *::after{transition:none!important}";
    document.head.appendChild(still);
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        watch.disconnect();
        clearTimeout(timer);
        // The new colours computed while transitions are off; then they come back with nothing to animate.
        void root.offsetHeight;
        still.remove();
    };
    // next-themes writes the class in an effect after the render; a switch to "system" that changes nothing writes none.
    const watch = new MutationObserver(finish);
    watch.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const timer = setTimeout(finish, 500);
    apply();
}

export type ThemeProviderProps = Omit<NextThemeProviderProps, 'disableTransitionOnChange'>;

/**
 * next-themes as the family sets it: the class on <html>, the system's mode
 * until someone picks one. No disableTransitionOnChange: ThemeToggle stills
 * its own switch, and the option cost every page load two recalculations.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return (
        <NextThemeProvider attribute="class" defaultTheme="system" enableSystem {...props}>
            {children}
        </NextThemeProvider>
    );
}

/** next-themes' useTheme, whose setTheme changes the colours at once rather than fading them: for a site's own switch. */
export function useTheme() {
    const t = useNextTheme();
    const { setTheme: set } = t;
    const setTheme = useCallback((value: Parameters<typeof set>[0]) => switchQuietly(() => set(value)), [set]);
    return { ...t, setTheme };
}

/** Light, dark, or follow the system: one button that cycles. */
export function ThemeToggle({ className }: { className?: string }) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const current = mounted ? (theme ?? 'system') : 'system';
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : SunMoon;
    return (
        <button
            type="button"
            onClick={() => setTheme(next)}
            aria-label={`Theme: ${current}. Switch to ${next}`}
            title={`Theme: ${current}`}
            className={cn(
                // 40px drawn, 44px to a thumb, as Button's icon size; a crowded row does not squeeze it.
                'relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:before:absolute pointer-coarse:before:-inset-0.5',
                className
            )}
        >
            <Icon className="size-[1.125rem]" />
        </button>
    );
}
