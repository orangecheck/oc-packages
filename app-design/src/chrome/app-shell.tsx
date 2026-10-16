import { ChevronRight, Menu, Moon, Sun, SunMoon } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Lockup } from '../brand/mark';
import { cn } from '../lib/cn';
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
} from '../primitives/overlay';

export interface ShellNavItem {
    href: string;
    label: string;
    icon?: ReactNode;
    active?: boolean;
    /** A count or a dot beside the label (unread, needs attention). */
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
    groups: ShellNavGroup[];
}

function SideNav({ groups, onNavigate }: { groups: ShellNavGroup[]; onNavigate?: () => void }) {
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
 * app. Pages get the section through context: PageHeader uses it as its
 * eyebrow. The account control and any banner are slots.
 */
export function AppShell({
    nav,
    sections,
    activeSection,
    page: pageOverride,
    persistent = [],
    home = '/',
    account,
    banner,
    footer,
    children,
    className,
}: {
    /** Flat groups, for an app without sections. */
    nav?: ShellNavGroup[];
    sections?: ShellSection[];
    activeSection?: string;
    /** The page's name for the place strip, when it is not a nav item of its own. */
    page?: string;
    /** Groups shown under every section, after its own. */
    persistent?: ShellNavGroup[];
    home?: string;
    account?: ReactNode;
    banner?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const current =
        sections && sections.length > 0
            ? (sections.find((sec) => sec.id === activeSection) ??
              sections.find((sec) => activeItem(sec.groups)) ??
              sections[0]!)
            : undefined;
    const groups = current ? [...current.groups, ...persistent] : [...(nav ?? []), ...persistent];
    warnDuplicateLabels(groups);
    const page = activeItem(groups);
    const place = useMemo(
        () => ({
            section: current ? (current.title ?? current.label) : undefined,
            page: pageOverride ?? page?.label,
        }),
        [current, page?.label, pageOverride]
    );
    const switcher =
        sections && current && sections.length > 1 ? (
            <SectionSwitch sections={sections} current={current} onNavigate={() => setOpen(false)} />
        ) : null;
    return (
        <ShellContext.Provider value={place}>
            <div className={cn('min-h-dvh bg-background', className)}>
                <div className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md lg:hidden">
                    <div className="flex h-14 items-center gap-2 px-3">
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger
                                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-accent"
                                aria-label="Open navigation"
                            >
                                <Menu className="size-5" />
                            </SheetTrigger>
                            <SheetContent side="left" className="flex flex-col gap-6 overflow-y-auto p-4 pt-16">
                                <SheetTitle className="sr-only">Navigation</SheetTitle>
                                {switcher}
                                <SideNav groups={groups} onNavigate={() => setOpen(false)} />
                                {footer ? <div className="mt-auto flex flex-col gap-3">{footer}</div> : null}
                            </SheetContent>
                        </Sheet>
                        <Link href={home} aria-label="Home" className="rounded-lg p-1">
                            <Lockup size={22} />
                        </Link>
                        <div className="ml-auto flex items-center">{account}</div>
                    </div>
                    {place.page ? (
                        <div className="flex h-9 items-center gap-1.5 border-t border-border px-4 text-[0.875rem]">
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
                        <Link href={home} className="px-2" aria-label="Home">
                            <Lockup size={26} />
                        </Link>
                        {switcher}
                        <SideNav groups={groups} />
                        <div className="mt-auto flex flex-col gap-3">{footer}</div>
                    </aside>
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="hidden h-[4.5rem] items-center justify-end gap-3 px-8 lg:flex">{account}</div>
                        {banner ? <div className="px-4 pb-2 pt-4 md:px-8 lg:pt-0">{banner}</div> : null}
                        <main id="main-content" className="flex-1 px-4 pb-16 pt-6 md:px-8 lg:pt-2">
                            {/* One width for every signed-in page. */}
                            <div className="mx-auto w-full max-w-[72rem]">{children}</div>
                        </main>
                    </div>
                </div>
            </div>
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

/** The account button: initial + short id, a menu of items. */
export function AccountMenu({
    name,
    detail,
    items,
}: {
    name: string;
    /** A second line: the short did, an address. */
    detail?: string;
    items: (AccountMenuItem | 'separator')[];
}) {
    const initial = name.trim().charAt(0).toUpperCase() || '·';
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card pl-1 pr-1 text-[0.9375rem] outline-none transition-colors hover:border-oca-hairline-strong focus-visible:ring-2 focus-visible:ring-ring sm:pr-3.5"
                aria-label={`Account: ${name}`}
            >
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-[0.8125rem] font-medium text-background">
                    {initial}
                </span>
                <span className="max-w-[10rem] truncate max-sm:hidden">{name}</span>
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
                'inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                className
            )}
        >
            <Icon className="size-[1.125rem]" />
        </button>
    );
}
