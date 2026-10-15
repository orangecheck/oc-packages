import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { Lockup } from '../brand/mark';
import { cn } from '../lib/cn';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../primitives/overlay';

export interface NavItem {
    href: string;
    label: ReactNode;
    /** Marks the current section for styling and aria-current. */
    active?: boolean;
    external?: boolean;
}

function NavLink({ item, className, onNavigate }: { item: NavItem; className?: string; onNavigate?: () => void }) {
    const cls = cn(
        'rounded-full px-3 py-2 text-[0.9375rem] transition-colors',
        item.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
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

/**
 * The public header: lockup, a few words of navigation, actions on the right.
 * Below md the navigation moves into a sheet; the actions stay.
 */
export function SiteHeader({
    home = '/',
    brand,
    nav = [],
    actions,
    className,
}: {
    home?: string;
    brand?: ReactNode;
    nav?: NavItem[];
    actions?: ReactNode;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <header
            className={cn(
                'sticky top-0 z-40 w-full border-b border-transparent bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70',
                className
            )}
        >
            <div className="oca-container flex h-16 items-center justify-between gap-4 md:h-[4.5rem]">
                <Link href={home} className="-ml-1 rounded-lg p-1" aria-label="Home">
                    {brand ?? <Lockup size={28} />}
                </Link>
                {nav.length > 0 ? (
                    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
                        {nav.map((n) => (
                            <NavLink key={n.href} item={n} />
                        ))}
                    </nav>
                ) : null}
                <div className="flex items-center gap-2">
                    {actions}
                    {nav.length > 0 ? (
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger
                                className="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent md:hidden"
                                aria-label="Open menu"
                            >
                                <Menu className="size-5" />
                            </SheetTrigger>
                            <SheetContent side="right" className="pt-16">
                                <SheetTitle className="sr-only">Menu</SheetTitle>
                                <nav aria-label="Main" className="flex flex-col">
                                    {nav.map((n) => (
                                        <NavLink
                                            key={n.href}
                                            item={n}
                                            className="rounded-xl px-3 py-3 text-[1.0625rem]"
                                            onNavigate={() => setOpen(false)}
                                        />
                                    ))}
                                </nav>
                            </SheetContent>
                        </Sheet>
                    ) : null}
                </div>
            </div>
        </header>
    );
}

export interface FooterColumn {
    heading: string;
    links: NavItem[];
}

/**
 * The footer, in the deck's register: a line of fine print, the support credit,
 * and a few columns of links. Links are 44px tall on phones.
 */
export function SiteFooter({
    columns = [],
    fineprint,
    meta,
    className,
}: {
    columns?: FooterColumn[];
    fineprint?: ReactNode;
    meta?: ReactNode;
    className?: string;
}) {
    return (
        <footer className={cn('border-t border-border bg-background', className)}>
            <div className="oca-container grid gap-10 py-14 md:grid-cols-[1.3fr_repeat(3,1fr)] md:py-16">
                <div className="flex flex-col gap-4">
                    <Lockup size={26} />
                    {fineprint ? <p className="max-w-xs text-[0.9375rem] leading-relaxed text-muted-foreground">{fineprint}</p> : null}
                </div>
                {columns.map((col) => (
                    <div key={col.heading} className="flex flex-col gap-1">
                        <p className="mb-2 text-[0.875rem] font-medium">{col.heading}</p>
                        {col.links.map((l) => (
                            <NavLink
                                key={l.href}
                                item={l}
                                className="-mx-3 py-2.5 text-[0.9375rem] md:py-1.5"
                            />
                        ))}
                    </div>
                ))}
            </div>
            {meta ? (
                <div className="oca-container border-t border-border py-6 text-[0.875rem] text-muted-foreground">{meta}</div>
            ) : null}
        </footer>
    );
}
