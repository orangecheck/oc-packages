import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ToolItem } from '../components/tools';
import { protocolSite, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { HIT_LINK } from '../lib/hit';
import { InColumnContext } from '../lib/column';
import { DensityProvider } from '../lib/density';
import { SiteHomeContext } from '../lib/site-home';
import { StatusBadge } from '../primitives/status-badge';
import { SideNav, TabBar, tabsFor, ThemeToggle } from './app-shell';
import { SiteFooter, SiteHeader, SkipLink } from './site';

/* ── The column ──────────────────────────────────────────────────────── */

/**
 * The tools' one column: 72rem, centred, with a 16px gutter on a phone and
 * 32px from md, so every tool page's title starts at one x. `narrow` keeps a
 * form to 48rem from that same left edge rather than centring a narrower box.
 * ToolShell draws it for its pages; an app page that scrolls itself puts it
 * inside its own scroller.
 */
export function ToolColumn({
    measure = 'wide',
    className,
    children,
}: {
    measure?: 'wide' | 'narrow';
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn('px-4 pb-16 pt-8 md:px-8 md:pt-10', className)}>
            <div className="mx-auto w-full max-w-[72rem]">
                <InColumnContext.Provider value={true}>
                    {measure === 'narrow' ? <div className="max-w-[48rem]">{children}</div> : children}
                </InColumnContext.Provider>
            </div>
        </div>
    );
}

/* ── The shell ───────────────────────────────────────────────────────── */

export interface ToolShellProps {
    /** The protocol these tools serve. Its word, its page on ochk.io and its status come from the registry. */
    protocol: ProtocolSlug;
    /** create · verify · discover · playground, in the family's words; give each an icon for the phone's tab bar. */
    tools: readonly ToolItem[];
    /** Where the lockup and the protocol's word go. Default: the protocol's page on ochk.io. */
    home?: string;
    /** The account control: SessionAccount, or SessionAccountView. */
    account?: ReactNode;
    /** List the tools in a rail on the left from lg (a dashboard page), not in the header. */
    rail?: boolean;
    /** Under the tools in the rail: Docs, Spec. */
    railFooter?: ReactNode;
    /**
     * `tool`: pages that scroll, with a footer. `app`: the full window, no
     * footer, the page managing its own scroll (an inbox, a workspace).
     */
    variant?: 'tool' | 'app';
    /**
     * `wide` (default): the 72rem column. `narrow`: a form or a result, 48rem
     * from the same left edge, so the page's title starts where every other
     * tool page's does.
     */
    measure?: 'wide' | 'narrow';
    /** A SiteBanner above the header. */
    banner?: ReactNode;
    /** Replace the footer, or `false` for none. Default: the compact family footer. */
    footer?: ReactNode | false;
    children: ReactNode;
}

/**
 * The frame for a protocol's tools: a slim full-width header (orangecheck ·
 * stamp, linking the protocol's page on ochk.io; the family menu, the tools,
 * "About stamp", the status when it is not live, the account, the theme), the
 * page, and the compact family footer. Everything inside is set at compact density. On a phone the
 * tools move to a tab bar under the thumb when there are two to five, each
 * with an icon.
 */
export function ToolShell({
    protocol,
    tools,
    home,
    account,
    rail = false,
    railFooter,
    variant = 'tool',
    measure = 'wide',
    banner,
    footer,
    children,
}: ToolShellProps) {
    const p = protocolSite(protocol);
    const homeHref = home ?? p.pageHref;
    const app = variant === 'app';
    const tabs = app ? null : tabsFor([{ items: [...tools] }]);
    const about = (
        <a
            href={p.pageHref}
            // 39px drawn, 44 to a thumb.
            className={cn('inline-flex items-center gap-1 rounded-none px-3 py-2 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground', HIT_LINK)}
        >
            About {p.label}
            <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
    );
    // The way from a tool to its docs: in the header's line from md, in the phone's menu when the tools are tabs.
    const docs = { href: p.docsHref, label: 'Docs', external: true };
    return (
        <DensityProvider density="compact">
            <div
                className={cn(
                    'flex flex-col bg-background',
                    // An app frame contains what is positioned inside it (sr-only text deep in the page's own
                    // scroller would otherwise size the document), and clips without becoming a scroller.
                    app ? 'relative h-dvh overflow-clip' : 'min-h-dvh',
                    tabs && 'max-md:pb-[var(--oca-tabbar-h,calc(3.5rem_+_1px_+_env(safe-area-inset-bottom)))]'
                )}
            >
                <SkipLink />
                {banner}
                <SiteHeader
                    variant="tool"
                    home={homeHref}
                    product={p.label}
                    family={protocol}
                    nav={[...tools.map((t) => ({ href: t.href, label: t.label, active: t.active })), docs]}
                    navOnPhone={!tabs}
                    menu={
                        <div className="[&>a]:px-3 [&>a]:py-3 [&>a]:text-[1.0625rem]">
                            {about}
                            {tabs ? (
                                <a
                                    href={docs.href}
                                    className="inline-flex items-center gap-1 rounded-none text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Docs
                                    <ArrowUpRight aria-hidden className="size-3.5" />
                                </a>
                            ) : null}
                        </div>
                    }
                    // With a rail, the tools leave the header from lg.
                    className={cn(rail && 'lg:[&_nav[aria-label=Main]]:hidden')}
                    actions={
                        <>
                            <span className="hidden lg:contents">{about}</span>
                            {p.status !== 'live' ? <StatusBadge status={p.status} className="max-sm:hidden" /> : null}
                            <ThemeToggle className="max-sm:hidden" />
                        </>
                    }
                    account={account}
                />
                {/* At least a window tall, so the footer starts below the fold and late content moves nothing in view. */}
                <div className={cn('mx-auto flex w-full', app ? 'min-h-0 flex-1' : 'min-h-[calc(100dvh-3.5rem)] max-w-[90rem] flex-1')}>
                    {rail ? (
                        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex">
                            <SideNav groups={[{ label: 'Tools', items: tools.map(({ href, label, icon, active }) => ({ href, label, icon, active })) }]} />
                            {railFooter ? (
                                // Its links (Docs, the spec) are 33px to a mouse and 44 to a thumb.
                                <div className="mt-auto flex flex-col gap-0.5 px-3 text-[0.875rem] text-muted-foreground [&_a:hover]:text-foreground [&_a]:py-1.5 [&_a]:transition-colors pointer-coarse:[&_a]:flex pointer-coarse:[&_a]:min-h-11 pointer-coarse:[&_a]:items-center">
                                    {railFooter}
                                </div>
                            ) : null}
                        </aside>
                    ) : null}
                    {/* Focusable from script, so "Skip to content" puts focus on the page, not only the next Tab. */}
                    <main id="main-content" tabIndex={-1} className={cn('min-w-0 flex-1 outline-none', app && 'flex min-h-0 flex-col')}>
                        {/* An ErrorPage inside goes home to the protocol's page, as the lockup does. */}
                        <SiteHomeContext.Provider value={homeHref}>
                            {app ? children : <ToolColumn measure={measure}>{children}</ToolColumn>}
                        </SiteHomeContext.Provider>
                    </main>
                </div>
                {app || footer === false ? null : (footer ?? <SiteFooter compact family legal />)}
                {tabs ? <TabBar items={tabs} /> : null}
            </div>
        </DensityProvider>
    );
}
