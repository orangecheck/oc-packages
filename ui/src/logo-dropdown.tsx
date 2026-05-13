import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { EcosystemSlug } from './ecosystem-switcher';

/**
 * `<OcLogoDropdown>` — the logo IS the dropdown.
 *
 * Wraps a site's local LogoMark + wordmark in a button that, on click,
 * drops a popover listing every OrangeCheck family property. The current
 * property is highlighted with a primary-tinted background, a left-edge
 * accent bar, and a "home" label — and is itself a clickable link to
 * the local home href (default `/`).
 *
 * Family properties carry one of three categories:
 *
 *   - `hub`      — orangecheck umbrella + docs (no badge)
 *   - `product`  — commercial products (me, vault, fleet) · primary chip
 *   - `protocol` — open verb specs (attest, lock, vote, stamp, agent,
 *                  pledge) · muted chip
 *
 * The category of the *current* site is auto-rendered as a tiny mono
 * chip inside the trigger button, and the dropdown itself groups
 * entries by category with subtle mono dividers — so the product /
 * protocol distinction is visible both on the logo and in the menu,
 * with a single source of truth (the `ENTRIES` table below).
 *
 * Mobile-aware: the popover's width is clamped to the viewport,
 * content scrolls when there are more entries than fit. The category
 * chip on the trigger hides below `sm` to preserve mobile header
 * space — the dropdown itself still shows the grouping.
 */

type Category = 'hub' | 'product' | 'protocol';

interface SwitcherEntry {
    slug: EcosystemSlug;
    href: string;
    label: string;
    sub: string;
    docsHref: string;
    category: Category;
}

const ENTRIES: SwitcherEntry[] = [
    {
        slug: 'home',
        href: 'https://ochk.io',
        label: 'orangecheck',
        sub: 'umbrella · sign-in',
        docsHref: 'https://docs.ochk.io',
        category: 'hub',
    },
    {
        slug: 'docs',
        href: 'https://docs.ochk.io',
        label: 'oc·docs',
        sub: 'unified reference',
        docsHref: 'https://docs.ochk.io',
        category: 'hub',
    },
    {
        slug: 'me',
        href: 'https://me.ochk.io',
        label: 'oc·me',
        sub: 'earn — consumer identity',
        docsHref: 'https://docs.ochk.io/me',
        category: 'product',
    },
    {
        slug: 'vault',
        href: 'https://vault.ochk.io',
        label: 'oc·vault',
        sub: 'keep — encrypted secrets',
        docsHref: 'https://docs.ochk.io/vault',
        category: 'product',
    },
    {
        slug: 'fleet',
        href: 'https://fleet.ochk.io',
        label: 'oc·fleet',
        sub: 'managed — agent fleet',
        docsHref: 'https://docs.ochk.io/fleet',
        category: 'product',
    },
    {
        slug: 'attest',
        href: 'https://attest.ochk.io',
        label: 'oc·attest',
        sub: 'am — sybil resistance',
        docsHref: 'https://docs.ochk.io/attest',
        category: 'protocol',
    },
    {
        slug: 'lock',
        href: 'https://lock.ochk.io',
        label: 'oc·lock',
        sub: 'whisper — encryption',
        docsHref: 'https://docs.ochk.io/lock',
        category: 'protocol',
    },
    {
        slug: 'vote',
        href: 'https://vote.ochk.io',
        label: 'oc·vote',
        sub: 'decide — polls',
        docsHref: 'https://docs.ochk.io/vote',
        category: 'protocol',
    },
    {
        slug: 'stamp',
        href: 'https://stamp.ochk.io',
        label: 'oc·stamp',
        sub: 'declare — block-anchored',
        docsHref: 'https://docs.ochk.io/stamp',
        category: 'protocol',
    },
    {
        slug: 'agent',
        href: 'https://agent.ochk.io',
        label: 'oc·agent',
        sub: 'delegate — scoped auth',
        docsHref: 'https://docs.ochk.io/agent',
        category: 'protocol',
    },
    {
        slug: 'pledge',
        href: 'https://pledge.ochk.io',
        label: 'oc·pledge',
        sub: 'swear — bonded commitment',
        docsHref: 'https://docs.ochk.io/pledge',
        category: 'protocol',
    },
];

const SECTIONS: Array<{ category: Category; label: string }> = [
    { category: 'hub', label: 'hub' },
    { category: 'product', label: 'products' },
    { category: 'protocol', label: 'protocols' },
];

export interface OcLogoDropdownProps {
    /**
     * Which property this site IS. Used to highlight the active row,
     * route the active row's link to `homeHref` instead of the cross-
     * domain absolute URL, and pick the category chip rendered next
     * to the wordmark.
     */
    current: EcosystemSlug;
    /**
     * The site's local home path (for the active row). Default `/`.
     * Always a same-origin path — the logo's "go home" affordance is
     * preserved by clicking the highlighted row.
     */
    homeHref?: string;
    /**
     * Logo contents · typically `<LogoMark />` + `<span>oc·X</span>`.
     */
    children: ReactNode;
    /** className for the outer container. */
    className?: string;
    /** className for the trigger button. */
    triggerClassName?: string;
    /** className for the popover. */
    popoverClassName?: string;
}

function CategoryChip({ category }: { category: Category }) {
    if (category === 'hub') return null;
    const isProduct = category === 'product';
    return (
        <span
            aria-label={isProduct ? 'commercial product' : 'protocol reference'}
            className={
                'ml-1 hidden rounded-sm border px-1.5 py-[1px] font-mono text-[9px] font-medium tracking-widest uppercase sm:inline-block ' +
                (isProduct
                    ? 'border-primary/25 bg-primary/10 text-primary'
                    : 'border-muted-foreground/20 bg-muted/40 text-muted-foreground/85')
            }
            data-oc-category={category}
        >
            {isProduct ? 'product' : 'protocol'}
        </span>
    );
}

function MenuCategoryChip({ category }: { category: Category }) {
    if (category === 'hub') return null;
    const isProduct = category === 'product';
    return (
        <span
            aria-hidden
            className={
                'inline-block rounded-sm px-1 py-[1px] font-mono text-[9px] font-medium tracking-widest uppercase ' +
                (isProduct
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted/60 text-muted-foreground/80')
            }
        >
            {isProduct ? 'pro' : 'spec'}
        </span>
    );
}

export function OcLogoDropdown({
    current,
    homeHref = '/',
    children,
    className,
    triggerClassName,
    popoverClassName,
}: OcLogoDropdownProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const menuId = useId();

    const currentCategory: Category = ENTRIES.find((e) => e.slug === current)?.category ?? 'hub';

    // Outside-click + Escape close.
    useEffect(() => {
        if (!open) return;
        function onDoc(e: MouseEvent) {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(e.target as Node)) setOpen(false);
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div
            ref={containerRef}
            className={'relative ' + (className ?? '')}
            data-oc-logo-dropdown=""
            data-oc-current-category={currentCategory}
        >
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={menuId}
                aria-label="OrangeCheck family · open property menu"
                title="Switch OrangeCheck product"
                onClick={() => setOpen((v) => !v)}
                className={
                    triggerClassName ??
                    'group hover:bg-accent/30 -mx-1.5 -my-1 flex min-h-[40px] items-center gap-2 rounded-sm px-1.5 py-1 transition-colors'
                }
                data-oc-logo-dropdown-trigger=""
            >
                {children}
                <CategoryChip category={currentCategory} />
                <ChevronDown
                    aria-hidden
                    className={
                        'text-muted-foreground/70 group-hover:text-foreground/80 h-3.5 w-3.5 shrink-0 transition-transform ' +
                        (open ? 'rotate-180' : '')
                    }
                />
            </button>

            {open && (
                <div
                    id={menuId}
                    role="menu"
                    aria-label="OrangeCheck family"
                    className={
                        popoverClassName ??
                        'bg-background absolute top-full left-0 z-[60] mt-2 w-[min(20rem,calc(100vw-1rem))] border shadow-lg'
                    }
                    data-oc-logo-dropdown-popover=""
                >
                    <div className="label-mono text-primary border-b px-4 py-2">
                        § the orangecheck family
                    </div>
                    <div
                        className="max-h-[min(28rem,70vh)] overflow-y-auto py-1"
                        role="none"
                    >
                        {SECTIONS.map(({ category, label }) => {
                            const sectionEntries = ENTRIES.filter((e) => e.category === category);
                            if (sectionEntries.length === 0) return null;
                            return (
                                <div key={category} role="none" data-oc-section={category}>
                                    <div
                                        role="separator"
                                        aria-hidden
                                        className={
                                            'text-muted-foreground/60 px-4 pt-2.5 pb-1 font-mono text-[9px] font-medium tracking-widest uppercase ' +
                                            (category === 'hub' ? '' : 'border-t mt-1')
                                        }
                                    >
                                        {label}
                                    </div>
                                    <ul role="none" className="pb-1">
                                        {sectionEntries.map((e) => {
                                            const isActive = e.slug === current;
                                            const href = isActive ? homeHref : e.href;
                                            return (
                                                <li key={e.slug} role="none">
                                                    <Link
                                                        href={href}
                                                        role="menuitem"
                                                        onClick={() => setOpen(false)}
                                                        aria-current={isActive ? 'page' : undefined}
                                                        className={
                                                            'group flex items-center gap-2 px-4 py-2 transition-colors ' +
                                                            (isActive
                                                                ? 'bg-primary/8 border-primary -ml-px border-l-2'
                                                                : 'hover:bg-muted -ml-px border-l-2 border-transparent')
                                                        }
                                                        data-oc-logo-dropdown-item={
                                                            isActive ? 'current' : 'sibling'
                                                        }
                                                        data-oc-entry-category={e.category}
                                                    >
                                                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                                            <span
                                                                className={
                                                                    'font-display text-[12px] font-semibold tracking-tight ' +
                                                                    (isActive
                                                                        ? 'text-primary'
                                                                        : 'text-foreground group-hover:text-primary transition-colors')
                                                                }
                                                            >
                                                                {e.label}
                                                            </span>
                                                            <span className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wide">
                                                                {e.sub}
                                                            </span>
                                                        </span>
                                                        <MenuCategoryChip category={e.category} />
                                                        {isActive ? (
                                                            <span className="text-primary inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-widest uppercase">
                                                                home
                                                                <Check className="h-3 w-3" />
                                                            </span>
                                                        ) : null}
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                    <div className="border-t px-4 py-2 font-mono text-[10px] tracking-widest uppercase">
                        <Link
                            href="https://docs.ochk.io"
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground inline-block transition-colors"
                        >
                            docs.ochk.io →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
