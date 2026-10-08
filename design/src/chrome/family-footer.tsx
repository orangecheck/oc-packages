import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../tokens/cn";
import { FAMILY_PROPERTIES, type FamilyCategory } from "./family-properties";

export interface FooterLink {
  href: string;
  label: string;
  /** Render as a cross-origin `<a target="_blank">` with a ↗ affordance. */
  external?: boolean;
}

export interface FooterColumn {
  /** Column heading, e.g. `'§ docs'`. */
  label: string;
  links: FooterLink[];
}

export interface OcFamilyFooterBrand {
  /** The site's own logo mark (e.g. `<LogoMark size={20} />`). Optional. */
  mark?: ReactNode;
  /** Wordmark, e.g. `'oc·stamp'`. */
  wordmark: ReactNode;
  /** One-paragraph blurb under the wordmark (may contain links). */
  tagline: ReactNode;
  /**
   * Optional license / attribution lines under the blurb. Links here and in the
   * tagline get 44px tap targets on phones, and opacity-dimmed muted text is
   * floored at the full muted tone, so neither can fall under AA.
   */
  meta?: ReactNode;
}

export interface OcFamilyFooterProps {
  brand: OcFamilyFooterBrand;
  /** The site's own `§`-labelled link groups. */
  columns?: FooterColumn[];
  /**
   * Append registry-driven family columns (products / protocols) sourced from
   * `FAMILY_PROPERTIES`, so any footer that lists the family can never drift
   * from the canonical table. `'products'` is the five live products, etc.
   */
  family?: "products" | "protocols" | "both";
  /** Origin the legal-bar links resolve against. Defaults to ochk.io. */
  legalBase?: string;
  /** Override the left copyright line. Defaults to the canonical OC line. */
  legalCopyright?: ReactNode;
  /**
   * Override the centre legal links. Defaults to privacy / terms / security /
   * trademarks / contact (resolved against `legalBase`). Pass your own when a
   * site needs an extra link (e.g. a federation charter) or a shorter set.
   */
  legalLinks?: FooterLink[];
  /** Override the right-hand bitcoin tag (e.g. `'read on bitcoin'`). */
  builtWith?: ReactNode;
  className?: string;
}

// brand block + N content columns in one grid, mirroring the historical
// per-site layout (`[1.2fr 1fr 1fr …]`). Keyed by content-column count so the
// brand block keeps its wider share at every width.
const GRID: Record<number, string> = {
  1: "md:grid-cols-[1.2fr_1fr]",
  2: "md:grid-cols-[1.2fr_1fr_1fr]",
  3: "md:grid-cols-[1.2fr_1fr_1fr_1fr]",
  4: "md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]",
  5: "md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr]",
};

// min-h-11 on phones is the 44px tap target; md restores the dense desktop list.
const LINK_CLS =
  "text-muted-foreground hover:text-foreground inline-flex min-h-11 min-w-11 items-center font-mono text-xs tracking-wide lowercase transition-colors md:min-h-0 md:min-w-0";

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noreferrer" className={LINK_CLS}>
        {"> "}
        {link.label} ↗
      </a>
    );
  }
  return (
    <Link href={link.href} className={LINK_CLS}>
      {"> "}
      {link.label}
    </Link>
  );
}

function FooterColumnView({ column }: { column: FooterColumn }) {
  return (
    <div className="hidden sm:block">
      <div className="label-mono text-primary mb-3">{column.label}</div>
      <ul className="md:space-y-2">
        {column.links.map((link) => (
          <li key={`${column.label}:${link.href}`}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Phones get each group as a disclosure with its links two to a row. One 44px row
// per link in one column ran the footer to 1,100-1,260px, longer than many pages.
function FooterColumnDisclosure({ column }: { column: FooterColumn }) {
  return (
    <details className="group border-b">
      <summary className="label-mono text-primary flex min-h-11 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        {column.label}
        <ChevronDown
          aria-hidden
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <ul className="grid grid-cols-2 gap-x-4 pb-2">
        {column.links.map((link) => (
          <li key={`${column.label}:${link.href}`} className="min-w-0">
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function familyColumn(category: FamilyCategory, label: string): FooterColumn {
  return {
    label,
    links: FAMILY_PROPERTIES.filter((p) => p.category === category).map(
      (p) => ({
        href: p.origin,
        label: p.label,
        external: true,
      }),
    ),
  };
}

/**
 * `<OcFamilyFooter>` — the one canonical family footer. Brand block on the
 * left, `§`-labelled link columns to the right, a single legal bar beneath.
 * Every `oc-*` site composes this with its own `brand` + `columns`; pass
 * `family` to surface the registry-driven product / protocol columns so any
 * footer listing the family always shows the full, current set.
 */
export function OcFamilyFooter({
  brand,
  columns = [],
  family,
  legalBase = "https://ochk.io",
  legalCopyright,
  legalLinks,
  builtWith,
  className,
}: OcFamilyFooterProps) {
  const familyCols: FooterColumn[] = [];
  if (family === "products" || family === "both") {
    familyCols.push(familyColumn("product", "§ products"));
  }
  if (family === "protocols" || family === "both") {
    familyCols.push(familyColumn("protocol", "§ protocols"));
  }

  const allColumns = [...familyCols, ...columns];
  const grid = GRID[allColumns.length] ?? GRID[3];
  const year = new Date().getFullYear();
  const legal = (path: string) => `${legalBase}${path}`;
  const links: FooterLink[] = legalLinks ?? [
    { href: legal("/privacy"), label: "privacy" },
    { href: legal("/terms"), label: "terms" },
    { href: legal("/security"), label: "security" },
    { href: legal("/trademark"), label: "trademarks" },
    { href: legal("/contact"), label: "contact" },
  ];

  return (
    <footer className={cn("border-t", className)}>
      <div className="container py-8 sm:py-12 md:py-16">
        <div className={cn("grid gap-6 sm:grid-cols-2 sm:gap-10", grid)}>
          <div className="oc-footer-brand">
            <div className="flex items-center gap-2">
              {brand.mark}
              <span className="font-display text-sm font-bold tracking-tight">
                {brand.wordmark}
              </span>
            </div>
            <div className="text-muted-foreground mt-3 max-w-[34ch] text-sm leading-relaxed">
              {brand.tagline}
            </div>
            {brand.meta && <div className="mt-4">{brand.meta}</div>}
          </div>
          {allColumns.length > 0 && (
            <div className="border-t sm:hidden">
              {allColumns.map((column) => (
                <FooterColumnDisclosure key={column.label} column={column} />
              ))}
            </div>
          )}
          {allColumns.map((column) => (
            <FooterColumnView key={column.label} column={column} />
          ))}
        </div>

        {/* On a phone the last disclosure's rule already divides the legal bar. */}
        <div
          className={cn(
            "flex flex-col items-start justify-between gap-3 font-mono text-[11px] tracking-widest uppercase sm:mt-10 sm:flex-row sm:items-center sm:border-t sm:pt-6",
            allColumns.length > 0 ? "mt-4" : "mt-8 border-t pt-6",
          )}
        >
          <span className="text-muted-foreground">
            {legalCopyright ?? <>© {year} orangecheck · mit + cc-by-4.0</>}
          </span>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 md:gap-y-1">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="hover:text-foreground inline-flex min-h-11 items-center transition-colors md:min-h-0"
              >
                {link.label}
              </a>
            ))}
          </div>
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <span className="text-primary text-[13px] leading-none">₿</span>
            <span>{builtWith ?? "built with bitcoin"}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
