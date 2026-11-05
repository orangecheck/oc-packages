import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';

import { Lockup } from '../brand/mark';
import { Reveal } from '../components/motion';
import { familyByGroup, GET_AN_ACCOUNT, LEGAL_LINKS, OCHK_IO, OCHK_IO_FOOTER, PROTOCOLS, type FamilySlug } from '../family';
import { cn } from '../lib/cn';
import { HIT_LINK, HIT_LINKS } from '../lib/hit';
import type { FooterColumn, NavItem } from '../lib/nav';
import { AccountSlotContext, type AccountSlot } from '../lib/account-slot';
import { useFamilySignInHref } from '../lib/sign-in';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetTitle, SheetTrigger } from '../primitives/overlay';
import { ThemeToggle } from './app-shell';
import { CTA_BLOCK, CTA_LINK, CtaLabel, CtaPlus } from './cta';
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
        'rounded-none px-3 py-2 text-[0.9375rem] transition-colors',
        item.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        // A tool's links are 39px, 44 to a thumb by the ::before; the ::after is the active bar.
        line && cn('after:absolute after:inset-x-3 after:-bottom-[0.625rem] after:h-0.5', HIT_LINK),
        line && item.active && 'after:bg-foreground',
        className
    );
    if (item.external) {
        return (
            <a href={item.href} className={cls} rel="noreferrer" aria-current={item.active ? 'page' : undefined} onClick={onNavigate}>
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
        'flex flex-col gap-0.5 rounded-none px-3 py-2 transition-colors hover:bg-accent',
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
                    'group inline-flex items-center gap-1 rounded-none py-2 pl-3 pr-2.5 text-[0.9375rem] transition-colors md:max-lg:pl-2.5 md:max-lg:pr-2',
                    // 39px drawn, 44 to a thumb.
                    HIT_LINK,
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
                        className={cn('block rounded-none px-2 py-2 text-[0.875rem]', HIT_LINK)}
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
    /**
     * 2.0's page CTA: deep orange, the header's full height, flush to the
     * frame's right rule, with the trailing "+". `true` is the registry's
     * "Get an account" to the family sign-in; an object names its own. `site`
     * only. In the phone's menu it is a full-width button at the bottom.
     *
     * `pending` is the moment a session check runs: the block keeps its width
     * and ground, its label is hidden, and nothing in it can be focused or
     * named, so the wrong label never flashes. `reserve` lists the other labels
     * it may take: the block is as wide as the widest, so the swap never moves
     * the nav. Not drawn with `account`: a site's own action goes in its menu.
     */
    cta?: boolean | { label?: ReactNode; href?: string; pending?: boolean; reserve?: readonly ReactNode[] };
    /** "Sign in" before the CTA; in the phone's menu, a row. `true` links the family sign-in. `site` only. Not drawn with `account`. */
    signIn?: boolean | { label?: ReactNode; href?: string };
    /**
     * The one account control (SessionAccount, or SessionAccountView): the
     * full-height block at the bar's right rule. Signed out below 480px its way
     * in moves to the foot of the phone menu. Pass it here, never among
     * `actions`, so a header holds exactly one; `cta` and `signIn` then give way.
     */
    account?: ReactNode;
    className?: string;
}

/**
 * The header's "Get an account", in the registry's words. It links ochk.io's
 * sign-in, returning to the page it is on; ochk.app passes its own sign-in as
 * `href`.
 */
export function AccountCta({ href, className }: { href?: string; className?: string }) {
    const family = useFamilySignInHref();
    return (
        <Button asChild size="sm" className={className}>
            <a href={href ?? family}>{GET_AN_ACCOUNT.label}</a>
        </Button>
    );
}

/**
 * The header: lockup (and the site's word), navigation, search, actions and,
 * in 2.0, a full-height CTA flush right. A thin bar with a hairline under it.
 * Below 900px (`site`; md for `tool`) the navigation, and the family when it
 * is on, move into one sheet: focus stays in it, Esc closes it, and the
 * current page is marked. The actions and the CTA stay.
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
    cta,
    signIn,
    account,
    className,
}: SiteHeaderProps) {
    const [open, setOpen] = useState(false);
    const familySignIn = useFamilySignInHref();
    const tool = variant === 'tool';
    const current = typeof family === 'string' ? family : undefined;
    const phoneNav = navOnPhone ? nav : [];
    // A site's navigation moves into the sheet below 900px; a tool's below md.
    const wide = tool ? 'md:flex' : 'min-[900px]:flex';
    const narrowOnly = tool ? 'md:hidden' : 'min-[900px]:hidden';
    const ctaOwn = typeof cta === 'object' ? cta : {};
    const signInOwn = typeof signIn === 'object' ? signIn : {};
    const headerCta =
        !tool && cta && !account
            ? {
                  label: ctaOwn.label ?? GET_AN_ACCOUNT.label,
                  href: ctaOwn.href ?? familySignIn,
                  pending: Boolean(ctaOwn.pending),
                  reserve: ctaOwn.reserve ?? [],
              }
            : null;
    const headerSignIn = !tool && signIn && !account ? { label: signInOwn.label ?? 'Sign in', href: signInOwn.href ?? familySignIn } : null;
    // The account is the block at the right rule, in the bar and at the phone menu's foot.
    const slot = (where: AccountSlot['where']): AccountSlot => ({ look: 'block', where });
    // 2.0's site header: the flat mark and the wordmark at 21px in the frame. The tool header keeps its lockup.
    const brandNode = brand ?? <ProductLockup size={tool ? 22 : 30} product={product} compact />;
    const menu = phoneNav.length > 0 || Boolean(family) || Boolean(menuExtra) || Boolean(headerSignIn) || Boolean(headerCta) || Boolean(account);
    // The 2.0 site header: its row is the frame (82.5rem, the page's gutter at left), the
    // links follow the brand, and Sign in and the CTA sit at the right rule.
    const framed = !tool;
    const navigation =
        nav.length > 0 ? (
            // To a thumb a short word's 44px is a ::before, not a wider box, and the words close up 4px, so the row still
            // fits beside search at 900 (the home link's 44 has to be drawn: the family menu sits 4px from it).
            <nav aria-label="Main" className={cn('hidden items-center', tool ? 'gap-1' : 'ml-[1.125rem] gap-7 pointer-coarse:gap-6', wide)}>
                {nav.map((n) =>
                    n.children?.length ? (
                        <NavDropdown key={n.href} item={n} />
                    ) : (
                        // The site's links are text, 28px apart; the tool's keep their padding and bar.
                        <NavLink key={n.href} item={n} line={tool} className={tool ? undefined : cn('flex h-11 items-center justify-center px-0 hover:text-oca-accent-ink', HIT_LINK)} />
                    )
                )}
            </nav>
        ) : null;
    return (
        <header
            // theme.css keeps a focused control clear of it (scroll-padding-top).
            data-oca-sticky={tool ? 'tool' : 'site'}
            className={cn(
                // group/bar: the lockup reads whether someone is signed in here (ProductLockup's `compact`).
                'group/bar sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/90',
                className
            )}
        >
            <div
                className={cn(
                    'flex items-center justify-between gap-4',
                    tool
                        ? cn('h-14 pl-4 md:pl-6', account ? 'max-[479px]:pr-4' : 'pr-4 md:pr-6')
                        : // The frame's column: the page's gutter at left, the CTA at the right rule.
                          'mx-auto h-14 w-full max-w-[var(--oca-frame-max)] border-x-[length:var(--oca-frame-rule)] border-border pl-[var(--oca-frame-gutter)] min-[900px]:h-[4.25rem]',
                    framed &&
                        (headerCta || account
                            ? // The CTA leaves the bar below 480px; the menu button then keeps the gutter.
                              'max-[479px]:pr-[var(--oca-frame-gutter)]'
                            : 'pr-[var(--oca-frame-gutter)]')
                )}
            >
                {/* Sized to its content, so with an account the right end gives way first (its name), then the brand. */}
                <div className={cn('flex min-w-0 items-center gap-1', tool ? 'md:gap-1' : 'flex-auto')}>
                    {/* It may narrow to its mark on a crowded phone bar, never under 44 to a thumb. */}
                    <Link href={home} className="-ml-1 flex min-h-11 min-w-0 items-center rounded-none p-1 pointer-coarse:min-w-11">
                        {brandNode}
                        {/* Read as "orangecheck home": the name starts with what the link shows. */}
                        <span className="sr-only"> home</span>
                    </Link>
                    {family ? <FamilyMenu current={current} className={tool ? 'max-md:hidden' : 'max-[899px]:hidden'} /> : null}
                    {tool && navigation ? <div className="ml-5">{navigation}</div> : navigation}
                </div>
                <div className={cn('flex items-center gap-2', (headerCta || account) && 'self-stretch', account ? 'shrink-[1000000]' : 'shrink-0')}>
                    {search}
                    {actions}
                    {headerSignIn ? (
                        <a href={headerSignIn.href} className="hidden min-h-11 items-center px-3 text-[0.9375rem] text-foreground transition-colors hover:text-oca-accent-ink min-[900px]:inline-flex">
                            {headerSignIn.label}
                        </a>
                    ) : null}
                    {menu ? (
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger
                                className={cn(
                                    'inline-flex size-11 shrink-0 items-center justify-center rounded-none text-foreground hover:bg-accent',
                                    narrowOnly
                                )}
                                aria-label="Open menu"
                            >
                                <Menu className="size-5" />
                            </SheetTrigger>
                            {/* Page chrome, so paper, not the product surface. */}
                            <SheetContent side="right" className="flex flex-col bg-background pt-16">
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
                                                            className={PHONE_ROW}
                                                            onNavigate={() => setOpen(false)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <NavLink
                                                    key={n.href}
                                                    item={n}
                                                    className={cn(PHONE_ROW, 'py-3')}
                                                    onNavigate={() => setOpen(false)}
                                                />
                                            )
                                        )}
                                    </nav>
                                ) : null}
                                {family ? (
                                    <details className={cn('group', phoneNav.length > 0 && 'mt-2 border-t border-border pt-4')}>
                                        <summary className="flex cursor-pointer list-none items-center justify-between rounded-none px-3 py-2.5 text-[1.0625rem] [&::-webkit-details-marker]:hidden">
                                            All orangecheck sites
                                            <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                                        </summary>
                                        <FamilyList current={current} onNavigate={() => setOpen(false)} stack className="mt-2" />
                                    </details>
                                ) : null}
                                {headerSignIn || headerCta || account ? (
                                    // From 480px the bar holds the account's block, so its foot has nothing left to hold.
                                    <div className={cn('mt-auto flex flex-col gap-2 border-t border-border pt-4 empty:hidden', account && 'min-[480px]:hidden')}>
                                        {headerSignIn ? (
                                            <a href={headerSignIn.href} className={PHONE_ROW} onClick={() => setOpen(false)}>
                                                {headerSignIn.label}
                                            </a>
                                        ) : null}
                                        {/* Signed out, the way in; signed in, nothing: the trigger stays in the bar. */}
                                        {account ? <AccountSlotContext.Provider value={slot('sheet')}>{account}</AccountSlotContext.Provider> : null}
                                        {headerCta ? (
                                            <Button asChild size="lg" className="w-full justify-between">
                                                {headerCta.pending ? (
                                                    <span data-oca-cta="pending" aria-hidden>
                                                        <CtaLabel label={headerCta.label} reserve={headerCta.reserve} hidden />
                                                        <span className="invisible">
                                                            <CtaPlus />
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <a data-oca-cta="" href={headerCta.href} onClick={() => setOpen(false)}>
                                                        <CtaLabel label={headerCta.label} reserve={headerCta.reserve} />
                                                        <CtaPlus />
                                                    </a>
                                                )}
                                            </Button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </SheetContent>
                        </Sheet>
                    ) : null}
                    {account ? <AccountSlotContext.Provider value={slot('bar')}>{account}</AccountSlotContext.Provider> : null}
                    {headerCta ? (
                        headerCta.pending ? (
                            // The session check is running: the block holds its place, says nothing, takes no focus.
                            <span data-oca-cta="pending" aria-hidden className={cn(CTA_BLOCK, 'max-[479px]:hidden')}>
                                <CtaLabel label={headerCta.label} reserve={headerCta.reserve} hidden />
                                <span className="invisible">
                                    <CtaPlus />
                                </span>
                            </span>
                        ) : (
                            <a
                                data-oca-cta=""
                                href={headerCta.href}
                                className={cn(
                                    CTA_BLOCK,
                                    // Below 480px the bar keeps the brand, the actions and the menu: the CTA
                                    // is the menu's full-width button there, so nothing overlaps.
                                    'max-[479px]:hidden',
                                    CTA_LINK
                                )}
                            >
                                <CtaLabel label={headerCta.label} reserve={headerCta.reserve} />
                                <CtaPlus />
                            </a>
                        )
                    ) : null}
                </div>
            </div>
        </header>
    );
}

/** A row in the phone's menu; the page you are on carries the ember square. */
const PHONE_ROW = cn(
    'flex items-center rounded-none px-3 py-2.5 text-[1.0625rem]',
    "aria-[current=page]:before:mr-3 aria-[current=page]:before:inline-block aria-[current=page]:before:size-[7px] aria-[current=page]:before:shrink-0 aria-[current=page]:before:bg-oca-accent-display aria-[current=page]:before:content-['']"
);

/** The first thing a keyboard reaches: a way past the header to the page. */
export function SkipLink({ href = '#main-content', children = 'Skip to content' }: { href?: string; children?: ReactNode }) {
    return (
        <a
            href={href}
            // Focus moves to the target itself, by hand: a page that handles its own hash (Swagger UI) never lets the browser do it.
            onClick={() => {
                const to = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
                if (!to) return;
                if (!to.hasAttribute('tabindex')) to.setAttribute('tabindex', '-1');
                to.focus({ preventScroll: true });
            }}
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-none focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-[0.9375rem] focus:font-medium focus:text-foreground focus:shadow-md"
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
            <div className="oca-container flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 pointer-coarse:py-3">
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
                {action ? <div className={cn('shrink-0 font-medium', HIT_LINKS, tone !== 'neutral' && 'max-sm:pl-[1.125rem]')}>{action}</div> : null}
            </div>
        </div>
    );
}

/**
 * A link in the legal row or a tool's protocol row, lines of inline text links: 44px to a thumb on
 * any screen, a tablet's included, in both axes (a short word, "Terms", was 41px wide), and WCAG
 * 2.5.8's 24px to a mouse. The pointer decides, not the width; the label stays centred in its box.
 * Positioned to a thumb, so a link keeps its bottom edge where the year's line starts flush under it.
 */
const FOOT_LINK = 'inline-flex min-h-6 items-center justify-center transition-colors hover:text-foreground pointer-coarse:relative pointer-coarse:min-h-11 pointer-coarse:min-w-11';

function LegalRow({ links }: { links: readonly NavItem[] }) {
    return (
        // To a thumb each link is a 44px target with room under its text: the year needs no gap of its own.
        <div className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:items-center sm:justify-between pointer-coarse:gap-y-0">
            <nav aria-label="Legal">
                <ul className="flex flex-wrap gap-x-4 md:gap-x-5">
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
            <p>© {new Date().getFullYear()} orangecheck</p>
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
    /** The giant lowercase wordmark closing the page; its letters rise centre-out the first time it is seen. */
    signature?: boolean;
    className?: string;
}

/** The footer's deep ground (the oca-band-footer utility re-points the tokens) and the frame's width. */
const FOOTER_GROUND = 'oca-band-footer';
// The footer's content on the frame's axis: it has no rules of its own, so it counts the page's.
const FRAME_X = 'mx-auto w-full max-w-[var(--oca-frame-max)] px-[calc(var(--oca-frame-rule)+var(--oca-frame-gutter))]';


/**
 * The footer, in 2.0's register: the deep orange ground, a line of fine print,
 * columns of links, the family when it is on, the giant wordmark and the
 * legal row. Any number
 * of columns: the lockup shares their row up to five, then takes its own, and
 * up to seven columns share one row from 1280px (below, the rows are even).
 * Links are 44px tall on phones. A phone sees the whole footer in 600px, fine
 * print and meta included: six groups leave them about 110px, seven about 65px.
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
                            className="relative rounded-none text-foreground before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2"
                        >
                            <Lockup size={20} variant="flat" />
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
    // Rows as even as each width allows, at most 4 a row from md, 6 from lg and 7 from xl: seven
    // columns are one row at 1280, 4 + 3 below it, never 6 and a straggler. (auto-fit fills each
    // row greedily, which is the straggler again.)
    const even = (most: number) => `repeat(${n === 0 ? 1 : Math.ceil(n / Math.ceil(n / most))}, minmax(0, 1fr))`;
    const beside = `minmax(0, 1.3fr) repeat(${Math.max(1, n)}, minmax(0, 1fr))`;
    const grid = {
        '--oca-footer-md': even(4),
        '--oca-footer-lg': inline ? beside : even(6),
        '--oca-footer-xl': inline ? beside : even(7),
    } as CSSProperties;
    return (
        <footer className={cn(FOOTER_GROUND, className)}>
            <div
                style={grid}
                className={cn(FRAME_X, 'grid grid-cols-1 gap-y-6 pb-5 pt-5 md:grid-cols-[var(--oca-footer-md)] md:gap-x-6 md:gap-y-10 md:py-16 lg:grid-cols-[var(--oca-footer-lg)] xl:grid-cols-[var(--oca-footer-xl)]')}
            >
                <div className={cn('col-span-full flex flex-col gap-4', inline && 'lg:col-span-1')}>
                    {/* On a phone the signature below says the name; the lockup would say it twice. */}
                    <Lockup size={26} variant="flat" className={signature ? 'max-md:hidden' : undefined} />
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
                        <p className="oca-label mb-2">{col.heading}</p>
                        <div className="flex flex-col gap-1">
                            {col.links.map((l, j) => (
                                <NavLink key={`${j}:${l.label}`} item={l} className="-mx-3 flex min-h-11 items-center text-[0.9375rem]" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            {signature ? (
                <div aria-hidden className={cn(FRAME_X, 'select-none pb-1 md:pb-12')}>
                    {/* One word, Inter 400, lowercase, sized to fill the frame's content width: its natural
                        width is 5.14em at -0.055em tracking (the last letter untracked, so its box is its ink),
                        and 100cqi is the frame's content box. The letters rise from under the line, from the
                        seam between "orange" and "check" outward (motion.css); the clip leaves room for the g. */}
                    <Reveal className="overflow-hidden [container-type:inline-size]" style={{ '--oca-wordmark-mid': 5 } as CSSProperties}>
                        <div
                            data-oca-wordmark=""
                            className="flex whitespace-nowrap pb-[0.24em] text-[calc(100cqi/5.16)] font-normal leading-[0.82] tracking-[-0.055em] [font-family:var(--oc-font-display)] [&>span:last-child]:tracking-normal"
                        >
                            {[...'orangecheck'].map((ch, i) => (
                                <span key={i} className="inline-block" style={{ '--oca-letter': i } as CSSProperties}>
                                    {ch}
                                </span>
                            ))}
                        </div>
                    </Reveal>
                </div>
            ) : null}
            {legalLinks || meta ? (
                <div className={FRAME_X}>
                    {/* The rule spans the content, not the gutters. */}
                    <div className="flex flex-col gap-3 border-t border-border py-3 text-[0.875rem] text-muted-foreground md:py-6">
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
