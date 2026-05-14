'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * `<OcPrimaryNav>` — the centered link row in every family site's
 * `<LayoutHeader>`. Replaces the per-site bespoke `<nav>` blocks.
 *
 * **Design goals:**
 *
 *   - Visible at every viewport width — no `hidden md:flex` cutoff.
 *     Three short links (`dashboard · docs · spec`) fit on a 320px
 *     phone in compact mono uppercase. Hamburger drawer stays
 *     reserved for tertiary content (about / contact / etc.).
 *
 *   - Active-link affordance is identical to the prior bespoke pattern
 *     (primary-coloured text + 1px underline accent), so visitors who
 *     learned the old nav keep their muscle memory.
 *
 *   - Horizontal-scroll fallback. If a site adds a fourth link or runs
 *     a very long label, the row scrolls instead of wrapping or
 *     overflowing — `overflow-x-auto` + `whitespace-nowrap` + a thin
 *     gradient mask via `mask-image` so the truncation reads as
 *     intentional.
 *
 * **Usage:**
 *
 *   <OcPrimaryNav
 *       activePath={router.pathname}
 *       links={[
 *           { href: '/dashboard', label: 'dashboard' },
 *           { href: 'https://docs.ochk.io/attest', label: 'docs', external: true },
 *           { href: 'https://github.com/orangecheck/oc-attest-protocol/blob/main/SPEC.md', label: 'spec', external: true },
 *       ]}
 *   />
 */

export interface OcPrimaryNavLink {
    /** Same-origin path or absolute URL. */
    href: string;
    /** Visible label · lowercase preferred (the chip styling applies tracking + uppercase). */
    label: string;
    /** When true, opens in a new tab and skips the `isActive` check. */
    external?: boolean;
    /** Optional override for the active-match. By default the link is
     *  active when `activePath === href` or `activePath.startsWith(href + '/')`. */
    matchExact?: boolean;
}

export interface OcPrimaryNavProps {
    /** Current router pathname for active-link highlight. */
    activePath: string;
    /** Link set. Keep to 2–4 entries — beyond that, mobile starts to
     *  feel cramped even with horizontal scroll. */
    links: ReadonlyArray<OcPrimaryNavLink>;
    /** className for the outer container. */
    className?: string;
}

function isActive(pathname: string, link: OcPrimaryNavLink): boolean {
    if (link.external) return false;
    if (link.matchExact) return pathname === link.href;
    if (link.href === '/') return pathname === '/';
    return pathname === link.href || pathname.startsWith(link.href + '/');
}

export function OcPrimaryNav({ activePath, links, className }: OcPrimaryNavProps) {
    return (
        <nav
            aria-label="primary"
            className={
                'flex min-w-0 items-center justify-start overflow-x-auto gap-0.5 sm:gap-1 ' +
                'whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
                (className ?? '')
            }
            data-oc-primary-nav=""
        >
            {links.map((link) => {
                const active = isActive(activePath, link);
                const className =
                    'font-display relative shrink-0 px-2 py-1 sm:px-3 text-[11px] sm:text-[12px] font-semibold tracking-wider uppercase transition-colors ' +
                    (active
                        ? 'text-primary after:bg-primary after:absolute after:inset-x-2 after:-bottom-[13px] after:h-px after:content-[""]'
                        : 'text-muted-foreground hover:text-foreground');
                const content: ReactNode = (
                    <>
                        {link.label}
                        {link.external ? (
                            <span
                                aria-hidden
                                className="text-muted-foreground/60 ml-1 text-[9px]"
                            >
                                ↗
                            </span>
                        ) : null}
                    </>
                );
                return link.external ? (
                    <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className={className}
                        data-oc-primary-nav-item=""
                    >
                        {content}
                    </a>
                ) : (
                    <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? 'page' : undefined}
                        className={className}
                        data-oc-primary-nav-item={active ? 'active' : 'sibling'}
                    >
                        {content}
                    </Link>
                );
            })}
        </nav>
    );
}
