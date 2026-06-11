/**
 * The kinds of identity a user can surface as their account-badge
 * label. `did` is the canonical `did:oc` identifier — always available
 * and the ultimate fallback; the other three are linked identities a
 * user may or may not have.
 */
export const DISPLAY_IDENTITY_KINDS = ['did', 'btc', 'email', 'nostr'] as const;
export type DisplayIdentityKind = (typeof DISPLAY_IDENTITY_KINDS)[number];

/**
 * The identity a user has chosen to show in their account badge — the
 * collapsed label every family site renders instead of the raw
 * `did:oc`. Carried as a JWT claim by the auth host, so the choice is
 * consistent across every `.ochk.io` subdomain with no round-trip.
 *
 * `kind` is which identity; `value` is the full, renderable value (the
 * `did:oc`, the Bitcoin address, the email, or the npub). Integrators
 * rendering their own chip read `useOcSession().account.displayIdentity`
 * — it is always populated (it defaults to the `did`).
 */
export interface DisplayIdentity {
    kind: DisplayIdentityKind;
    value: string;
}

export interface OcAccount {
    accountId: string;
    /**
     * Opaque public-facing identifier · `did:oc:<32-hex>`. The sole
     * user identifier post auth-refactor. Stable across linking
     * events. Per AUTH-REFACTOR-PLAN.md §2.1.
     */
    didOc: string;
    /**
     * Primary linked Bitcoin address, plaintext, when the user has
     * one — null for email-OTP users until they link a btc address.
     * Surfaced inline by the auth host's /api/auth/me so consumer
     * dashboards can render the user's own footprint without a
     * second round-trip through /api/auth/identities.
     */
    primaryBtc?: string | null;
    /**
     * True when the user has a primary email linked. Plaintext is
     * fetchable on demand via /api/auth/identities; not surfaced
     * here.
     */
    hasEmail?: boolean;
    displayName?: string | null;
    nostrNpub?: string | null;
    /**
     * Slug of the federation this user is bound to (their "home"
     * federation). Multi-federation routing reads this; null/undefined
     * means "not yet bound — fall back to the directory default at
     * /api/federations". v1 has one live federation, so this is set on
     * first signin and rarely changes.
     */
    homeFederation?: string | null;
    /**
     * Where this user is on the custody-state graph:
     *
     *   - 'fedimint_threshold' — federation custody (OC-introduced)
     *   - 'fedimint_client'    — federation custody (user-picked)
     *   - 'bip322'             — full self-custody
     *
     * Graduation is the product thesis. Treat undefined as
     * 'fedimint_threshold' for `did:email:` addresses and 'bip322' for
     * Bitcoin addresses (the default-by-construction mapping for
     * tokens minted before this field shipped).
     */
    signingMethod?: 'fedimint_threshold' | 'fedimint_client' | 'bip322' | null;
    /**
     * Best-effort owner-flag · true when the user's `did_oc` was on
     * the auth host's `OWNER_OC_ADDRESSES` env at the time the JWT
     * was minted. Surfaced so the family-switcher and other low-
     * stakes UX can render owner-only affordances (e.g. an
     * analytics.ochk.io entry visible only to owners).
     *
     * **NOT A SECURITY BOUNDARY.** Sensitive surfaces — including
     * analytics.ochk.io itself — re-check the live env against
     * `session.did_oc` server-side on every request. If an owner is
     * removed from the env, their JWT may keep `isOwner: true` for
     * up to the JWT lifetime (~30d) but every gated action they
     * attempt re-fails. The flag exists purely so we can show or
     * hide UX hints without an extra round-trip on every page load.
     *
     * Treat absence as `false`.
     */
    isOwner?: boolean;
    /**
     * The identity the user has chosen to show as their account-badge
     * label — `{ kind, value }`. **Always populated**: when the user
     * has never promoted an identity (and on sessions minted before
     * the feature shipped) this is `{ kind:'did', value:didOc }`.
     *
     * `<OcAccountMenu>` renders `value` (shortened) as the collapsed
     * badge label. Integrators rendering their own chip read this
     * directly; change it with `useOcSession().setDisplayIdentity()`.
     */
    displayIdentity: DisplayIdentity;
}

export type OcSessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

/**
 * Multi-account roster · summary of another account this browser has
 * signed into and can switch to without re-authenticating. Surfaced by
 * `<OcAccountMenu>` in the `§ accounts` section. Returned by the auth
 * host's `/api/auth/me` as `roster: [...]` (an empty array on single-
 * account or pre-multi-account sessions).
 *
 * Sessions for peer accounts stay alive in the auth host's DB for the
 * normal 30-day window; once expired, the peer falls out of the roster
 * and the user must re-authenticate to bring it back in.
 */
export interface OcAccountSummary {
    didOc: string;
    displayName: string | null;
    primaryBtc: string | null;
    displayIdentity: DisplayIdentity;
    /** ISO timestamp of the last verified request on this account's
     *  session row, or null if never touched. */
    lastSeenAt: string | null;
}

/**
 * Scope hint for `signOut()` in a multi-account browser.
 *
 *   - 'all'     · sign out of every account in this browser's roster
 *                  (the default; matches the historical single-account
 *                  behavior of "clear the cookie").
 *   - 'current' · sign out of just the active account; if the roster
 *                  has other accounts, the auth host hands you off to
 *                  the next-most-recent one without a re-auth.
 */
export type OcSignOutScope = 'all' | 'current';

export interface OcSessionState {
    status: OcSessionStatus;
    account: OcAccount | null;
    /**
     * Multi-account · other accounts the user has signed into in this
     * browser. `[]` for single-account sessions and for tokens minted
     * before multi-account shipped. The active account (`account`
     * above) is NOT included — these are the *switch targets*.
     */
    roster: OcAccountSummary[];
    /**
     * Per-tab pinning · `true` when this tab holds its own session
     * token (sessionStorage) and operates as `account` independently of
     * the shared `.ochk.io` cookie — i.e. switching accounts in another
     * tab will NOT change this tab's identity. `false` on hosts that
     * predate `/api/auth/tab`, in privacy modes without sessionStorage,
     * and while anonymous.
     */
    tabPinned: boolean;
    /** `null` while loading; an `Error` instance when `status === 'error'`. */
    error: Error | null;
    /** Re-fetch the session. Useful after sign-in/sign-out happens elsewhere. */
    refresh: () => Promise<void>;
    /**
     * Trigger a sign-out. By default signs out of EVERY account in the
     * roster (back-compat); pass `{ scope: 'current' }` to sign out of
     * just the active account and stay logged into the next peer.
     */
    signOut: (opts?: { scope?: OcSignOutScope }) => Promise<void>;
    /**
     * Multi-account · flip the active session to a different account
     * in the roster. Resolves once the new cookie has been set and
     * the session has been re-fetched. Throws if the target `did_oc`
     * isn't in the current roster (the user must add it via
     * {@link addAccount} first) or if the auth host is unreachable.
     */
    switchAccount: (didOc: string) => Promise<void>;
    /**
     * Multi-account · open the sign-in flow in "add" mode — the new
     * account joins the current browser's roster instead of replacing
     * it. Returns the URL to navigate to (so callers can mount it in
     * a popup or hard-navigate as they prefer); pass `returnTo` to
     * route back to a specific page after the add completes.
     */
    addAccountUrl: (returnTo?: string) => string;
    /**
     * Promote a linked identity to be the account-badge label across
     * every `.ochk.io` site. PATCHes the auth host, which re-mints the
     * session cookie with the new `display_identity` claim, then
     * `refresh()`es this session. Rejects if the chosen kind is not a
     * verified identity on the account (`btc` / `email` / `nostr` must
     * actually be linked; `did` is always valid).
     */
    setDisplayIdentity: (kind: DisplayIdentityKind) => Promise<void>;
    /** URL to navigate to for sign-in on the auth host. */
    signInUrl: string;
}

export interface OcAuthConfig {
    /**
     * Origin of the auth host — the subdomain that runs the sign-in UI,
     * issues session cookies, and exposes `/api/auth/me` + `/api/auth/logout`.
     *
     * Defaults to `https://ochk.io`. Override in preview/dev.
     */
    authOrigin?: string;
    /**
     * Path on the auth host that accepts `?return_to=<url>` and drives the
     * sign-in flow. The page offers two paths in-place:
     *
     *   - email + OTP (default — federation-custodied wallet provisioned
     *     for the user; identity is `did:email:<sha256(email)>`)
     *   - BIP-322 wallet sign (paste address → in-page wallet sign;
     *     identity is the Bitcoin address itself)
     *
     * Defaults to `/signin`.
     */
    signInPath?: string;
    /**
     * Local path (same origin as the current app) that exposes the
     * crypto-verified session. If your app ships one at `/api/auth/me`,
     * leave as default. Returns 200 `{ account }` or 401.
     */
    mePath?: string;
    /**
     * Path on the auth host to hit to clear the session cookie.
     * Defaults to `/api/auth/logout`. Called with `credentials: 'include'`
     * so the `.ochk.io` cookie is sent along.
     */
    logoutPath?: string;
}

export const DEFAULT_CONFIG: Required<OcAuthConfig> = {
    authOrigin: 'https://ochk.io',
    signInPath: '/signin',
    mePath: '/api/auth/me',
    logoutPath: '/api/auth/logout',
};

export function resolveConfig(cfg: OcAuthConfig | undefined): Required<OcAuthConfig> {
    return { ...DEFAULT_CONFIG, ...(cfg ?? {}) };
}

export function buildSignInUrl(cfg: Required<OcAuthConfig>, returnTo?: string): string {
    const base = `${cfg.authOrigin}${cfg.signInPath}`;
    if (!returnTo) return base;
    const u = new URL(base);
    u.searchParams.set('return_to', returnTo);
    return u.toString();
}

/**
 * Multi-account · build the URL for the "add another account" entry
 * point. Same as {@link buildSignInUrl} but appends `?add=1` so the
 * sign-in page knows to preserve the current roster (the new account
 * is appended; the previously-active account stays signed in too and
 * remains switch-target reachable).
 */
export function buildAddAccountUrl(cfg: Required<OcAuthConfig>, returnTo?: string): string {
    const u = new URL(buildSignInUrl(cfg, returnTo));
    u.searchParams.set('add', '1');
    return u.toString();
}
