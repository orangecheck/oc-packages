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
}

export type OcSessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface OcSessionState {
    status: OcSessionStatus;
    account: OcAccount | null;
    /** `null` while loading; an `Error` instance when `status === 'error'`. */
    error: Error | null;
    /** Re-fetch the session. Useful after sign-in/sign-out happens elsewhere. */
    refresh: () => Promise<void>;
    /** Trigger a sign-out. Resolves once the cookie has been cleared. */
    signOut: () => Promise<void>;
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
