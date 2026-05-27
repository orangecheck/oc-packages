'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * `<OcDashboardShell>` — the canonical demo-app frame for protocol
 * sites. Mirrors the `MeShell` pattern from `me.ochk.io`: persistent
 * left-rail tools on desktop, off-canvas drawer on mobile, page
 * eyebrow + title + description above the children.
 *
 * Drives the unified "dashboard pattern" the family rolled out
 * 2026-05-14: every protocol site's `/dashboard` (and the demo pages
 * underneath — `/create`, `/verify`, `/discover`, `/playground`, etc.)
 * wraps in this shell, so visitors crossing protocols experience the
 * same chrome.
 *
 * Layout (desktop):
 *
 *   ┌─────────────┬────────────────────────────────────┐
 *   │ § dashboard │  eyebrow                           │
 *   │ ── tools ── │  title                             │
 *   │   create  ● │  description                       │
 *   │   verify    │                                    │
 *   │   discover  │  ── children ─────────────────────│
 *   │   ...       │                                    │
 *   └─────────────┴────────────────────────────────────┘
 *
 * Mobile (<md): sidebar collapses behind a hamburger button at the
 * top of the main column; tapping opens a full-width drawer.
 */

export interface OcDashboardTool {
    /** Stable identifier · used as `active` key. */
    id: string;
    /** Same-origin path the tool lives at. */
    href: string;
    /** Visible label · lowercase preferred. */
    label: string;
    /** Optional one-line tagline shown under the label in the rail and
     *  on the dashboard hub cards. */
    tagline?: string;
    /** Optional ascii / unicode glyph rendered before the label. */
    icon?: ReactNode;
    /** When true, opens in a new tab (e.g. an external explorer). */
    external?: boolean;
}

export interface OcDashboardShellProps {
    /**
     * Dashboard root path — the rail header links here ("§ dashboard").
     * Default `'/dashboard'`.
     */
    rootHref?: string;
    /**
     * Site display name shown in the rail header above the tools list
     * (e.g. `'oc·attest'`).
     */
    siteLabel?: ReactNode;
    /** Tools to surface in the left rail. */
    tools: ReadonlyArray<OcDashboardTool>;
    /**
     * Which tool is currently active — matched against each tool's
     * `id`. Pass `undefined` on the dashboard hub itself.
     */
    active?: string;
    /** Optional small mono label above the page title. */
    eyebrow?: ReactNode;
    /** Page title — rendered as h1. */
    title?: ReactNode;
    /** Page description — rendered as a paragraph below the title. */
    description?: ReactNode;
    /** Main column content. */
    children: ReactNode;
    /** className for the outer container. */
    className?: string;
}

export function OcDashboardShell({
    rootHref = '/dashboard',
    siteLabel,
    tools,
    active,
    eyebrow,
    title,
    description,
    children,
    className,
}: OcDashboardShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Close drawer on Escape, lock body scroll while open.
    useEffect(() => {
        if (!drawerOpen) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setDrawerOpen(false);
        }
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [drawerOpen]);

    const hasHeader = Boolean(title) || Boolean(eyebrow);

    return (
        <div
            className={'container ' + (className ?? '')}
            data-oc-dashboard-shell=""
        >
            <div className="flex min-h-[calc(100vh-3rem)] flex-col md:flex-row md:gap-8">
                {/* Desktop sidebar */}
                <Sidebar
                    rootHref={rootHref}
                    siteLabel={siteLabel}
                    tools={tools}
                    active={active}
                    variant="desktop"
                />

                {/* Main column */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* Mobile bar — hamburger + crumb */}
                    <div className="border-border flex items-center justify-between border-b py-3 md:hidden">
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(true)}
                            className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-2 px-1 font-mono text-[11px] tracking-widest uppercase transition-colors"
                            aria-label="open dashboard tools"
                            aria-expanded={drawerOpen}
                            data-oc-dashboard-mobile-trigger=""
                        >
                            <span className="text-[14px] leading-none">≡</span>
                            <span>tools</span>
                        </button>
                        <Link
                            href={rootHref}
                            className="text-primary font-mono text-[11px] tracking-widest uppercase"
                        >
                            § dashboard
                        </Link>
                    </div>

                    <div className="pt-6 md:pt-3">
                        {hasHeader && (
                            <div className="max-w-3xl">
                                {eyebrow ? (
                                    <div className="label-mono text-primary mb-3 font-mono text-[10px] tracking-widest uppercase">
                                        {eyebrow}
                                    </div>
                                ) : null}
                                {title ? (
                                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                                        {title}
                                    </h1>
                                ) : null}
                                {description ? (
                                    <p className="text-muted-foreground mt-3 max-w-[64ch] text-sm leading-relaxed">
                                        {description}
                                    </p>
                                ) : null}
                            </div>
                        )}
                        <div className={hasHeader ? 'mt-8 pb-12' : 'pb-12'}>{children}</div>
                    </div>
                </div>
            </div>

            {/* Mobile drawer */}
            {drawerOpen ? (
                <div
                    className="fixed inset-0 z-50 md:hidden"
                    role="dialog"
                    aria-modal="true"
                    aria-label="dashboard tools"
                    data-oc-dashboard-drawer=""
                >
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        onClick={() => setDrawerOpen(false)}
                        aria-hidden
                    />
                    <div className="bg-background absolute top-0 left-0 h-full w-[85vw] max-w-sm border-r shadow-xl">
                        <Sidebar
                            rootHref={rootHref}
                            siteLabel={siteLabel}
                            tools={tools}
                            active={active}
                            variant="drawer"
                            onClose={() => setDrawerOpen(false)}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Sidebar({
    rootHref,
    siteLabel,
    tools,
    active,
    variant,
    onClose,
}: {
    rootHref: string;
    siteLabel?: ReactNode;
    tools: ReadonlyArray<OcDashboardTool>;
    active?: string;
    variant: 'desktop' | 'drawer';
    onClose?: () => void;
}) {
    const isDrawer = variant === 'drawer';
    return (
        <aside
            className={
                isDrawer
                    ? 'flex h-full w-full flex-col bg-card'
                    : 'hidden md:sticky md:top-4 md:flex md:h-[calc(100vh-2rem)] md:w-56 md:shrink-0 md:flex-col md:self-start md:overflow-y-auto md:rounded md:border md:bg-card/40 lg:w-60'
            }
            aria-label="dashboard tools"
            data-oc-dashboard-sidebar={variant}
        >
            {/* identity strip */}
            <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between">
                    <Link
                        href={rootHref}
                        onClick={onClose}
                        className="hover:text-foreground font-display text-sm font-bold tracking-tight"
                    >
                        § dashboard
                    </Link>
                    {isDrawer ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground -mr-2 inline-flex h-8 w-8 items-center justify-center rounded font-mono text-lg"
                            aria-label="close navigation"
                        >
                            ×
                        </button>
                    ) : null}
                </div>
                {siteLabel ? (
                    <div className="text-muted-foreground/70 mt-1 font-mono text-[10px] tracking-widest uppercase">
                        {siteLabel}
                    </div>
                ) : null}
            </div>

            <nav className="flex-1 overflow-y-auto px-2 py-3">
                <div className="text-muted-foreground/60 mb-1 px-3 font-mono text-[10px] tracking-widest uppercase">
                    § tools
                </div>
                <ul className="space-y-0.5">
                    {tools.map((tool) => {
                        const isActive = tool.id === active;
                        const innerCls =
                            'flex items-baseline gap-2 rounded px-3 py-1.5 text-[12.5px] transition-colors ' +
                            (isActive
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30');
                        const content = (
                            <>
                                {tool.icon ? (
                                    <span
                                        className={
                                            'shrink-0 font-mono text-[11px] ' +
                                            (isActive ? 'text-primary' : 'text-muted-foreground/70')
                                        }
                                        aria-hidden
                                    >
                                        {tool.icon}
                                    </span>
                                ) : null}
                                <span className="flex-1 leading-tight">
                                    <span>{tool.label}</span>
                                    {tool.tagline ? (
                                        <span className="text-muted-foreground/60 mt-0.5 block font-mono text-[10px] tracking-wide normal-case">
                                            {tool.tagline}
                                        </span>
                                    ) : null}
                                </span>
                                {tool.external ? (
                                    <span
                                        className="text-muted-foreground/60 text-[10px]"
                                        aria-hidden
                                    >
                                        ↗
                                    </span>
                                ) : null}
                            </>
                        );
                        return (
                            <li key={tool.id}>
                                {tool.external ? (
                                    <a
                                        href={tool.href}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={onClose}
                                        className={innerCls}
                                        data-oc-dashboard-tool={isActive ? 'active' : 'sibling'}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <Link
                                        href={tool.href}
                                        onClick={onClose}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={innerCls}
                                        data-oc-dashboard-tool={isActive ? 'active' : 'sibling'}
                                    >
                                        {content}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </nav>
        </aside>
    );
}

/**
 * Convenience: the dashboard hub-page grid. Renders the same set of
 * tools as the sidebar, but as bigger card-style entries — used as
 * the body of `/dashboard/index.tsx` on each protocol site.
 */
export interface OcDashboardHubProps {
    tools: ReadonlyArray<OcDashboardTool>;
    className?: string;
}

export function OcDashboardHub({ tools, className }: OcDashboardHubProps) {
    return (
        <ul
            className={
                'grid gap-px border-t border-l sm:grid-cols-2 ' + (className ?? '')
            }
            data-oc-dashboard-hub=""
        >
            {tools.map((tool) => {
                const content = (
                    <span className="flex h-full flex-col gap-3 p-5 transition-colors">
                        <span className="flex items-baseline gap-3">
                            {tool.icon ? (
                                <span
                                    className="text-primary font-mono text-[13px]"
                                    aria-hidden
                                >
                                    {tool.icon}
                                </span>
                            ) : null}
                            <span className="font-display text-foreground text-base font-bold tracking-tight">
                                {tool.label}
                            </span>
                            {tool.external ? (
                                <span
                                    className="text-muted-foreground/60 ml-auto text-xs"
                                    aria-hidden
                                >
                                    ↗
                                </span>
                            ) : (
                                <span
                                    className="text-muted-foreground/60 ml-auto text-xs"
                                    aria-hidden
                                >
                                    →
                                </span>
                            )}
                        </span>
                        {tool.tagline ? (
                            <span className="text-muted-foreground text-sm leading-relaxed">
                                {tool.tagline}
                            </span>
                        ) : null}
                    </span>
                );
                const cls = 'hover:bg-muted/30 group block border-r border-b transition-colors';
                return (
                    <li key={tool.id}>
                        {tool.external ? (
                            <a
                                href={tool.href}
                                target="_blank"
                                rel="noreferrer"
                                className={cls}
                            >
                                {content}
                            </a>
                        ) : (
                            <Link href={tool.href} className={cls}>
                                {content}
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
