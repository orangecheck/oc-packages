import type { ReactNode } from 'react';

import type { ToolItem } from '../components/tools';
import { protocolSite, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
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
 * The frame for a protocol's tools: the family's one header (orangecheck |
 * stamp, linking the protocol's page on ochk.io; the family menu, the tools,
 * Docs and "About stamp" from 1180px and in the menu below, the status when
 * it is not live, the account), the page in the frame, and the compact family
 * footer with the theme's switch.
 * Everything inside is set at compact density. On a phone the tools move to a
 * tab bar under the thumb when there are two to five, each with an icon.
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
    // After the tools, from 1180px where four tools leave them room: the docs, and the protocol's own page on ochk.io.
    const docs = { href: p.docsHref, label: 'Docs', external: true };
    const about = { href: p.pageHref, label: `About ${p.label}`, external: true };
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
                {/* The family's one bar: in the frame over a tool page, full width over an app. */}
                <SiteHeader
                    variant={app ? 'tool' : 'site'}
                    home={homeHref}
                    product={p.label}
                    family={protocol}
                    nav={tools.map((t) => ({ href: t.href, label: t.label, active: t.active }))}
                    navWide={[docs, about]}
                    // The menu holds every link the bar does, as ochk.app's: below md the tools are in the tab bar
                    // too, and from md to 900px, where the tab bar is gone, only here; Docs and About to 1179px.
                    // With a rail, the tools leave the header from lg.
                    className={cn(rail && 'lg:[&_nav[aria-label=Main]]:hidden')}
                    actions={p.status !== 'live' ? <StatusBadge status={p.status} className="max-sm:hidden" /> : undefined}
                    account={account}
                />
                {/* At least a window tall, so the footer starts below the fold and late content moves nothing in view. */}
                <div
                    className={cn(
                        'mx-auto flex w-full',
                        app
                            ? 'min-h-0 flex-1'
                            : // In the frame, its rules under the header's; the header is 56px and 68 from 900, each with its hairline.
                              'min-h-[calc(100dvh-3.5rem-1px)] max-w-[var(--oca-frame-max)] flex-1 border-x-[length:var(--oca-frame-rule)] border-border min-[900px]:min-h-[calc(100dvh-4.25rem-1px)]'
                    )}
                >
                    {rail ? (
                        <aside className="sticky top-[calc(4.25rem+1px)] hidden h-[calc(100dvh-4.25rem-1px)] w-60 shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex">
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
                {/* The theme's switch is in the footer, and in the account menu, not in the bar. */}
                {app || footer === false ? null : (footer ?? <SiteFooter compact family legal meta={<ThemeToggle className="-mx-3 self-start sm:self-auto" />} />)}
                {tabs ? <TabBar items={tabs} /> : null}
            </div>
        </DensityProvider>
    );
}
