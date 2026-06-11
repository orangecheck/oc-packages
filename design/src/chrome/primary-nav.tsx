"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * `<OcPrimaryNav>` — the centered link row in every family site's
 * `<LayoutHeader>`. Replaces the per-site bespoke `<nav>` blocks.
 *
 * **Responsive contract (one pattern, every site):**
 *
 *   - `md` and up: the links render inline, centered, as a compact mono
 *     uppercase row. Active item is `text-primary`; siblings are muted.
 *
 *   - below `md`: the inline row would crush on a phone (it used to scroll
 *     to a useless `DASH…` sliver), so it collapses to a single menu
 *     disclosure (☰) that drops a small popover listing the same links
 *     vertically. The popover is viewport-clamped and centered under the
 *     button. This is the ONE mobile-nav pattern shared family-wide — no
 *     per-site hamburger forks.
 *
 *   - Active-link affordance is text-only (no underline / bottom stripe) —
 *     kept deliberately restrained.
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

function ExternalGlyph() {
  return (
    <span aria-hidden className="text-muted-foreground/60 ml-1 text-[9px]">
      ↗
    </span>
  );
}

export function OcPrimaryNav({
  activePath,
  links,
  className,
}: OcPrimaryNavProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [activePath]);

  // Outside-click + Escape close (mobile menu only).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inlineClass = (active: boolean) =>
    "font-display shrink-0 px-2 py-1 sm:px-3 text-[11px] sm:text-[12px] font-semibold tracking-wider uppercase transition-colors " +
    (active ? "text-primary" : "text-muted-foreground hover:text-foreground");

  const rowClass = (active: boolean) =>
    "font-display flex items-center gap-2 px-3 py-2 text-[12px] font-semibold tracking-wider uppercase transition-colors " +
    (active ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent");

  function renderInline(link: OcPrimaryNavLink): ReactNode {
    const active = isActive(activePath, link);
    const inner = (
      <>
        {link.label}
        {link.external ? <ExternalGlyph /> : null}
      </>
    );
    return link.external ? (
      <a
        key={link.href}
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className={inlineClass(false)}
        data-oc-primary-nav-item=""
      >
        {inner}
      </a>
    ) : (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={inlineClass(active)}
        data-oc-primary-nav-item={active ? "active" : "sibling"}
      >
        {inner}
      </Link>
    );
  }

  function renderRow(link: OcPrimaryNavLink): ReactNode {
    const active = isActive(activePath, link);
    const inner = (
      <>
        <span className="text-muted-foreground" aria-hidden>
          →
        </span>
        <span className="flex-1">{link.label}</span>
        {link.external ? <ExternalGlyph /> : null}
      </>
    );
    return link.external ? (
      <a
        key={link.href}
        href={link.href}
        target="_blank"
        rel="noreferrer"
        role="menuitem"
        onClick={() => setOpen(false)}
        className={rowClass(false)}
        data-oc-primary-nav-item=""
      >
        {inner}
      </a>
    ) : (
      <Link
        key={link.href}
        href={link.href}
        role="menuitem"
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={rowClass(active)}
        data-oc-primary-nav-item={active ? "active" : "sibling"}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      className={"relative flex items-center justify-center " + (className ?? "")}
      data-oc-primary-nav=""
    >
      {/* md+ : inline centered row */}
      <nav
        aria-label="primary"
        className="hidden items-center gap-0.5 sm:gap-1 md:flex"
      >
        {links.map(renderInline)}
      </nav>

      {/* < md : single menu disclosure */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label="site navigation"
          className="border-input bg-background hover:bg-accent text-muted-foreground inline-flex size-8 items-center justify-center rounded-md border transition-colors"
          data-oc-primary-nav-toggle=""
        >
          {open ? (
            <X className="size-4" aria-hidden />
          ) : (
            <Menu className="size-4" aria-hidden />
          )}
        </button>

        {open && (
          <div
            id={menuId}
            role="menu"
            aria-label="primary"
            className="border-border bg-popover text-popover-foreground absolute top-[calc(100%+8px)] left-1/2 z-50 w-[min(15rem,calc(100vw-1rem))] -translate-x-1/2 border p-1 shadow-xl"
            data-oc-primary-nav-popover=""
          >
            <div className="text-muted-foreground/60 px-3 pt-2 pb-1 font-mono text-[10px] tracking-widest uppercase">
              § navigate
            </div>
            {links.map(renderRow)}
          </div>
        )}
      </div>
    </div>
  );
}
