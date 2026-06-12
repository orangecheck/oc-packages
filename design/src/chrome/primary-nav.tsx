"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * `<OcPrimaryNav>` — the centered link row in every family site's
 * `<LayoutHeader>`. Replaces the per-site bespoke `<nav>` blocks.
 *
 * **Desktop-only.** The inline row shows at `md+`; below that it is hidden,
 * because on mobile the same links live in the account menu's `☰` drawer
 * (`OcAccountMenu`, rendered to the left of the identity chip) — one shared
 * mobile-nav pattern, no centered hamburger, no per-site fork.
 *
 * Active item is `text-primary`; siblings are muted. Active affordance is
 * text-only (no underline / bottom stripe) — deliberately restrained.
 *
 * **Usage:**
 *
 *   <OcPrimaryNav
 *       activePath={router.pathname}
 *       links={[
 *           { href: '/dashboard', label: 'dashboard' },
 *           { href: 'https://docs.ochk.io/attest', label: 'docs', external: true },
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
  /** Link set. Keep to 2–5 entries. */
  links: ReadonlyArray<OcPrimaryNavLink>;
  /** className for the outer container. */
  className?: string;
}

function isActive(pathname: string, link: OcPrimaryNavLink): boolean {
  if (link.external) return false;
  if (link.matchExact) return pathname === link.href;
  if (link.href === "/") return pathname === "/";
  return pathname === link.href || pathname.startsWith(link.href + "/");
}

export function OcPrimaryNav({
  activePath,
  links,
  className,
}: OcPrimaryNavProps) {
  return (
    <nav
      aria-label="primary"
      className={
        "hidden items-center gap-0.5 sm:gap-1 md:flex " + (className ?? "")
      }
      data-oc-primary-nav=""
    >
      {links.map((link) => {
        const active = isActive(activePath, link);
        const cls =
          "font-display shrink-0 px-2 py-1 sm:px-3 text-[11px] sm:text-[12px] font-semibold tracking-wider uppercase transition-colors " +
          (active
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground");
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
            className={cls}
            data-oc-primary-nav-item=""
          >
            {content}
          </a>
        ) : (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cls}
            data-oc-primary-nav-item={active ? "active" : "sibling"}
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
