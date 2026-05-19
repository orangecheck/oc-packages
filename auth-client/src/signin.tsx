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
     * Open-redirect-safe: same-origin paths only (must start with `/`,
     * NOT `//`). Absolute URLs are ignored.
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
     * Initial visible tab on mobile. Defaults to `'wallet'`. On desktop
     * both paths render side-by-side and this is ignored.
     */
    initialPath?: 'wallet' | 'email';
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
    authOrigin = 'https://ochk.io',
    initialPath = 'wallet',
    paths,
    className,
}: OcSignInProps): React.ReactElement {
    const walletEnabled = paths?.wallet ?? true;
    const emailEnabled = paths?.email ?? true;
    const safeReturn = safeReturnTo(returnTo);

    const [path, setPath] = React.useState<'wallet' | 'email'>(initialPath);
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
                    hardNavigate(safeReturnTo(await resolveReturnTo(account)));
                    return;
                } catch {
                    // resolver failed — fall through to the static returnTo
                }
            }
            hardNavigate(safeReturn);
        },
        [resolveReturnTo, safeReturn]
    );

    const handleSuccess = React.useCallback(
        async (account: OcAccount, token: string | undefined, via: 'wallet' | 'email') => {
            // The post-sign-in handoff — custom `onSuccess`, else navigation.
            const proceed = () => {
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
                    <SigninTab
                        active={path === 'wallet'}
                        onClick={() => setPath('wallet')}
                    >
                        bitcoin wallet
                    </SigninTab>
                    <SigninTab active={path === 'email'} onClick={() => setPath('email')}>
                        email + otp
                    </SigninTab>
                </div>
            )}

            <div data-oc-signin-panel="" role="tabpanel">
                {showWallet && (
                    <WalletFlow
                        authOrigin={authOrigin}
                        audience={audience}
                        onSuccess={(a, t) => void handleSuccess(a, t, 'wallet')}
                    />
                )}
                {showEmail && (
                    <EmailFlow
                        authOrigin={authOrigin}
                        onSuccess={(a, t) => void handleSuccess(a, t, 'email')}
                    />
                )}
            </div>

            <ProviderSignIn authOrigin={authOrigin} returnTo={safeReturn} />

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

/**
 * OAuth providers the auth host can complete a sign-in for. Each `id`
 * maps to `/api/auth/<id>/start` on the auth host. Google ships first;
 * GitHub / Apple / etc. slot in here as they are enabled host-side —
 * this section is the extensible placeholder for them.
 */
const OAUTH_PROVIDERS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'google', label: 'Continue with Google' },
];

/**
 * The secondary sign-in block — rendered below BIP-322 and email-OTP,
 * visibly less prominent. Each button is a plain navigation to the
 * auth host, which runs the OAuth dance and mints the family
 * `.ochk.io` session.
 */
function ProviderSignIn({
    authOrigin,
    returnTo,
}: {
    authOrigin: string;
    returnTo: string;
}): React.ReactElement {
    // A provider sign-in redirects THROUGH the auth host, so its final
    // redirect must carry an ABSOLUTE return target. `returnTo` here is
    // a bare path (`/dashboard`); left relative, the auth host's
    // callback — running on ochk.io — would resolve it against ochk.io
    // and strand a subdomain user on `ochk.io/<path>`. The origin is
    // only knowable client-side, so resolve it after mount. (SSR / a
    // pre-mount click falls back to the relative form, which the auth
    // host's /start absolutizes from the Referer.)
    const [origin, setOrigin] = React.useState('');
    React.useEffect(() => {
        setOrigin(window.location.origin);
    }, []);
    const providerReturnTo = origin ? `${origin}${returnTo}` : returnTo;
    const line = { flex: 1, height: 1, background: 'var(--border, #27272a)' } as const;
    return (
        <div data-oc-signin-providers="" style={{ marginTop: 20 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    margin: '4px 0 12px',
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
            {OAUTH_PROVIDERS.map((p) => (
                <a
                    key={p.id}
                    href={`${authOrigin}/api/auth/${p.id}/start?return_to=${encodeURIComponent(
                        providerReturnTo
                    )}`}
                    data-oc-signin-provider={p.id}
                    style={{
                        display: 'block',
                        boxSizing: 'border-box',
                        width: '100%',
                        padding: '0.6rem 0.875rem',
                        textAlign: 'center',
                        border: '1px solid var(--border, #27272a)',
                        borderRadius: 6,
                        background: 'transparent',
                        color: 'var(--muted-foreground, #a1a1aa)',
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: 12,
                        textDecoration: 'none',
                    }}
                >
                    {p.label}
                </a>
            ))}
        </div>
    );
}

/* --- wallet flow --- */

interface FlowProps {
    authOrigin: string;
    onSuccess: (account: OcAccount, token?: string) => void;
}

interface WalletFlowProps extends FlowProps {
    audience: string;
}

function WalletFlow({ authOrigin, audience, onSuccess }: WalletFlowProps): React.ReactElement {
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

function EmailFlow({ authOrigin, onSuccess }: FlowProps): React.ReactElement {
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
                body: JSON.stringify({ email, code, token }),
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
