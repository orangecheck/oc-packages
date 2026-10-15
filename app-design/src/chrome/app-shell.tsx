import { Menu, Moon, Sun, SunMoon } from 'lucide-react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState, type ReactNode } from 'react';

import { AppIcon, Lockup } from '../brand/mark';
import { cn } from '../lib/cn';
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

function SideNav({ groups, onNavigate }: { groups: ShellNavGroup[]; onNavigate?: () => void }) {
    return (
        <nav aria-label="Sections" className="flex flex-col gap-6">
            {groups.map((g, gi) => (
                <div key={g.label ?? gi} className="flex flex-col gap-0.5">
                    {g.label ? <p className="px-3 pb-1.5 text-[0.8125rem] text-muted-foreground">{g.label}</p> : null}
                    {g.items.map((it) => (
                        <Link
                            key={it.href}
                            href={it.href}
                            onClick={onNavigate}
                            aria-current={it.active ? 'page' : undefined}
                            className={cn(
                                'flex h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors',
                                '[&_svg]:size-[1.125rem] [&_svg]:shrink-0',
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

/**
 * The signed-in frame: a quiet sidebar on the canvas, content on the right. On
 * phones the sidebar becomes a sheet behind a top bar. The account control and
 * any banner are slots, so the shell knows nothing about sessions.
 */
export function AppShell({
    nav,
    home = '/',
    account,
    banner,
    footer,
    children,
    className,
}: {
    nav: ShellNavGroup[];
    home?: string;
    account?: ReactNode;
    banner?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className={cn('min-h-dvh bg-background', className)}>
            <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md lg:hidden">
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger
                        className="inline-flex size-10 items-center justify-center rounded-full hover:bg-accent"
                        aria-label="Open navigation"
                    >
                        <Menu className="size-5" />
                    </SheetTrigger>
                    <SheetContent side="left" className="p-4 pt-16">
                        <SheetTitle className="sr-only">Navigation</SheetTitle>
                        <SideNav groups={nav} onNavigate={() => setOpen(false)} />
                    </SheetContent>
                </Sheet>
                <Link href={home} aria-label="Home">
                    <AppIcon size={28} />
                </Link>
                <div className="flex items-center">{account}</div>
            </div>
            <div className="mx-auto flex w-full max-w-[90rem]">
                <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 overflow-y-auto px-4 py-6 lg:flex">
                    <Link href={home} className="px-2" aria-label="Home">
                        <Lockup size={26} />
                    </Link>
                    <SideNav groups={nav} />
                    <div className="mt-auto flex flex-col gap-3">{footer}</div>
                </aside>
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="hidden h-[4.5rem] items-center justify-end gap-3 px-8 lg:flex">{account}</div>
                    {banner ? <div className="px-4 pb-2 pt-4 md:px-8 lg:pt-0">{banner}</div> : null}
                    <main id="main-content" className="flex-1 px-4 pb-16 pt-6 md:px-8 lg:pt-2">
                        {children}
                    </main>
                </div>
            </div>
        </div>
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
                className="inline-flex h-10 items-center gap-2.5 rounded-full border border-border bg-card pl-1 pr-3.5 text-[0.9375rem] outline-none transition-colors hover:border-oca-hairline-strong focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Account: ${name}`}
            >
                <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-[0.8125rem] font-medium text-background">
                    {initial}
                </span>
                <span className="max-w-[10rem] truncate">{name}</span>
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
