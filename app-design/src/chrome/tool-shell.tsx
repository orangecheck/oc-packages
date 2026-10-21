import { ArrowUpRight, CircleUser, LogOut } from 'lucide-react';
import { useRouter } from 'next/compat/router';
import type { NextRouter } from 'next/router';
import { useSyncExternalStore, type ReactNode } from 'react';

import type { ToolItem } from '../components/tools';
import { GET_AN_ACCOUNT, protocolSite, SIGN_IN_LABEL, type ProtocolSlug } from '../family';
import { cn } from '../lib/cn';
import { InColumnContext } from '../lib/column';
import { DensityProvider } from '../lib/density';
import { SiteHomeContext } from '../lib/site-home';
import { Button } from '../primitives/button';
import { StatusBadge } from '../primitives/status-badge';
import { AccountMenu, SideNav, TabBar, tabsFor, ThemeToggle, type AccountMenuItem } from './app-shell';
import { SiteFooter, SiteHeader, SkipLink } from './site';

/* ── The account slot ────────────────────────────────────────────────── */

/** Where the session stands: being checked, signed in, signed out, or the check failed. */
export type SessionState = 'checking' | 'in' | 'out' | 'unknown';

export const OCHK_APP_ACCOUNT = 'https://ochk.app/me/account';

/** Back and forward; a router move re-renders the page, which reads the address again. */
function onHistory(change: () => void) {
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
}

/** The page's path and query, never the fragment. Anything the URL parser would read as another host returns home. */
function herePath(): string {
    const { href, origin, pathname, search } = window.location;
    const path = pathname + search;
    return new URL(path, href).origin === origin ? path : '/';
}

/** The route the server renders, with the base path; none for a dynamic route, whose template is no address. */
function routePath(router: NextRouter | null): string | null {
    if (!router || router.pathname.includes('[')) return null;
    return router.basePath && router.pathname === '/' ? router.basePath : router.basePath + router.pathname;
}

/**
 * This site's sign-in page, set to return to the page the viewer is on:
 * `/signin?return_to=%2Fverify%3Fid%3D…`. The server renders the route
 * without its query, so hydration matches; the fragment is never read, so a
 * share link's secret stays off servers. Pass no path for none.
 */
export function useSignInHref(path?: string): string | undefined {
    const router = useRouter();
    const here = useSyncExternalStore(onHistory, herePath, () => routePath(router));
    if (!path) return undefined;
    return here ? `${path}?return_to=${encodeURIComponent(here)}` : path;
}

/**
 * The header's account control, for any session source: the account menu
 * when signed in, "Sign in" when not. While the check runs, the button holds
 * its place unseen, so the header never shifts and a signed-in person never
 * sees "Sign in" flash. A failed check offers the account page, which works
 * either way. SessionAccount (./session) drives it from auth-client.
 */
export function SessionAccountView({
    state,
    name,
    detail,
    items = [],
    signInHref,
    signInPath,
    signInLabel = SIGN_IN_LABEL,
    signInVariant,
    accountHref = OCHK_APP_ACCOUNT,
    onSignOut,
    nameFrom = 'lg',
}: {
    state: SessionState;
    /** The account's name, as it chose to be shown. */
    name?: string;
    /** A second line: a short address. */
    detail?: string;
    /** This site's own items, above "Your account". */
    items?: (AccountMenuItem | 'separator')[];
    /** Where "Sign in" goes, as given. */
    signInHref?: string;
    /** This site's sign-in page (`/signin`): "Sign in" returns to the page the viewer is on. */
    signInPath?: string;
    signInLabel?: string;
    /** The signed-out button's look. Default: primary for the account phrase (GET_AN_ACCOUNT), as AccountCta draws it; secondary for "Sign in". */
    signInVariant?: 'primary' | 'secondary';
    /** Where "Your account" goes: ochk.app. */
    accountHref?: string;
    onSignOut?: () => void;
    nameFrom?: 'sm' | 'lg';
}) {
    const inPlace = useSignInHref(signInPath);
    if (state === 'in') {
        return (
            <AccountMenu
                name={name || 'Your account'}
                detail={detail}
                nameFrom={nameFrom}
                items={[
                    ...items,
                    ...(items.length > 0 ? (['separator'] as const) : []),
                    { label: 'Your account', href: accountHref, icon: <CircleUser /> },
                    'separator',
                    { label: 'Sign out', onSelect: onSignOut, icon: <LogOut /> },
                ]}
            />
        );
    }
    if (state === 'unknown') {
        return (
            <Button asChild size="sm" variant="secondary">
                <a href={accountHref}>Your account</a>
            </Button>
        );
    }
    return (
        // No box of its own: it sits exactly where the signed-in chip will. While checking it is only unseen.
        <span className={state === 'checking' ? 'contents invisible' : 'contents'} aria-hidden={state === 'checking' || undefined}>
            <Button
                asChild
                size="sm"
                variant={signInVariant ?? (signInLabel === GET_AN_ACCOUNT.label ? 'primary' : 'secondary')}
                tabIndex={state === 'checking' ? -1 : undefined}
            >
                <a href={signInHref ?? inPlace ?? 'https://ochk.io/signin'}>{signInLabel}</a>
            </Button>
        </span>
    );
}

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
            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground"
        >
            About {p.label}
            <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
    );
    return (
        <DensityProvider density="compact">
            <div
                className={cn(
                    'flex flex-col bg-background',
                    // An app frame contains what is positioned inside it (sr-only text deep in the page's own
                    // scroller would otherwise size the document), and clips without becoming a scroller.
                    app ? 'relative h-dvh overflow-clip' : 'min-h-dvh',
                    tabs && 'max-md:pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]'
                )}
            >
                <SkipLink />
                {banner}
                <SiteHeader
                    variant="tool"
                    home={homeHref}
                    product={p.label}
                    family={protocol}
                    nav={tools.map((t) => ({ href: t.href, label: t.label, active: t.active }))}
                    navOnPhone={!tabs}
                    menu={<div className="[&>a]:px-3 [&>a]:py-3 [&>a]:text-[1.0625rem]">{about}</div>}
                    // With a rail, the tools leave the header from lg.
                    className={cn(rail && 'lg:[&_nav[aria-label=Main]]:hidden')}
                    actions={
                        <>
                            <span className="hidden lg:contents">{about}</span>
                            {p.status !== 'live' ? <StatusBadge status={p.status} className="max-sm:hidden" /> : null}
                            <ThemeToggle className="max-sm:hidden" />
                            {account}
                        </>
                    }
                />
                <div className={cn('mx-auto flex w-full', app ? 'min-h-0 flex-1' : 'max-w-[90rem] flex-1')}>
                    {rail ? (
                        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-6 overflow-y-auto px-4 py-6 lg:flex">
                            <SideNav groups={[{ label: 'Tools', items: tools.map(({ href, label, icon, active }) => ({ href, label, icon, active })) }]} />
                            {railFooter ? (
                                <div className="mt-auto flex flex-col gap-0.5 px-3 text-[0.875rem] text-muted-foreground [&_a:hover]:text-foreground [&_a]:py-1.5 [&_a]:transition-colors">
                                    {railFooter}
                                </div>
                            ) : null}
                        </aside>
                    ) : null}
                    <main id="main-content" className={cn('min-w-0 flex-1', app && 'flex min-h-0 flex-col')}>
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
