/**
 * @orangecheck/auth-client · OcSignIn
 *
 * In-place dual-path signin component for every `X.ochk.io` consumer site.
 * Calls the cross-subdomain auth host (`ochk.io`) via family-CORS so the
 * `.ochk.io` session cookie lands without any redirect.
 *
 * Two paths, one component:
 *
 *   1. Bitcoin wallet · BIP-322
 *      - Paste address, in-page wallet extension signs a challenge
 *      - POSTs { message, signature, expectedNonce, expectedAudience,
 *        expectedPurpose } to ochk.io/api/auth/signin
 *      - Identity is `did:oc:<rand>` linked to the BTC address
 *
 *   2. Email · OTP
 *      - Enter email → ochk.io/api/auth/email-otp/start delivers a code
 *      - Enter code → ochk.io/api/auth/email-otp/verify lands the cookie
 *      - Identity is `did:oc:<rand>`; federation provisions a custodial
 *        wallet on first /me visit
 *
 * **Both paths resolve to the same did:oc canonical identity** via the
 * auth host's account-linking logic — a user who started with email can
 * later link their BTC address (and vice versa). One identity, two doors,
 * persistent across every family subdomain.
 *
 * On success, the component **hard-navigates** (window.location.assign)
 * rather than calling onSuccess + relying on the consumer to route. This
 * is non-negotiable: OcSessionProvider does not auto-refetch /api/auth/me
 * on client-side route changes, so a soft redirect leaves it with stale
 * `status: 'anonymous'`. Hard nav forces the provider to remount with
 * the fresh cookie. Override via onSuccess if you must.
 */

import * as React from 'react';

import { LinkPromptStep } from './linked-identities';
import { clearTabSession } from './tab-session';
import type { OcAccount } from './types';

/* --- props --- */

export interface OcSignInProps {
    /**
     * Consumer-site audience URL passed as `expectedAudience` on the
     * BIP-322 challenge. e.g. `'https://vault.ochk.io'`. Required —
     * the challenge nonce is bound to this audience.
     */
    audience: string;
    /**
     * Where to navigate after success. Defaults to `'/'`.
     * Open-redirect-safe: a same-origin path (must start with `/`, NOT
     * `//`) or an absolute `https://` URL on `ochk.io` / `*.ochk.io` —
     * the add-another-account flow starts on a consumer subdomain and
     * must round-trip back to it, including through the OAuth provider
     * hop. Anything else is ignored. When omitted, the component reads
     * `?return_to=` (or `?next=`) from the page URL — so the auth
     * host's `/signin?add=1&return_to=…` entry point Just Works, the
     * same way the `add` prop auto-detects `?add=1`.
     */
    returnTo?: string;
    /**
     * Override the default hard-navigation behavior. When provided,
     * called with the account and the session JWT. The component will
     * NOT navigate — the caller is responsible. Use for custom
     * post-signin routing — e.g. /popup/signin postMessages
     * `{ account, token }` to its opener so a cross-domain integrator
     * (different eTLD+1 from .ochk.io, which the HttpOnly cookie can't
     * reach) can verify the session via JWKS.
     */
    onSuccess?: (account: OcAccount, token?: string) => void;
    /**
     * Async post-success routing. When provided (and `onSuccess` is
     * not), the component awaits `resolveReturnTo(account)` and
     * hard-navigates to the result instead of the static `returnTo`.
     *
     * This is the seam that lets a site keep persona-aware routing
     * without forking the ceremony — e.g. me.ochk.io resolves
     * `/api/me/intent` and routes to `/me/developer` | `/me/operator`
     * | `/me`. The returned value is open-redirect-checked exactly
     * like `returnTo` (same-origin paths only); on a resolver throw
     * the component falls back to the static `returnTo`.
     */
    resolveReturnTo?: (account: OcAccount) => string | Promise<string>;
    /**
     * Override the auth host. Defaults to `'https://ochk.io'`. For
     * preview / dev / staging only.
     */
    authOrigin?: string;
    /**
     * Initial visible tab. Defaults to `'wallet'` — or to `'email'` when
     * {@link providersFirst} is set and this is left unspecified.
     */
    initialPath?: 'wallet' | 'email';
    /**
     * Re-order the ceremony so the third-party providers (Google / GitHub)
     * render **above** the wallet + email panel, and the email path is the
     * default active tab. **Off by default** — the canonical bitcoin-first
     * ceremony is unchanged for every other consumer.
     *
     * ochk.io's public homepage sets this so a first-time, non-Bitcoiner
     * visitor sees the most familiar on-ramp (Google) first; the BIP-322
     * wallet path stays one tab away, reframed as the most-sovereign
     * option. Honors family rule #3 — email / OAuth is the easy bridge,
     * the Bitcoin address remains the canonical identity it resolves to.
     */
    providersFirst?: boolean;
    /**
     * Disable one of the two paths. Default is both enabled.
     * Useful for B2B-only sites that don't want to expose email-OTP.
     */
    paths?: { wallet?: boolean; email?: boolean };
    /**
     * Whether to show the "also link my other identity" checkbox on the
     * sign-in form. **On by default.** The checkbox is optional and
     * unchecked by default; it is shown on both the wallet and email
     * paths. If the user ticks it, the complementary identity's link
     * ceremony (BIP-322 for a wallet, OTP for an email) runs inline
     * immediately after a successful sign-in — before `onSuccess` /
     * `returnTo`, so it composes with custom routing — because the
     * sign-in just proved one credential and the link ceremony proves
     * the second. Pass `linkPrompt={false}` to omit the checkbox.
     */
    linkPrompt?: boolean;
    /**
     * Multi-account · when `true`, the sign-in is performed in "add"
     * mode: the resulting session is appended to the browser's existing
     * roster instead of replacing it. The previously-active account
     * stays signed in and remains a switch target on the auth host. Off
     * by default (back-compat). The component also reads `?add=1` from
     * the URL search params and treats it the same — so the auth host's
     * `/signin?add=1` entry point Just Works without any extra prop.
     *
     * The `add` flag is forwarded as a body field to the host's
     * `/api/auth/signin` and `/api/auth/email-otp/verify`; if the host
     * hasn't deployed the multi-account migration yet it silently
     * ignores the field and the call falls back to ordinary signin.
     */
    add?: boolean;
    /** className for the outer container. */
    className?: string;
}

/* --- shared types --- */

interface SigninJsonOk {
    ok: true;
    account: OcAccount;
    /**
     * The session JWT, echoed alongside the `Set-Cookie`. Cross-domain
     * integrators capture this to verify the session via JWKS — the
     * HttpOnly `.ochk.io` cookie never reaches their origin. Family
     * `.ochk.io` sites ignore it and rely on the cookie.
     */
    token?: string;
}

interface SigninJsonErr {
    ok?: false;
    reason?: string;
    error?: string;
    issues?: unknown;
}

type SigninJson = SigninJsonOk | SigninJsonErr;

/* --- helpers --- */

function safeReturnTo(input: string | undefined): string {
    const candidate = input ?? '/';
    if (typeof candidate !== 'string') return '/';
    if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
    return candidate;
}

/**
 * Family-aware return target. Accepts a same-origin relative path
 * (exactly like {@link safeReturnTo}) OR an absolute `https://` URL on
 * `ochk.io` / `*.ochk.io` — mirroring the auth host's own post-signin
 * redirect allowlist. Returns `undefined` when the input is neither, so
 * callers can layer fallbacks.
 */
function familyReturnTarget(input: string | undefined | null): string | undefined {
    if (typeof input !== 'string' || input.length === 0) return undefined;
    if (input.startsWith('/') && !input.startsWith('//')) return input;
    try {
        const u = new URL(input);
        if (u.protocol !== 'https:') return undefined;
        const host = u.hostname.toLowerCase();
        if (host === 'ochk.io' || host.endsWith('.ochk.io')) return u.toString();
    } catch {
        // not an absolute URL either
    }
    return undefined;
}

function hardNavigate(target: string): void {
    if (typeof window === 'undefined') return;
    window.location.assign(target);
}

/* --- main component --- */

export function OcSignIn({
    audience,
    returnTo,
    onSuccess,
    resolveReturnTo,
    linkPrompt = true,
    add: addProp,
    authOrigin = 'https://ochk.io',
    initialPath,
    providersFirst = false,
    paths,
    className,
}: OcSignInProps): React.ReactElement {
    const walletEnabled = paths?.wallet ?? true;
    const emailEnabled = paths?.email ?? true;

    // Return target · prop wins; otherwise honor `?return_to=` / `?next=`
    // from the URL — the auth host's `/signin?add=1&return_to=…` entry
    // point needs the OAuth provider hop to carry the same target the
    // embedding page honors (the add-another-account fix: a vault user
    // adding an account via Google must land back on vault, not on the
    // host's homepage). Absolute https://*.ochk.io URLs are allowed;
    // everything else clamps to `/`.
    const [resolvedReturn, setResolvedReturn] = React.useState<string>(
        () => familyReturnTarget(returnTo) ?? safeReturnTo(returnTo)
    );
    React.useEffect(() => {
        const fromProp = familyReturnTarget(returnTo);
        if (fromProp) {
            setResolvedReturn(fromProp);
            return;
        }
        if (typeof window === 'undefined') return;
        const q = new URLSearchParams(window.location.search);
        const fromQuery =
            familyReturnTarget(q.get('return_to')) ?? familyReturnTarget(q.get('next'));
        setResolvedReturn(fromQuery ?? '/');
    }, [returnTo]);

    // Multi-account · prop wins; otherwise honor `?add=1` from the URL
    // so the auth host's /signin?add=1 entry point doesn't need any
    // extra wiring on every consumer's sign-in page.
    const [addMode, setAddMode] = React.useState<boolean>(Boolean(addProp));
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (addProp !== undefined) {
            setAddMode(Boolean(addProp));
            return;
        }
        setAddMode(new URLSearchParams(window.location.search).get('add') === '1');
    }, [addProp]);

    // When providers lead the ceremony (ochk.io homepage), the email path
    // is the friendlier default tab; otherwise the canonical bitcoin-first
    // default holds. An explicit `initialPath` always wins.
    const [path, setPath] = React.useState<'wallet' | 'email'>(
        initialPath ?? (providersFirst ? 'email' : 'wallet')
    );
    // Set once sign-in succeeds and the account is missing its
    // complementary identity — the component then renders the focused
    // link step (LinkPromptStep) before running `proceed`.
    const [signedIn, setSignedIn] = React.useState<{
        method: 'btc' | 'email';
        didOc: string;
        proceed: () => void;
    } | null>(null);
    // The optional "also link my other identity" checkbox on the form.
    const [linkAlso, setLinkAlso] = React.useState(false);
    // Set when the user is bounced back here after a failed provider
    // (e.g. Google) sign-in — the auth host redirects to
    // `/signin?oauth_error=…`.
    const [oauthError, setOauthError] = React.useState(false);
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).has('oauth_error')) {
            setOauthError(true);
        }
    }, []);

    const navigate = React.useCallback(
        async (account: OcAccount) => {
            if (resolveReturnTo) {
                try {
                    const resolved = familyReturnTarget(await resolveReturnTo(account));
                    hardNavigate(resolved ?? resolvedReturn);
                    return;
                } catch {
                    // resolver failed — fall through to the static returnTo
                }
            }
            hardNavigate(resolvedReturn);
        },
        [resolveReturnTo, resolvedReturn]
    );

    const handleSuccess = React.useCallback(
        async (account: OcAccount, token: string | undefined, via: 'wallet' | 'email') => {
            // The post-sign-in handoff — custom `onSuccess`, else navigation.
            const proceed = () => {
                // Per-tab · the user just completed a ceremony IN this tab —
                // it must adopt the new identity, not keep a stale pin.
                clearTabSession();
                if (onSuccess) onSuccess(account, token);
                else void navigate(account);
            };

            // Linking is opt-in via the form checkbox. Unchecked (or the
            // checkbox suppressed) → ordinary sign-in.
            if (!linkPrompt || !linkAlso) {
                proceed();
                return;
            }

            // Checked: run the complementary identity's link ceremony now.
            // /api/auth/me resolves the did:oc the BIP-322 link challenge is
            // bound to; a failure here must not strand the signed-in user.
            try {
                const meRes = await fetch(`${authOrigin}/api/auth/me`, {
                    credentials: 'include',
                    headers: { Accept: 'application/json' },
                });
                const me = meRes.ok
                    ? ((await meRes.json()) as { account?: { did_oc?: string } })
                    : null;
                const didOc = me?.account?.did_oc;
                if (didOc) {
                    setSignedIn({
                        method: via === 'email' ? 'btc' : 'email',
                        didOc,
                        proceed,
                    });
                    return;
                }
            } catch {
                // /api/auth/me unreachable — proceed without the link step.
            }
            proceed();
        },
        [onSuccess, linkPrompt, linkAlso, navigate, authOrigin]
    );

    if (!walletEnabled && !emailEnabled) {
        return (
            <div
                className={className}
                data-oc-signin=""
                style={{
                    padding: '1rem',
                    border: '1px solid var(--border, #27272a)',
                    color: 'var(--foreground, #fafafa)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 12,
                }}
            >
                no signin paths enabled — set <code>paths.wallet</code> or{' '}
                <code>paths.email</code> to <code>true</code>
            </div>
        );
    }

    if (signedIn) {
        return (
            <div className={className} data-oc-signin="">
                <LinkPromptStep
                    method={signedIn.method}
                    didOc={signedIn.didOc}
                    authOrigin={authOrigin}
                    onResolved={signedIn.proceed}
                />
            </div>
        );
    }

    const showWallet = walletEnabled && (path === 'wallet' || !emailEnabled);
    const showEmail = emailEnabled && (path === 'email' || !walletEnabled);
    const bothEnabled = walletEnabled && emailEnabled;
    // The method the user will actually sign in with — the active tab,
    // clamped when only one path is enabled. Drives the checkbox wording.
    const activeMethod: 'wallet' | 'email' = !emailEnabled
        ? 'wallet'
        : !walletEnabled
          ? 'email'
          : path;

    return (
        <div className={className} data-oc-signin="">
            {oauthError && (
                <div
                    data-oc-signin-oauth-error=""
                    style={{
                        marginBottom: 14,
                        padding: '0.6rem 0.75rem',
                        border: '1px solid var(--destructive, #ef4444)',
                        borderRadius: 6,
                        color: 'var(--destructive, #ef4444)',
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 11,
                    }}
                >
                    That sign-in didn&apos;t complete. Please try again.
                </div>
            )}
            {addMode && (
                <div
                    data-oc-signin-add-mode=""
                    style={{
                        marginBottom: 14,
                        padding: '0.6rem 0.75rem',
                        border: '1px solid var(--primary, #f97316)',
                        borderLeftWidth: 3,
                        borderRadius: 4,
                        background: 'color-mix(in srgb, var(--primary, #f97316) 8%, transparent)',
                        color: 'var(--foreground, #fafafa)',
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 11,
                        lineHeight: 1.6,
                    }}
                >
                    <strong
                        style={{
                            color: 'var(--primary, #f97316)',
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            fontSize: 10,
                            display: 'block',
                            marginBottom: 3,
                        }}
                    >
                        § adding another account
                    </strong>
                    Your current OrangeCheck account stays signed in. The new account joins your
                    browser&apos;s roster; you can switch between them anytime from the account
                    menu.
                </div>
            )}
            {/* Providers-first (ochk.io homepage): the familiar Google /
                GitHub on-ramp leads, with the wallet/email panel below the
                divider. Everywhere else this block stays at the bottom. */}
            {providersFirst && (
                <ProviderSignIn
                    authOrigin={authOrigin}
                    returnTo={resolvedReturn}
                    add={addMode}
                    first
                />
            )}
            {bothEnabled && (
                <div
                    role="tablist"
                    aria-label="signin method"
                    data-oc-signin-tabs=""
                    style={{
                        display: 'flex',
                        gap: 8,
                        marginBottom: 16,
                        borderBottom: '1px solid var(--border, #27272a)',
                    }}
                >
                    {/* When providers lead, the easy email path reads first
                        and the wallet path sits beside it as the upgrade. */}
                    {providersFirst ? (
                        <>
                            <SigninTab
                                active={path === 'email'}
                                onClick={() => setPath('email')}
                            >
                                email + otp
                            </SigninTab>
                            <SigninTab
                                active={path === 'wallet'}
                                onClick={() => setPath('wallet')}
                            >
                                bitcoin · self-custody
                            </SigninTab>
                        </>
                    ) : (
                        <>
                            <SigninTab
                                active={path === 'wallet'}
                                onClick={() => setPath('wallet')}
                            >
                                bitcoin wallet
                            </SigninTab>
                            <SigninTab
                                active={path === 'email'}
                                onClick={() => setPath('email')}
                            >
                                email + otp
                            </SigninTab>
                        </>
                    )}
                </div>
            )}

            <div data-oc-signin-panel="" role="tabpanel">
                {showWallet && (
                    <WalletFlow
                        authOrigin={authOrigin}
                        audience={audience}
                        add={addMode}
                        onSuccess={(a, t) => void handleSuccess(a, t, 'wallet')}
                    />
                )}
                {showEmail && (
                    <EmailFlow
                        authOrigin={authOrigin}
                        add={addMode}
                        onSuccess={(a, t) => void handleSuccess(a, t, 'email')}
                    />
                )}
            </div>

            {!providersFirst && (
                <ProviderSignIn authOrigin={authOrigin} returnTo={resolvedReturn} add={addMode} />
            )}

            {linkPrompt && (
                <label data-oc-signin-linkalso="" style={linkAlsoStyle}>
                    <input
                        type="checkbox"
                        checked={linkAlso}
                        onChange={(e) => setLinkAlso(e.target.checked)}
                        style={{ marginTop: 2, accentColor: 'var(--primary, #f97316)' }}
                    />
                    <span>
                        After signing in, also link{' '}
                        {activeMethod === 'email' ? 'a Bitcoin wallet' : 'an email'}{' '}
                        <span style={{ opacity: 0.65 }}>— optional, one more signature.</span>
                    </span>
                </label>
            )}
        </div>
    );
}

/* --- tab --- */

function SigninTab({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            data-oc-signin-tab={active ? 'active' : 'inactive'}
            style={{
                padding: '0.6rem 0.875rem',
                background: 'transparent',
                border: 'none',
                borderBottom: active
                    ? '2px solid var(--primary, #f97316)'
                    : '2px solid transparent',
                color: active
                    ? 'var(--foreground, #fafafa)'
                    : 'var(--muted-foreground, #a1a1aa)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                marginBottom: -1,
            }}
        >
            {children}
        </button>
    );
}

/* --- third-party provider sign-in --- */

interface OAuthProviderEntry {
    id: string;
    label: string;
}

/**
 * Brand glyph for a known OAuth provider — rendered inside the
 * provider button so each entry is visually recognisable, but drawn
 * in `currentColor` so it picks up the OC muted-foreground theme
 * (the family palette wins over each vendor's brand colours by
 * design). Unknown providers fall through to no icon — the button
 * still renders, just text-only, so the registry is forward-compatible.
 */
function ProviderIcon({ id }: { id: string }): React.ReactElement | null {
    const common = {
        width: 14,
        height: 14,
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': true,
        style: { flex: '0 0 auto' } as React.CSSProperties,
    } as const;
    if (id === 'google') {
        return (
            <svg {...common}>
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
            </svg>
        );
    }
    if (id === 'github') {
        return (
            <svg {...common}>
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
        );
    }
    return null;
}

/**
 * The secondary sign-in block — rendered below BIP-322 and email-OTP,
 * visibly less prominent. Each button is a plain navigation to the
 * auth host, which runs the OAuth dance and mints the family
 * `.ochk.io` session.
 *
 * The provider list is fetched from the auth host's
 * `/api/auth/providers` — a button appears only once that provider's
 * credentials are configured host-side. So enabling GitHub / Apple
 * later is a host env change, not a redeploy of every consumer site.
 * With no providers configured the whole block renders nothing.
 */
function ProviderSignIn({
    authOrigin,
    returnTo,
    add,
    first = false,
}: {
    authOrigin: string;
    returnTo: string;
    add: boolean;
    /**
     * Render this block at the TOP of the ceremony (above the wallet/email
     * panel) rather than the default bottom. The "or" divider then sits
     * below the provider buttons, and the block reserves space beneath
     * itself instead of above. Set by {@link OcSignIn} when
     * `providersFirst` is on.
     */
    first?: boolean;
}): React.ReactElement | null {
    const [providers, setProviders] = React.useState<OAuthProviderEntry[]>([]);
    // A provider sign-in redirects THROUGH the auth host, so its final
    // redirect must carry an ABSOLUTE return target — a bare path would
    // resolve against ochk.io and strand a subdomain user there. The
    // origin is only knowable client-side.
    const [origin, setOrigin] = React.useState('');

    React.useEffect(() => {
        setOrigin(window.location.origin);
        let cancelled = false;
        fetch(`${authOrigin}/api/auth/providers`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<{ providers?: OAuthProviderEntry[] }>) : null))
            .then((body) => {
                if (!cancelled && body?.providers) setProviders(body.providers);
            })
            .catch(() => {
                // auth host unreachable — no provider buttons; the
                // BIP-322 / email-OTP paths are unaffected.
            });
        return () => {
            cancelled = true;
        };
    }, [authOrigin]);

    if (providers.length === 0) return null;

    // An absolute family URL (the add-another-account round trip back to
    // a consumer subdomain) is carried verbatim through the OAuth hop;
    // a relative path is anchored to THIS page's origin.
    const providerReturnTo = returnTo.startsWith('/')
        ? origin
            ? `${origin}${returnTo}`
            : returnTo
        : returnTo;
    const line = { flex: 1, height: 1, background: 'var(--border, #27272a)' } as const;
    const divider = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: first ? '14px 0 4px' : '4px 0 12px',
                color: 'var(--muted-foreground, #a1a1aa)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
            }}
        >
            <span style={line} />
            or
            <span style={line} />
        </div>
    );
    const buttons = providers.map((p, i) => (
        <a
            key={p.id}
            href={`${authOrigin}/api/auth/${p.id}/start?return_to=${encodeURIComponent(
                providerReturnTo
            )}${add ? '&add=1' : ''}`}
            data-oc-signin-provider={p.id}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxSizing: 'border-box',
                width: '100%',
                marginTop: i === 0 ? 0 : 8,
                padding: '0.6rem 0.875rem',
                border: '1px solid var(--border, #27272a)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--muted-foreground, #a1a1aa)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 12,
                textDecoration: 'none',
            }}
        >
            <ProviderIcon id={p.id} />
            <span>{p.label}</span>
        </a>
    ));
    // first → providers lead: buttons, then the "or" divider before the
    // wallet/email panel below. Otherwise the canonical bottom placement:
    // divider, then buttons.
    return (
        <div data-oc-signin-providers="" style={first ? { marginBottom: 4 } : { marginTop: 20 }}>
            {first ? (
                <>
                    {buttons}
                    {divider}
                </>
            ) : (
                <>
                    {divider}
                    {buttons}
                </>
            )}
        </div>
    );
}

/* --- wallet flow --- */

interface FlowProps {
    authOrigin: string;
    /** Multi-account add-mode · see OcSignIn.add. */
    add?: boolean;
    onSuccess: (account: OcAccount, token?: string) => void;
}

interface WalletFlowProps extends FlowProps {
    audience: string;
}

function WalletFlow({ authOrigin, audience, add, onSuccess }: WalletFlowProps): React.ReactElement {
    const [address, setAddress] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [submitting, setSubmitting] = React.useState(false);
    const [stage, setStage] = React.useState<'enter' | 'signing'>('enter');

    async function signIn(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        const addr = address.trim();
        if (!addr) {
            setError('paste a Bitcoin address');
            return;
        }
        setError(null);
        setSubmitting(true);
        setStage('signing');
        try {
            // 1. Fetch a challenge bound to (address, audience, purpose=login).
            const challengeRes = await fetch(
                `${authOrigin}/api/challenge?addr=${encodeURIComponent(addr)}&audience=${encodeURIComponent(audience)}&purpose=login`
            );
            const challenge = (await challengeRes.json()) as {
                message?: string;
                nonce?: string;
                error?: string;
            };
            if (!challengeRes.ok || !challenge.message || !challenge.nonce) {
                throw new Error(challenge.error ?? 'challenge_failed');
            }

            // 2. Sign the challenge via @orangecheck/wallet-adapter (loaded
            //    on-demand so the package doesn't hard-depend on it).
            type AdapterShape = {
                detectWallets: () => Array<{ id: string; detected: boolean }>;
                getSigner: (
                    id: string,
                    opts: { address: string }
                ) => (message: string) => Promise<string>;
            };
            let adapter: AdapterShape;
            try {
                // Optional peer dep — the consumer site installs it. This is
                // a *static* dynamic import: tsup keeps the specifier verbatim
                // (it's in `external`), and the consumer's bundler resolves it
                // against the consumer's node_modules at build time. The old
                // `Function('m','return import(m)')` trick produced a runtime
                // bare-specifier `import()` the browser cannot resolve without
                // an import map — which is what broke sign-in everywhere.
                adapter = (await import(
                    '@orangecheck/wallet-adapter'
                )) as unknown as AdapterShape;
            } catch {
                throw new Error(
                    '@orangecheck/wallet-adapter not installed · add it to your consumer site'
                );
            }
            const wallets = adapter
                .detectWallets()
                .filter((w) => w.detected && w.id !== 'manual');
            if (wallets.length === 0) {
                throw new Error('no BIP-322 wallet extension detected · install one and refresh');
            }
            const wallet = wallets[0]!;
            const signer = adapter.getSigner(wallet.id, { address: addr });
            const signature = await signer(challenge.message);

            // 3. POST { message, signature, … } to ochk.io/api/auth/signin.
            //    Family-CORS lets the .ochk.io session cookie land cross-origin.
            const res = await fetch(`${authOrigin}/api/auth/signin`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: challenge.message,
                    signature,
                    scheme: 'bip322',
                    expectedNonce: challenge.nonce,
                    expectedAudience: audience,
                    expectedPurpose: 'login',
                    // Multi-account add-mode · the auth host preserves
                    // the current roster_id when set, instead of minting
                    // a fresh one. Hosts that haven't deployed the
                    // multi-account migration silently ignore the field.
                    ...(add ? { add: true } : {}),
                }),
            });
            const json = (await res.json()) as SigninJson;
            if (!res.ok || !('ok' in json) || !json.ok || !json.account) {
                throw new Error(
                    ('reason' in json && json.reason) ||
                        ('error' in json && json.error) ||
                        `verify_failed_${res.status}`
                );
            }
            onSuccess(json.account, json.token);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'sign-in failed';
            setError(msg);
            setSubmitting(false);
            setStage('enter');
        }
    }

    return (
        <form onSubmit={signIn} data-oc-signin-wallet="">
            <FlowHeader label="§ bitcoin wallet">
                Sign in with any BIP-322-capable Bitcoin wallet (Sparrow, Xverse, Leather, UniSat,
                Alby, OKX, Phantom). Paste your address, click sign — your wallet extension prompts
                for a one-time signature on a short challenge. The address becomes your OC
                identity. Private key material never leaves your wallet.
            </FlowHeader>
            <Label>bitcoin address</Label>
            <input
                type="text"
                value={address}
                onChange={(e) => {
                    setAddress(e.target.value);
                    if (error) setError(null);
                }}
                placeholder="bc1q… · 3… · 1…"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={error ? true : undefined}
                style={inputStyle}
            />
            {error && <ErrorLine>{error}</ErrorLine>}
            <button
                type="submit"
                disabled={submitting || !address.trim()}
                style={submitStyle(submitting || !address.trim())}
            >
                {stage === 'signing' && submitting
                    ? 'waiting for wallet…'
                    : 'sign challenge · sign me in →'}
            </button>
            <Hint>
                Detection picks the first installed BIP-322-capable extension. Address is the one
                your wallet will sign for.
            </Hint>
        </form>
    );
}

/* --- email flow --- */

type EmailStage = 'enter' | 'code';

function EmailFlow({ authOrigin, add, onSuccess }: FlowProps): React.ReactElement {
    const [stage, setStage] = React.useState<EmailStage>('enter');
    const [email, setEmail] = React.useState('');
    const [emailError, setEmailError] = React.useState<string | null>(null);
    const [code, setCode] = React.useState('');
    const [codeError, setCodeError] = React.useState<string | null>(null);
    const [token, setToken] = React.useState<string | null>(null);
    const [submitting, setSubmitting] = React.useState(false);

    async function start(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!trimmed || !/.+@.+\..+/.test(trimmed)) {
            setEmailError('enter a valid email');
            return;
        }
        setEmailError(null);
        setSubmitting(true);
        try {
            const res = await fetch(`${authOrigin}/api/auth/email-otp/start`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: trimmed }),
            });
            const json = (await res.json()) as { ok?: boolean; token?: string; reason?: string };
            if (!res.ok || !json.token) {
                throw new Error(json.reason ?? `start failed (${res.status})`);
            }
            setToken(json.token);
            setEmail(trimmed);
            setStage('code');
        } catch (err) {
            setEmailError(err instanceof Error ? err.message : 'failed to send code');
        } finally {
            setSubmitting(false);
        }
    }

    async function verify(e: React.FormEvent): Promise<void> {
        e.preventDefault();
        if (!token) return;
        if (code.length !== 6) {
            setCodeError('6 digits');
            return;
        }
        setCodeError(null);
        setSubmitting(true);
        try {
            const res = await fetch(`${authOrigin}/api/auth/email-otp/verify`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    code,
                    token,
                    // Multi-account add-mode · see WalletFlow.
                    ...(add ? { add: true } : {}),
                }),
            });
            const json = (await res.json()) as SigninJson;
            if (!res.ok || !('ok' in json) || !json.ok || !json.account) {
                throw new Error(
                    ('reason' in json && json.reason) ||
                        ('error' in json && json.error) ||
                        `verify failed (${res.status})`
                );
            }
            onSuccess(json.account, json.token);
        } catch (err) {
            setCodeError(err instanceof Error ? err.message : 'verify failed');
        } finally {
            setSubmitting(false);
        }
    }

    if (stage === 'enter') {
        return (
            <form onSubmit={start} data-oc-signin-email="">
                <FlowHeader label="§ email + otp">
                    We email you a 6-digit code. No password. The federation provisions a custodial
                    wallet for you in your browser. Best path if you don&apos;t have a Bitcoin
                    wallet yet — graduate to self-custody anytime by adding your BTC address from
                    your account dashboard.
                </FlowHeader>
                <Label>email</Label>
                <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                    }}
                    placeholder="you@example.com"
                    required
                    aria-invalid={emailError ? true : undefined}
                    style={inputStyle}
                />
                {emailError && <ErrorLine>{emailError}</ErrorLine>}
                <button type="submit" disabled={submitting} style={submitStyle(submitting)}>
                    {submitting ? 'sending…' : 'send one-time code →'}
                </button>
                <Hint>
                    OTP delivered by the auth host. Codes expire in 10 minutes and are single-use.
                    Rate-limited 5 starts/hour/IP.
                </Hint>
            </form>
        );
    }

    return (
        <form onSubmit={verify} data-oc-signin-email-verify="">
            <FlowHeader label="§ enter the code">
                Sent a 6-digit code to <span style={{ color: 'var(--foreground, #fafafa)' }}>{email}</span>.
                Code expires in 10 minutes.
            </FlowHeader>
            <Label>one-time code</Label>
            <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (codeError) setCodeError(null);
                }}
                placeholder="6 digits"
                required
                autoFocus
                aria-invalid={codeError ? true : undefined}
                style={{ ...inputStyle, letterSpacing: '0.4em', fontSize: 16 }}
            />
            {codeError && <ErrorLine>{codeError}</ErrorLine>}
            <button
                type="submit"
                disabled={submitting || code.length !== 6}
                style={submitStyle(submitting || code.length !== 6)}
            >
                {submitting ? 'verifying…' : 'verify · sign me in →'}
            </button>
            <button
                type="button"
                onClick={() => {
                    setStage('enter');
                    setCode('');
                    setToken(null);
                }}
                style={{
                    marginTop: 12,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted-foreground, #a1a1aa)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    padding: 0,
                }}
            >
                use a different email
            </button>
            <Hint>On verify, oc_session is set on Domain=.ochk.io family-wide.</Hint>
        </form>
    );
}

/* --- shared subcomponents --- */

function FlowHeader({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): React.ReactElement {
    return (
        <div style={{ marginBottom: 16 }}>
            <div
                style={{
                    color: 'var(--primary, #f97316)',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                }}
            >
                {label}
            </div>
            <p
                style={{
                    color: 'var(--muted-foreground, #a1a1aa)',
                    fontSize: 13,
                    lineHeight: 1.55,
                    margin: 0,
                }}
            >
                {children}
            </p>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <label
            style={{
                display: 'block',
                color: 'var(--foreground, #fafafa)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 11,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 6,
            }}
        >
            {children}
        </label>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: 'var(--background, #0a0a0a)',
    color: 'var(--foreground, #fafafa)',
    border: '1px solid var(--input, #27272a)',
    borderRadius: 6,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    // 16px — never below it. A sub-16px font-size makes iOS Safari
    // auto-zoom the viewport on focus; the family rule is >=16px on
    // every form field. Desktop reads fine at 16 too.
    fontSize: 16,
    outline: 'none',
};

const linkAlsoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid var(--border, #27272a)',
    color: 'var(--muted-foreground, #a1a1aa)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: 12,
    lineHeight: 1.5,
    cursor: 'pointer',
};

function submitStyle(disabled: boolean): React.CSSProperties {
    return {
        marginTop: 12,
        padding: '0.6rem 1rem',
        background: 'var(--primary, #f97316)',
        color: 'var(--primary-foreground, #0a0a0a)',
        border: 'none',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: '100%',
    };
}

function ErrorLine({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <p
            role="alert"
            style={{
                marginTop: 6,
                marginBottom: 0,
                color: 'var(--destructive, #ef4444)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 11,
                letterSpacing: '0.04em',
            }}
        >
            {children}
        </p>
    );
}

function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <p
            style={{
                marginTop: 12,
                marginBottom: 0,
                color: 'var(--muted-foreground, #a1a1aa)',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                fontSize: 10.5,
                lineHeight: 1.55,
                opacity: 0.7,
            }}
        >
            {'> '}
            {children}
        </p>
    );
}
