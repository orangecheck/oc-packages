import { Check, ChevronDown, CornerDownLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import * as React from 'react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Tooltip } from '../primitives/tooltip';
import { cn } from '../tokens/cn';
import type { EcosystemSlug } from './ecosystem-switcher';
import {
    FAMILY_PROPERTIES,
    SITE_STATE_LABEL,
    findFamilyProperty,
    type FamilyCategory,
    type SiteState,
} from './family-properties';

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
 * with a single source of truth (`./family-properties.ts`).
 *
 * The optional `siteState` prop renders a second tiny chip after the
 * category chip — `alpha` or `beta` — for sites that aren't `live`.
 * The vocabulary is canonical across the family (see SiteState in
 * family-properties.ts). Pass it from your per-site config so a
 * single edit propagates to the logo, the account menu, and anywhere
 * else the chip surfaces.
 *
 * Mobile-aware: the popover's width is clamped to the viewport,
 * content scrolls when there are more entries than fit. The trigger
 * chips hide below `sm` to preserve mobile header space — the dropdown
 * itself still shows the grouping.
 *
 * On a fine pointer (mouse) the trigger reveals a themed `<Tooltip>` on
 * hover, and on keyboard focus — naming where you are and the two
 * affordances (`click · switch site`, `double-click · home`). It replaces
 * the old native `title=` (unthemed, undelayed, invisible on touch) and is
 * never shown on touch, where the menu's `home ✓` row is the path home.
 */

const SECTIONS: Array<{ category: FamilyCategory; label: string }> = [
    { category: 'hub', label: 'hub' },
    { category: 'product', label: 'products' },
    { category: 'protocol', label: 'protocols' },
    { category: 'owner', label: 'owner' },
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
     * Optional lifecycle state for this site. `'live'` (default) renders
     * no chip; `'alpha'` and `'beta'` render a small mono uppercase chip
     * after the category badge. Drive this from your per-site config so
     * one constant change ripples to every surface.
     */
    siteState?: SiteState;
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
    /**
     * When true, include the `owner` section (currently just
     * `oc·analytics`) in the family list. Consumers pass this from
     * their session: `useOcSession().account?.isOwner ?? false`.
     * Defaults to false so non-owners never see the entry.
     *
     * Not a security boundary — analytics.ochk.io re-checks the live
     * OWNER_OC_ADDRESSES env on every request. This prop only
     * controls UX visibility.
     */
    showOwnerEntries?: boolean;
}

function CategoryChip({ category }: { category: FamilyCategory }) {
    if (category === 'hub') return null;
    const label =
        category === 'product' ? 'product' : category === 'protocol' ? 'protocol' : 'owner';
    const tone =
        category === 'product'
            ? 'border-primary/25 bg-primary/10 text-primary'
            : category === 'protocol'
              ? 'border-muted-foreground/20 bg-muted/40 text-muted-foreground/85'
              : 'border-warning/30 bg-warning/10 text-warning';
    return (
        <span
            aria-label={
                category === 'product'
                    ? 'commercial product'
                    : category === 'protocol'
                      ? 'protocol reference'
                      : 'owner-only surface'
            }
            className={
                'ml-1 hidden rounded-sm border px-1.5 py-[1px] font-mono text-[9px] font-medium tracking-widest uppercase sm:inline-block ' +
                tone
            }
            data-oc-category={category}
        >
            {label}
        </span>
    );
}

function SiteStateBadge({ state }: { state: SiteState }) {
    if (state === 'live') return null;
    return (
        <span
            aria-label={`site lifecycle: ${state}`}
            className="text-muted-foreground/70 ml-1 hidden font-mono text-[9px] font-medium tracking-widest uppercase sm:inline-block"
            data-oc-site-state={state}
        >
            {SITE_STATE_LABEL[state]}
        </span>
    );
}

function MenuCategoryChip({ category }: { category: FamilyCategory }) {
    if (category === 'hub') return null;
    const label =
        category === 'product' ? 'pro' : category === 'protocol' ? 'spec' : 'own';
    const tone =
        category === 'product'
            ? 'bg-primary/10 text-primary'
            : category === 'protocol'
              ? 'bg-muted/60 text-muted-foreground/80'
              : 'bg-warning/15 text-warning';
    return (
        <span
            aria-hidden
            className={
                'inline-block shrink-0 rounded-sm px-1 py-[1px] font-mono text-[9px] font-medium tracking-widest uppercase ' +
                tone
            }
        >
            {label}
        </span>
    );
}

/**
 * The hover/focus tooltip body — three rows that the native `title=` used to
 * hide: where you are, then `click · switch site` and `double-click · home`.
 * Decorative reinforcement of the trigger's `aria-label` (the tooltip itself
 * is `aria-hidden`); the same `CornerDownLeft` glyph as the in-menu home hint.
 */
function SwitcherTooltipCard({ current }: { current: EcosystemSlug }) {
    const prop = findFamilyProperty(current);
    return (
        <div className="w-[13rem] max-w-[calc(100vw-1.5rem)]">
            <div className="flex flex-col leading-tight">
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-muted-foreground font-mono text-[9px] tracking-widest uppercase">
                        you’re on
                    </span>
                    <span className="text-primary font-display text-[12px] font-semibold tracking-tight">
                        {prop?.label ?? 'orangecheck family'}
                    </span>
                </span>
                {prop?.sub && (
                    <span className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wide">
                        {prop.sub}
                    </span>
                )}
            </div>
            <div className="border-border -mx-2.5 my-2 border-t" />
            <div className="flex items-center gap-1.5">
                <ChevronDown aria-hidden className="text-muted-foreground h-3 w-3 shrink-0" />
                <span className="text-primary font-mono text-[10px] font-medium tracking-widest uppercase">
                    click
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">·</span>
                <span className="text-muted-foreground font-mono text-[10px] tracking-wide">
                    switch site
                </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
                <CornerDownLeft aria-hidden className="text-muted-foreground h-3 w-3 shrink-0" />
                <span className="text-primary font-mono text-[10px] font-medium tracking-widest uppercase">
                    double-click
                </span>
                <span className="text-muted-foreground font-mono text-[10px]">·</span>
                <span className="text-muted-foreground font-mono text-[10px] tracking-wide">
                    home
                </span>
            </div>
        </div>
    );
}

export function OcLogoDropdown({
    current,
    homeHref = '/',
    siteState = 'live',
    children,
    className,
    triggerClassName,
    popoverClassName,
    showOwnerEntries = false,
}: OcLogoDropdownProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const menuId = useId();
    const router = useRouter();

    const currentCategory: FamilyCategory = findFamilyProperty(current)?.category ?? 'hub';

    /**
     * Trigger click semantics:
     *
     *   single-click  → toggle the family dropdown
     *   double-click  → navigate to `homeHref` (the local landing)
     *
     * `MouseEvent.detail` is the running click count for clicks within
     * the browser's double-click threshold (~500ms). The DOM still
     * fires the `click` event on the first tap, so the dropdown
     * momentarily opens during a double-click — and the second click
     * navigates home. That's the visual story the popover-side hint
     * sells: *open · tap again · home.*
     */
    function handleTriggerClick(e: React.MouseEvent<HTMLButtonElement>) {
        if (e.detail >= 2) {
            e.preventDefault();
            setOpen(false);
            void router.push(homeHref);
            return;
        }
        setOpen((v) => !v);
    }

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
            className={'relative inline-flex items-center ' + (className ?? '')}
            data-oc-logo-dropdown=""
            data-oc-current-category={currentCategory}
            data-oc-site-state={siteState}
        >
            <Tooltip
                content={<SwitcherTooltipCard current={current} />}
                disabled={open}
                side="bottom"
                align="start"
                sideOffset={8}
                zIndexClassName="z-[70]"
            >
                <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={open}
                    aria-controls={menuId}
                    aria-label="orangecheck family menu"
                    onClick={handleTriggerClick}
                    className={cn(
                        // focus indicator is guaranteed even if a consumer overrides triggerClassName
                        'focus-visible:ring-primary/60 rounded-sm focus-visible:ring-2 focus-visible:outline-none',
                        triggerClassName ??
                            'group hover:bg-accent/30 -mx-1.5 -my-1 flex min-h-[40px] items-center gap-2 rounded-sm px-1.5 py-1 transition-colors ' +
                                (open ? 'bg-accent/20' : '')
                    )}
                    data-oc-logo-dropdown-trigger=""
                    data-oc-logo-dropdown-open={open ? 'true' : 'false'}
                >
                    {children}
                    <CategoryChip category={currentCategory} />
                    <SiteStateBadge state={siteState} />
                    <ChevronDown
                        aria-hidden
                        className={
                            'text-muted-foreground/70 group-hover:text-foreground/80 h-3.5 w-3.5 shrink-0 transition-transform duration-200 ' +
                            (open ? 'rotate-180' : '')
                        }
                    />
                </button>
            </Tooltip>
            {/* Home affordance · a sibling Link to the trigger button
                rather than a child of it (nested buttons would be
                invalid HTML). Fades + slides in when the dropdown is
                open, whispering "tap again, you'll go home". Clicking
                the hint navigates directly — works for users who
                discover it before they discover the double-click. The
                subtle motion-safe pulse on the icon nudges the eye
                without shouting. */}
            <Link
                href={homeHref}
                aria-label={'go to ' + homeHref + ' (this site\'s home)'}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                className={
                    'hover:text-primary group/home -ml-1 hidden items-center gap-1 rounded-sm px-1.5 py-1 font-mono text-[9px] tracking-widest uppercase transition-all duration-200 sm:inline-flex ' +
                    (open
                        ? 'pointer-events-auto translate-x-0 text-muted-foreground/70 opacity-100 hover:bg-accent/30'
                        : 'pointer-events-none -translate-x-1 opacity-0')
                }
                data-oc-logo-dropdown-home-hint=""
            >
                <CornerDownLeft
                    aria-hidden
                    className={
                        'h-3 w-3 group-hover/home:text-primary ' +
                        (open ? 'motion-safe:animate-pulse' : '')
                    }
                />
                <span className="text-primary/70 group-hover/home:text-primary">
                    home
                </span>
            </Link>

            {open && (
                <div
                    id={menuId}
                    role="menu"
                    aria-label="orangecheck family"
                    className={
                        popoverClassName ??
                        'bg-background absolute top-full left-0 z-[60] mt-2 w-[min(20rem,calc(100vw-1rem))] border shadow-lg'
                    }
                    data-oc-logo-dropdown-popover=""
                >
                    <div className="label-mono text-primary border-b px-4 py-2">
                        § the orangecheck family
                    </div>
                    <div className="max-h-[min(28rem,70vh)] overflow-y-auto py-1" role="none">
                        {SECTIONS.map(({ category, label }) => {
                            // Owner-only sections only render when the
                            // consumer has explicitly opted in (caller
                            // reads `useOcSession().account?.isOwner`).
                            // Non-owners simply don't see them.
                            if (category === 'owner' && !showOwnerEntries) return null;
                            const sectionEntries = FAMILY_PROPERTIES.filter(
                                (e) => e.category === category
                            );
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
                                            const href = isActive ? homeHref : e.origin;
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
