'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useOcSession } from '@orangecheck/auth-client';

import type { EcosystemSlug } from './ecosystem-switcher';
import { findFamilyProperty, type SiteState } from './family-properties';

/**
 * `<OcAccountMenu>` — the canonical top-right account affordance for
 * every family site. Replaces the older inline-styled `OcAccountChip`
 * from `@orangecheck/auth-client` with a Tailwind-styled, fully
 * configurable, cross-site-aware dropdown.
 *
 * Three explicit visual states:
 *
 *   1. **Pre-hydration / loading** — neutral `sign in` placeholder so
 *      the header never goes blank on first paint.
 *   2. **Anonymous / error** — primary-styled `sign in` CTA pointing
 *      at the site's local `/signin` (or whatever `signInUrl` you
 *      pass).
 *   3. **Authenticated** — pill with a primary-tinted signal dot and
 *      shortened did_oc (or display name if set); click → popover
 *      with full address, optional site-specific menu items, family
 *      dashboard link, sign-out, and an optional BuildFooter showing
 *      site name + version + commit sha → GitHub.
 *
 * Cross-site recognition: the component re-fetches the session on
 * `visibilitychange` and `focus` events, so when a user signs in at a
 * sibling site (ochk.io, attest.ochk.io, etc.) and tabs back, the
 * chip flips from "sign in" to "signed in" without a hard reload.
 *
 * The component reads `useOcSession()` from `@orangecheck/auth-client`,
 * so the consuming app must mount `<OcSessionProvider>` somewhere in
 * its tree (already standard in every consumer's `_app.tsx`).
 */

export interface OcAccountMenuItem {
    /** Same-origin path or absolute URL. */
    href: string;
    /** Visible label. */
    label: string;
    /**
     * When `true`, opens in a new tab and renders a ↗ glyph after the
     * label. Use for cross-domain links (e.g. `https://ochk.io/dashboard`).
     */
    external?: boolean;
}

export interface OcAccountMenuBuildInfo {
    /** Display version string, e.g. `'0.5.0'` (rendered as `v0.5.0`). */
    version: string;
    /**
     * 7+ character commit SHA. Render as `'dev'` (or omit) for local
     * dev to suppress the GitHub link.
     */
    sha?: string;
    /**
     * GitHub `owner/repo` slug — combined with `sha` to produce the
     * `https://github.com/<repo>/commit/<sha>` link.
     */
    repo?: string;
}

export interface OcAccountMenuProps {
    /**
     * Which family property this site IS. Used to label the section
     * header (`§ signed in · vault.ochk.io`) and to suppress the
     * family-dashboard menu item when the user is already on `home`.
     */
    current: EcosystemSlug;
    /**
     * Where the anonymous "sign in" affordance points. Default `'/signin'`
     * — works with every site's in-place `<OcSignIn>` page. Pass
     * `'https://ochk.io/signin'` if you want to bounce to the auth host
     * instead.
     */
    signInUrl?: string;
    /** Label for the anonymous "sign in" affordance. Default `'sign in'`. */
    signInLabel?: string;
    /**
     * Site-specific menu items, rendered between the section header
     * and the family-dashboard / sign-out rows. Keep this short —
     * 2–6 entries is the sweet spot. Pass `[]` (or omit) for sites
     * with no per-site routes worth surfacing.
     */
    menuItems?: ReadonlyArray<OcAccountMenuItem>;
    /**
     * When `true` (default), shows a `family dashboard ↗` link to
     * `https://ochk.io/dashboard`. Set `false` for `home` (already
     * there) or for sites that don't want it.
     */
    showFamilyDashboard?: boolean;
    /**
     * Optional BuildFooter info. When present, renders a tiny mono
     * footer at the bottom of the popover with `site · vX.Y.Z · sha`
     * — the SHA links to the matching GitHub commit when `repo` is
     * also provided. Drive this from your `next.config.ts` via
     * `NEXT_PUBLIC_APP_VERSION` / `NEXT_PUBLIC_BUILD_SHA` env vars.
     */
    build?: OcAccountMenuBuildInfo;
    /**
     * Optional lifecycle chip rendered inside the BuildFooter line
     * (between site and version). Mirrors the chip on the logo so
     * both surfaces agree.
     */
    siteState?: SiteState;
    /** className overrides for layout-level customisation. */
    className?: string;
    triggerClassName?: string;
    popoverClassName?: string;
}

function shortenDid(s: string): string {
    if (s.length <= 14) return s;
    return `${s.slice(0, 7)}…${s.slice(-5)}`;
}

export function OcAccountMenu({
    current,
    signInUrl = '/signin',
    signInLabel = 'sign in',
    menuItems,
    showFamilyDashboard,
    build,
    siteState,
    className,
    triggerClassName,
    popoverClassName,
}: OcAccountMenuProps) {
    const session = useOcSession();
    const { status, account, signOut, refresh } = session;
    const [hydrated, setHydrated] = useState(false);
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    const property = findFamilyProperty(current);
    const hostname = property?.hostname ?? `${current}.ochk.io`;
    const isHome = current === 'home';
    const familyDashboardEnabled = showFamilyDashboard ?? !isHome;

    useEffect(() => setHydrated(true), []);

    // Cross-site sign-in pickup: re-fetch on visibility / focus.
    useEffect(() => {
        const onWake = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        const onFocus = () => void refresh();
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('focus', onFocus);
        };
    }, [refresh]);

    // Outside-click + Escape close.
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const signInTrigger = (
        <a
            href={signInUrl}
            aria-label={signInLabel}
            data-oc-account-menu-signin=""
            className={
                triggerClassName ??
                'border-input bg-background hover:bg-accent inline-flex h-8 items-center justify-center rounded-md border px-3 font-mono text-[11px] font-semibold tracking-widest uppercase transition-colors'
            }
        >
            {signInLabel}
        </a>
    );

    // States 1 + 2: pre-hydration or anonymous — render the same
    // placeholder/CTA so the slot is never empty.
    if (!hydrated || status === 'loading') {
        return signInTrigger;
    }

    if (status !== 'authenticated' || !account) {
        return signInTrigger;
    }

    // Authenticated — pill + popover.
    const displayName = account.displayName ?? null;
    const label = displayName ?? shortenDid(account.didOc);

    return (
        <div
            ref={wrapRef}
            className={'relative inline-block ' + (className ?? '')}
            data-oc-account-menu=""
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Signed in as ${account.didOc}. Open account menu.`}
                className={
                    triggerClassName ??
                    'border-primary/40 bg-card hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-md border px-3 font-mono text-[11px] tracking-wide transition-colors'
                }
                data-oc-account-menu-trigger=""
            >
                <span className="bg-primary inline-block size-1.5 rounded-full" aria-hidden />
                <span className="text-foreground">{label}</span>
                <svg
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    aria-hidden
                    className={
                        'opacity-60 transition-transform ' + (open ? 'rotate-180' : 'rotate-0')
                    }
                >
                    <path
                        d="M2 4 L5 7 L8 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                    />
                </svg>
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Account menu"
                    className={
                        popoverClassName ??
                        'border-border bg-popover text-popover-foreground absolute top-[calc(100%+6px)] right-0 z-50 w-[min(18rem,calc(100vw-1rem))] border shadow-xl'
                    }
                    data-oc-account-menu-popover=""
                >
                    <div className="border-border border-b p-3">
                        <div className="text-primary mb-1 font-mono text-[10px] tracking-widest uppercase">
                            § signed in · {hostname}
                        </div>
                        <div className="text-foreground/90 font-mono text-[11px] leading-tight break-all">
                            {account.didOc}
                        </div>
                        {displayName ? (
                            <div className="text-muted-foreground/80 mt-1 font-mono text-[10px] tracking-wide">
                                {displayName}
                            </div>
                        ) : null}
                    </div>

                    <div className="p-1">
                        {menuItems?.map((item) => {
                            const onClick = () => setOpen(false);
                            const cls =
                                'hover:bg-accent flex items-center gap-2 px-3 py-2 font-mono text-[11px] tracking-wide transition-colors';
                            const inner = (
                                <>
                                    <span className="text-muted-foreground" aria-hidden>
                                        →
                                    </span>
                                    <span className="flex-1">{item.label}</span>
                                    {item.external ? (
                                        <span
                                            className="text-muted-foreground/70 text-[10px]"
                                            aria-hidden
                                        >
                                            ↗
                                        </span>
                                    ) : null}
                                </>
                            );
                            return item.external ? (
                                <a
                                    key={item.href}
                                    href={item.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={onClick}
                                    role="menuitem"
                                    className={cls}
                                    data-oc-account-menu-item=""
                                >
                                    {inner}
                                </a>
                            ) : (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onClick}
                                    role="menuitem"
                                    className={cls}
                                    data-oc-account-menu-item=""
                                >
                                    {inner}
                                </Link>
                            );
                        })}

                        {familyDashboardEnabled ? (
                            <a
                                href="https://ochk.io/dashboard"
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setOpen(false)}
                                role="menuitem"
                                className="hover:bg-accent flex items-center gap-2 px-3 py-2 font-mono text-[11px] tracking-wide transition-colors"
                                data-oc-account-menu-item=""
                                data-oc-account-menu-family-dashboard=""
                            >
                                <span className="text-muted-foreground" aria-hidden>
                                    →
                                </span>
                                <span className="flex-1">family dashboard</span>
                                <span
                                    className="text-muted-foreground/70 text-[10px]"
                                    aria-hidden
                                >
                                    ↗
                                </span>
                            </a>
                        ) : null}

                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                void signOut();
                            }}
                            className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[11px] tracking-wide transition-colors"
                            data-oc-account-menu-item=""
                            data-oc-account-menu-signout=""
                        >
                            <span className="text-muted-foreground" aria-hidden>
                                →
                            </span>
                            <span className="flex-1">sign out</span>
                        </button>
                    </div>

                    {build ? <BuildFooter hostname={hostname} build={build} state={siteState} /> : null}
                </div>
            )}
        </div>
    );
}

function BuildFooter({
    hostname,
    build,
    state,
}: {
    hostname: string;
    build: OcAccountMenuBuildInfo;
    state?: SiteState;
}) {
    const sha = build.sha;
    const showSha = !!sha && sha !== 'dev';
    const commitUrl = showSha && build.repo ? `https://github.com/${build.repo}/commit/${sha}` : null;
    return (
        <div
            className="text-muted-foreground/60 border-border border-t px-3 py-2 font-mono text-[9.5px] tracking-widest uppercase"
            data-oc-account-menu-build=""
        >
            {hostname}
            {state && state !== 'live' ? (
                <>
                    {' · '}
                    <span className="text-muted-foreground/80">{state}</span>
                </>
            ) : null}{' '}
            <span className="text-muted-foreground/80">
                v{build.version}
                {showSha ? (
                    <>
                        {' · '}
                        {commitUrl ? (
                            <a
                                href={commitUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-foreground/90 underline decoration-dotted underline-offset-2"
                            >
                                {sha}
                            </a>
                        ) : (
                            sha
                        )}
                    </>
                ) : null}
            </span>
        </div>
    );
}
