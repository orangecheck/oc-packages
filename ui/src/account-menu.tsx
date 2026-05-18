'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import {
    fetchOcLinkedIdentities,
    useOcSession,
    type DisplayIdentity,
    type DisplayIdentityKind,
    type OcLinkedIdentity,
} from '@orangecheck/auth-client';

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
 *      with the full did_oc as a one-click copy-to-clipboard row,
 *      optional site-specific menu items, family dashboard link,
 *      sign-out, and an optional BuildFooter showing site name +
 *      version + commit sha → GitHub.
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

/**
 * Minimal session shape `<OcAccountMenuView>` needs. Compatible with
 * `useOcSession()`'s return value but explicit so consumers running
 * their own auth context (e.g. oc-www's local `useAuth`) can pass an
 * adapter without depending on `@orangecheck/auth-client`'s exact
 * types.
 */
export interface OcAccountMenuSession {
    status: 'loading' | 'authenticated' | 'anonymous' | 'error';
    account: {
        didOc: string;
        displayName: string | null;
        /**
         * The identity the user has promoted as their badge label —
         * `{ kind, value }`, always populated (defaults to the did).
         * Drives the collapsed-trigger label and the active row in the
         * "show as" promote list.
         */
        displayIdentity: DisplayIdentity;
        /** The user's Nostr npub, when set — a promotable badge
         *  identity that (unlike btc/email) is a profile field, not a
         *  linked-identity row, so it is read from the session. */
        nostrNpub?: string | null;
    } | null;
    signOut: () => void | Promise<void>;
    refresh: () => void | Promise<void>;
    /**
     * Promote a linked identity to be the badge label across every
     * `.ochk.io` site. The connected `<OcAccountMenu>` wires this to
     * `useOcSession().setDisplayIdentity`; a site running its own auth
     * context passes its own equivalent.
     */
    setDisplayIdentity: (kind: DisplayIdentityKind) => Promise<void>;
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
     * Where the browser lands after the user signs out. Default `'/'`
     * — the current site's own home. On sign-out the menu fires
     * `signOut()` (whose logout round-trip is `keepalive`, so it
     * survives the navigation) and *immediately* hard-navigates here.
     *
     * Navigating in the same tick is deliberate: it forecloses the
     * race where an auth-gated page observes the session flip to
     * `anonymous` and runs its own redirect-to-sign-in first. Sign-out
     * means "leave", not "go sign in again" — so the family default is
     * the site's home, never a sign-in page or the auth host.
     */
    signOutRedirect?: string;
    /**
     * Site-specific menu items, rendered between the section header
     * and the family-dashboard / sign-out rows. Keep this short —
     * 2–6 entries is the sweet spot. Pass `[]` (or omit) for sites
     * with no per-site routes worth surfacing.
     */
    menuItems?: ReadonlyArray<OcAccountMenuItem>;
    /**
     * Centered primary nav links (typically dashboard · docs · spec).
     * Rendered inside the popover at viewport widths below `sm`
     * (640px) — these are the same links the `<OcPrimaryNav>` row
     * shows inline at sm+, but at ultra-small widths the inline row
     * hides and this popover section takes its place. The result: one
     * dropdown surface owns navigation on phones, no separate
     * hamburger drawer required.
     */
    primaryNavLinks?: ReadonlyArray<OcAccountMenuItem>;
    /**
     * Tertiary nav links (about / contact / status / privacy / etc.).
     * Always visible inside the popover. Folds the legacy mobile-only
     * hamburger drawer's contents into the same dropdown as everything
     * else, so there's exactly one nav surface to learn.
     */
    secondaryNavLinks?: ReadonlyArray<OcAccountMenuItem>;
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

/**
 * Partially obscure an identity value for display — first 6 characters,
 * an ellipsis, last 4. Applied uniformly to every kind (did, Bitcoin
 * address, email, npub) and at every length, so a rendered label never
 * exposes a full identity at rest; the full value stays one click away
 * via the copy affordance. Short values fall back to a 4/3 split so the
 * middle is always masked.
 */
function obscureIdentity(value: string): string {
    if (value.length <= 12) {
        return `${value.slice(0, 4)}…${value.slice(-3)}`;
    }
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Human label for an identity kind, shown as the trailing tag on each
 *  promote row. */
const IDENTITY_KIND_LABEL: Record<DisplayIdentityKind, string> = {
    did: 'did:oc',
    btc: 'bitcoin',
    email: 'email',
    nostr: 'nostr',
};

/**
 * Best-effort clipboard write. Prefers the async Clipboard API (the
 * only thing that works off a user gesture in modern browsers), and
 * falls back to a hidden-`<textarea>` + `execCommand('copy')` for
 * non-secure contexts or older engines. Returns `true` on success so
 * the caller can decide whether to show "copied" feedback.
 */
async function writeClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to the legacy path
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

/**
 * The `did_oc` row inside the popover header, rendered as a single
 * one-click copy affordance. Clicking anywhere on the address copies
 * the full `did_oc` to the clipboard and flips the trailing glyph
 * from a copy icon to a check for ~1.6s. The popover deliberately
 * stays open so the user sees the confirmation. A visually-hidden
 * `aria-live` region announces the result to screen readers.
 *
 * This is the canonical pattern for surfacing a copyable OrangeCheck
 * identity — every family site gets it for free via `<OcAccountMenu>`.
 */
function CopyableDid({ did }: { did: string }) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        [],
    );

    const onCopy = async () => {
        const ok = await writeClipboard(did);
        if (!ok) return;
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1600);
    };

    return (
        <button
            type="button"
            onClick={onCopy}
            aria-label={
                copied
                    ? 'OrangeCheck identity copied to clipboard'
                    : `Copy OrangeCheck identity ${did} to clipboard`
            }
            title="Copy identity"
            data-oc-account-menu-copy-did=""
            data-copied={copied ? '' : undefined}
            className="group/did hover:bg-accent focus-visible:ring-ring/60 -mx-1.5 mt-px flex w-[calc(100%+0.75rem)] items-start gap-1.5 rounded px-1.5 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
            <span className="text-foreground/90 min-w-0 flex-1 font-mono text-[11px] leading-tight break-all">
                {did}
            </span>
            <span
                className={
                    'mt-px shrink-0 transition-colors ' +
                    (copied
                        ? 'text-primary'
                        : 'text-muted-foreground/50 group-hover/did:text-foreground/80')
                }
                aria-hidden
            >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </span>
            <span className="sr-only" aria-live="polite">
                {copied ? 'Copied to clipboard' : ''}
            </span>
        </button>
    );
}

/**
 * One row in the "§ show as" list — a promote control and an
 * independent copy-to-clipboard affordance.
 *
 * The value is always rendered partially obscured (`obscureIdentity`).
 * The row body is a radio that promotes this identity to the badge
 * label; the trailing copy button writes the *full* value to the
 * clipboard via the same `writeClipboard` path as the did row (async
 * Clipboard API, hidden-`<textarea>` fallback — works on touch devices
 * and non-secure contexts). Copy and promote are deliberately separate
 * controls: one selects the identity, the other extracts it.
 */
function PromoteRow({
    kind,
    value,
    active,
    busy,
    disabled,
    onPromote,
}: {
    kind: DisplayIdentityKind;
    value: string;
    active: boolean;
    busy: boolean;
    disabled: boolean;
    onPromote: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        },
        [],
    );

    const onCopy = async () => {
        const ok = await writeClipboard(value);
        if (!ok) return;
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1600);
    };

    const kindLabel = IDENTITY_KIND_LABEL[kind];

    return (
        <div
            className="hover:bg-accent flex items-center gap-1 pr-2 transition-colors"
            data-oc-account-menu-promote-row={kind}
            data-active={active ? '' : undefined}
        >
            <button
                type="button"
                role="menuitemradio"
                aria-checked={active}
                aria-label={active ? `Showing as ${kindLabel}` : `Show as ${kindLabel}`}
                disabled={disabled || active}
                onClick={onPromote}
                data-oc-account-menu-promote={kind}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 text-left font-mono text-[11px] tracking-wide disabled:cursor-default"
            >
                <span
                    className={
                        'flex size-3.5 shrink-0 items-center justify-center rounded-full border ' +
                        (active ? 'border-primary' : 'border-muted-foreground/40')
                    }
                    aria-hidden
                >
                    {active ? <span className="bg-primary size-1.5 rounded-full" /> : null}
                </span>
                <span className="text-foreground/90 min-w-0 flex-1 truncate">
                    {obscureIdentity(value)}
                </span>
            </button>
            <button
                type="button"
                onClick={() => void onCopy()}
                aria-label={
                    copied ? `${kindLabel} copied to clipboard` : `Copy ${kindLabel} to clipboard`
                }
                title="Copy"
                data-oc-account-menu-promote-copy={kind}
                data-copied={copied ? '' : undefined}
                className="hover:bg-background/70 focus-visible:ring-ring/60 flex size-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
                {copied ? (
                    <Check className="text-primary size-3.5" />
                ) : (
                    <Copy className="text-muted-foreground/50 size-3.5" />
                )}
            </button>
            <span className="text-muted-foreground/50 w-14 shrink-0 text-right text-[9px] tracking-widest uppercase">
                {busy ? <Loader2 className="ml-auto size-3 animate-spin" /> : kindLabel}
            </span>
            <span className="sr-only" aria-live="polite">
                {copied ? 'Copied to clipboard' : ''}
            </span>
        </div>
    );
}

/**
 * The "§ show as" block inside the popover — lists the user's
 * identities and lets them promote one as the badge label across
 * every `.ochk.io` site.
 *
 * The did is always an option (read from the session); the npub too
 * when set. The Bitcoin address and email are *linked identities*, so
 * they're lazy-fetched from the auth host the first time the popover
 * opens — `fetchOcLinkedIdentities()` is one credentialed request,
 * cached for the menu's lifetime. The section renders only once that
 * resolves and only when there are ≥2 identities worth choosing
 * between; with a single identity there is nothing to promote.
 *
 * Promotion calls `setDisplayIdentity(kind)` — which PATCHes the auth
 * host, re-mints the cross-subdomain cookie, and refreshes the session
 * — so the selected row and the collapsed label update in place and
 * every other family tab picks the choice up on its next focus.
 */
function IdentityPromoteSection({
    didOc,
    nostrNpub,
    current,
    open,
    setDisplayIdentity,
}: {
    didOc: string;
    nostrNpub: string | null;
    current: DisplayIdentity;
    open: boolean;
    setDisplayIdentity: (kind: DisplayIdentityKind) => Promise<void>;
}) {
    const [identities, setIdentities] = useState<OcLinkedIdentity[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [promoting, setPromoting] = useState<DisplayIdentityKind | null>(null);
    const [promoteErr, setPromoteErr] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    // Lazy fetch — once, the first time the popover opens.
    useEffect(() => {
        if (!open || fetchedRef.current) return;
        fetchedRef.current = true;
        let cancelled = false;
        void fetchOcLinkedIdentities()
            .then((rows) => {
                if (!cancelled) setIdentities(rows);
            })
            .catch(() => {
                if (!cancelled) setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Wait for the fetch to settle before rendering — avoids a section
    // that flashes in then vanishes.
    if (identities === null && !loadFailed) return null;

    const btc =
        identities?.find((i) => i.kind === 'btc' && i.is_primary && i.value) ??
        identities?.find((i) => i.kind === 'btc' && i.value);
    const email =
        identities?.find((i) => i.kind === 'email' && i.is_primary && i.value) ??
        identities?.find((i) => i.kind === 'email' && i.value);

    const options: Array<{ kind: DisplayIdentityKind; value: string }> = [
        { kind: 'did', value: didOc },
    ];
    if (btc?.value) options.push({ kind: 'btc', value: btc.value });
    if (email?.value) options.push({ kind: 'email', value: email.value });
    if (nostrNpub) options.push({ kind: 'nostr', value: nostrNpub });

    // Nothing to choose between → no section.
    if (options.length < 2) return null;

    const promote = async (kind: DisplayIdentityKind) => {
        if (promoting || kind === current.kind) return;
        setPromoting(kind);
        setPromoteErr(null);
        try {
            await setDisplayIdentity(kind);
        } catch (e) {
            setPromoteErr(e instanceof Error ? e.message : 'promotion failed');
        } finally {
            setPromoting(null);
        }
    };

    return (
        <div className="border-border border-b p-1" data-oc-account-menu-section="show-as">
            <div className="text-muted-foreground/60 px-3 pt-2 pb-1 font-mono text-[10px] tracking-widest uppercase">
                § show as
            </div>
            {options.map((opt) => (
                <PromoteRow
                    key={opt.kind}
                    kind={opt.kind}
                    value={opt.value}
                    active={opt.kind === current.kind}
                    busy={promoting === opt.kind}
                    disabled={promoting !== null}
                    onPromote={() => void promote(opt.kind)}
                />
            ))}
            {promoteErr ? (
                <div className="text-destructive/80 px-3 pt-1 pb-2 font-mono text-[10px]">
                    {promoteErr}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Connected variant — pulls the session from `useOcSession()`. This is
 * what every consumer site with `<OcSessionProvider>` mounted should
 * use. For sites running a parallel auth context (e.g. oc-www's local
 * `useAuth`), use `<OcAccountMenuView>` below and pass a session prop
 * directly.
 */
export function OcAccountMenu(props: OcAccountMenuProps) {
    const session = useOcSession();
    return (
        <OcAccountMenuView
            {...props}
            session={{
                status: session.status,
                account: session.account
                    ? {
                          didOc: session.account.didOc,
                          displayName: session.account.displayName ?? null,
                          displayIdentity: session.account.displayIdentity,
                          nostrNpub: session.account.nostrNpub ?? null,
                      }
                    : null,
                signOut: session.signOut,
                refresh: session.refresh,
                setDisplayIdentity: session.setDisplayIdentity,
            }}
        />
    );
}

export interface OcAccountMenuViewProps extends OcAccountMenuProps {
    /**
     * The session to render. When using `<OcAccountMenuView>` directly
     * (rather than the connected `<OcAccountMenu>`), pass an adapter
     * over your local auth context.
     */
    session: OcAccountMenuSession;
}

/**
 * Presentational variant — takes a session as an explicit prop. Use
 * this when your site runs its own auth context (e.g. ochk.io's
 * local `useAuth`) and you want the family-consistent visual without
 * mounting `<OcSessionProvider>`.
 */
export function OcAccountMenuView({
    current,
    signInUrl = '/signin',
    signInLabel = 'sign in',
    signOutRedirect = '/',
    menuItems,
    primaryNavLinks,
    secondaryNavLinks,
    showFamilyDashboard,
    build,
    siteState,
    className,
    triggerClassName,
    popoverClassName,
    session,
}: OcAccountMenuViewProps) {
    const { status, account, signOut, refresh, setDisplayIdentity } = session;
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

    // Authenticated — pill + popover. The collapsed label is the
    // user's vanity display name if they set one, otherwise the
    // identity they promoted (`displayIdentity` — defaults to their
    // sign-in identity, ultimately the did).
    const displayName = account.displayName ?? null;
    const label = displayName ?? obscureIdentity(account.displayIdentity.value);

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
                        'border-border bg-popover text-popover-foreground absolute top-[calc(100%+6px)] right-0 z-50 w-[min(20rem,calc(100vw-1rem))] border shadow-xl'
                    }
                    data-oc-account-menu-popover=""
                >
                    <div className="border-border border-b p-3">
                        <div className="text-primary mb-1 font-mono text-[10px] tracking-widest uppercase">
                            § signed in · {hostname}
                        </div>
                        <CopyableDid did={account.didOc} />
                        {displayName ? (
                            <div className="text-muted-foreground/80 mt-1 font-mono text-[10px] tracking-wide">
                                {displayName}
                            </div>
                        ) : null}
                    </div>

                    <IdentityPromoteSection
                        didOc={account.didOc}
                        nostrNpub={account.nostrNpub ?? null}
                        current={account.displayIdentity}
                        open={open}
                        setDisplayIdentity={setDisplayIdentity}
                    />

                    {primaryNavLinks && primaryNavLinks.length > 0 ? (
                        <PopoverSection
                            label="navigate"
                            items={primaryNavLinks}
                            onItemClick={() => setOpen(false)}
                        />
                    ) : null}

                    <div className="p-1" data-oc-account-menu-section="account">
                        {primaryNavLinks && primaryNavLinks.length > 0 ? (
                            <div className="text-muted-foreground/60 px-3 pb-1 pt-2 font-mono text-[10px] tracking-widest uppercase">
                                § account
                            </div>
                        ) : null}
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
                                // Fire the (keepalive) logout, then hard-navigate
                                // home in the SAME tick — before React commits the
                                // session→anonymous flip — so no auth-gated page
                                // can win a redirect-to-sign-in race.
                                void signOut();
                                if (typeof window !== 'undefined') {
                                    window.location.assign(signOutRedirect);
                                }
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

                    {secondaryNavLinks && secondaryNavLinks.length > 0 ? (
                        <PopoverSection
                            label="more"
                            items={secondaryNavLinks}
                            onItemClick={() => setOpen(false)}
                            bordered
                        />
                    ) : null}

                    {build ? <BuildFooter hostname={hostname} build={build} state={siteState} /> : null}
                </div>
            )}
        </div>
    );
}

/**
 * Single-section list inside the popover (e.g. `§ navigate`,
 * `§ more`). Used for both the primary-nav and secondary-nav slots so
 * the rendering stays consistent. Each item respects `external` and
 * gets the same row treatment as `menuItems`.
 */
function PopoverSection({
    label,
    items,
    onItemClick,
    bordered,
}: {
    label: string;
    items: ReadonlyArray<OcAccountMenuItem>;
    onItemClick: () => void;
    bordered?: boolean;
}) {
    const cls =
        'hover:bg-accent flex items-center gap-2 px-3 py-2 font-mono text-[11px] tracking-wide transition-colors';
    return (
        <div
            className={'p-1 ' + (bordered ? 'border-border border-t' : '')}
            data-oc-account-menu-section={label}
        >
            <div className="text-muted-foreground/60 px-3 pt-2 pb-1 font-mono text-[10px] tracking-widest uppercase">
                § {label}
            </div>
            {items.map((item) => {
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
                        onClick={onItemClick}
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
                        onClick={onItemClick}
                        role="menuitem"
                        className={cls}
                        data-oc-account-menu-item=""
                    >
                        {inner}
                    </Link>
                );
            })}
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
