import * as React from 'react';

import {
    buildAddAccountUrl,
    buildSignInUrl,
    DEFAULT_CONFIG,
    DISPLAY_IDENTITY_KINDS,
    resolveConfig,
    type DisplayIdentity,
    type DisplayIdentityKind,
    type OcAccount,
    type OcAccountSummary,
    type OcAuthConfig,
    type OcSessionState,
    type OcSignOutScope,
} from './types';

const SessionContext = React.createContext<OcSessionState | null>(null);

type RawSigningMethod = 'fedimint_threshold' | 'fedimint_client' | 'bip322';

interface RawRosterEntry {
    did_oc?: string;
    didOc?: string;
    display_name?: string | null;
    displayName?: string | null;
    primary_btc?: string | null;
    primaryBtc?: string | null;
    display_identity?: { kind?: string; value?: string } | null;
    displayIdentity?: { kind?: string; value?: string } | null;
    last_seen_at?: string | null;
    lastSeenAt?: string | null;
}

interface MeResponse {
    account?: {
        id?: string;
        account_id?: string;
        accountId?: string;
        did_oc?: string;
        didOc?: string;
        primary_btc?: string | null;
        primaryBtc?: string | null;
        has_email?: boolean;
        hasEmail?: boolean;
        display_name?: string | null;
        displayName?: string | null;
        nostr_npub?: string | null;
        nostrNpub?: string | null;
        home_federation_slug?: string | null;
        homeFederation?: string | null;
        signing_method?: RawSigningMethod | null;
        signingMethod?: RawSigningMethod | null;
        is_owner?: boolean;
        isOwner?: boolean;
        display_identity?: { kind?: string; value?: string } | null;
        displayIdentity?: { kind?: string; value?: string } | null;
    };
    /** Multi-account roster · other accounts in this browser. Absent
     *  on hosts that haven't deployed the multi-account migration yet
     *  — treated as `[]` (single-account fallback). */
    roster?: RawRosterEntry[];
}

/**
 * Resolve the badge identity from a `/api/auth/me` account payload.
 * Total: returns the carried `{kind,value}` when well-formed, else
 * `{kind:'did',value:didOc}` — so accounts that never promoted, and
 * sessions minted before the field shipped, degrade cleanly.
 */
function normalizeDisplayIdentity(
    raw: NonNullable<MeResponse['account']>,
    didOc: string
): DisplayIdentity {
    const di = raw.display_identity ?? raw.displayIdentity;
    if (
        di &&
        typeof di === 'object' &&
        typeof di.value === 'string' &&
        di.value.length > 0 &&
        typeof di.kind === 'string' &&
        (DISPLAY_IDENTITY_KINDS as readonly string[]).includes(di.kind)
    ) {
        return { kind: di.kind as DisplayIdentityKind, value: di.value };
    }
    return { kind: 'did', value: didOc };
}

/**
 * Multi-account · normalize one roster entry from /api/auth/me. Drops
 * entries with no did_oc (defensive — the host shouldn't emit those).
 */
function normalizeRosterEntry(raw: RawRosterEntry): OcAccountSummary | null {
    const didOc = raw.did_oc ?? raw.didOc;
    if (!didOc) return null;
    const di = raw.display_identity ?? raw.displayIdentity;
    const displayIdentity: DisplayIdentity =
        di &&
        typeof di === 'object' &&
        typeof di.value === 'string' &&
        di.value.length > 0 &&
        typeof di.kind === 'string' &&
        (DISPLAY_IDENTITY_KINDS as readonly string[]).includes(di.kind)
            ? { kind: di.kind as DisplayIdentityKind, value: di.value }
            : { kind: 'did', value: didOc };
    return {
        didOc,
        displayName: raw.display_name ?? raw.displayName ?? null,
        primaryBtc: raw.primary_btc ?? raw.primaryBtc ?? null,
        displayIdentity,
        lastSeenAt: raw.last_seen_at ?? raw.lastSeenAt ?? null,
    };
}

function normalizeAccount(raw: MeResponse['account']): OcAccount | null {
    if (!raw) return null;
    const didOc = raw.did_oc ?? raw.didOc;
    const accountId = raw.id ?? raw.account_id ?? raw.accountId;
    if (!didOc || !accountId) return null;
    return {
        accountId,
        didOc,
        primaryBtc: raw.primary_btc ?? raw.primaryBtc ?? null,
        hasEmail: raw.has_email ?? raw.hasEmail ?? false,
        displayName: raw.display_name ?? raw.displayName ?? null,
        nostrNpub: raw.nostr_npub ?? raw.nostrNpub ?? null,
        homeFederation: raw.home_federation_slug ?? raw.homeFederation ?? null,
        signingMethod: raw.signing_method ?? raw.signingMethod ?? null,
        isOwner: Boolean(raw.is_owner ?? raw.isOwner ?? false),
        displayIdentity: normalizeDisplayIdentity(raw, didOc),
    };
}

export interface OcSessionProviderProps {
    children: React.ReactNode;
    config?: OcAuthConfig;
    /**
     * Optional return URL passed to the sign-in page. Defaults to the
     * current `window.location.href` at click-time.
     */
    defaultReturnTo?: string;
}

/**
 * Top-level provider that exposes the cross-subdomain oc_session to every
 * component below it. Mount once, near the root of your tree.
 */
export function OcSessionProvider({
    children,
    config,
    defaultReturnTo,
}: OcSessionProviderProps): React.ReactElement {
    const cfg = React.useMemo(() => resolveConfig(config), [config]);
    const [account, setAccount] = React.useState<OcAccount | null>(null);
    const [roster, setRoster] = React.useState<OcAccountSummary[]>([]);
    const [status, setStatus] = React.useState<OcSessionState['status']>('loading');
    const [error, setError] = React.useState<Error | null>(null);

    const refresh = React.useCallback(async () => {
        if (typeof window === 'undefined') return;
        try {
            const res = await fetch(cfg.mePath, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json' },
            });
            if (res.status === 401) {
                setAccount(null);
                setRoster([]);
                setStatus('anonymous');
                setError(null);
                return;
            }
            if (!res.ok) {
                setStatus('error');
                setError(new Error(`me endpoint returned ${res.status}`));
                return;
            }
            const body = (await res.json()) as MeResponse;
            const acct = normalizeAccount(body.account);
            const rosterEntries = Array.isArray(body.roster)
                ? body.roster
                      .map(normalizeRosterEntry)
                      .filter((r): r is OcAccountSummary => r !== null)
                : [];
            setAccount(acct);
            setRoster(rosterEntries);
            setStatus(acct ? 'authenticated' : 'anonymous');
            setError(null);
        } catch (err) {
            setStatus('error');
            setError(err instanceof Error ? err : new Error(String(err)));
        }
    }, [cfg.mePath]);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const signOut = React.useCallback(
        async (opts?: { scope?: OcSignOutScope }) => {
            const scope: OcSignOutScope = opts?.scope ?? 'all';
            try {
                const url = new URL(`${cfg.authOrigin}${cfg.logoutPath}`);
                if (scope === 'current') url.searchParams.set('scope', 'current');
                const res = await fetch(url.toString(), {
                    method: 'POST',
                    credentials: 'include',
                    // `keepalive` lets the logout round-trip complete even if
                    // the caller hard-navigates away in the same tick (e.g.
                    // `<OcAccountMenu>` redirects home immediately on sign-out).
                    // Without it the in-flight request is cancelled on unload
                    // and the `.ochk.io` cookie may never get cleared.
                    keepalive: true,
                });
                // Multi-account: with scope='current', the server may have
                // switched the active session to a roster peer instead of
                // clearing the cookie. Re-fetch /api/auth/me so this
                // provider reflects the new active account; if the body
                // says `switched_to !== null`, refresh resolves to the
                // peer, otherwise it resolves to anonymous and the
                // setState below is redundant-but-harmless.
                if (scope === 'current' && res.ok) {
                    await refresh();
                    return;
                }
            } catch {
                // fall through — we still clear local state so the UI reflects
                // the user's intent even if the server round-trip fails.
            }
            setAccount(null);
            setRoster([]);
            setStatus('anonymous');
        },
        [cfg.authOrigin, cfg.logoutPath, refresh]
    );

    const switchAccount = React.useCallback(
        async (didOc: string) => {
            if (typeof window === 'undefined') return;
            const res = await fetch(`${cfg.authOrigin}/api/auth/switch`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ did_oc: didOc }),
            });
            if (!res.ok) {
                let reason = `http_${res.status}`;
                try {
                    const body = (await res.json()) as { reason?: string };
                    if (body.reason) reason = body.reason;
                } catch {
                    // keep http_ fallback
                }
                throw new Error(`[@orangecheck/auth-client] switchAccount failed: ${reason}`);
            }
            // Cookie has flipped server-side. Re-fetch /me to surface the
            // new active account + freshly computed roster (the previous
            // active account is now a peer, swap is symmetric).
            await refresh();
        },
        [cfg.authOrigin, refresh]
    );

    const addAccountUrl = React.useCallback(
        (returnTo?: string) => {
            const rt =
                returnTo ?? (typeof window !== 'undefined' ? window.location.href : undefined);
            return buildAddAccountUrl(cfg, rt);
        },
        [cfg]
    );

    const setDisplayIdentity = React.useCallback(
        async (kind: DisplayIdentityKind) => {
            if (typeof window === 'undefined') return;
            // PATCH the auth host directly (family-CORS). It writes the
            // pref, re-mints the `.ochk.io` session cookie with the new
            // `display_identity` claim, and Set-Cookies it back — so the
            // choice propagates to every subdomain. Then refresh so this
            // session reflects it immediately.
            const res = await fetch(`${cfg.authOrigin}/api/auth/account`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ display_identity: kind }),
            });
            if (!res.ok) {
                let reason = `http_${res.status}`;
                try {
                    const body = (await res.json()) as { reason?: string };
                    if (body.reason) reason = body.reason;
                } catch {
                    // keep the http_ fallback
                }
                throw new Error(`[@orangecheck/auth-client] setDisplayIdentity failed: ${reason}`);
            }
            await refresh();
        },
        [cfg.authOrigin, refresh]
    );

    const value = React.useMemo<OcSessionState>(() => {
        const returnTo =
            defaultReturnTo ?? (typeof window !== 'undefined' ? window.location.href : undefined);
        return {
            status,
            account,
            roster,
            error,
            refresh,
            signOut,
            switchAccount,
            addAccountUrl,
            setDisplayIdentity,
            signInUrl: buildSignInUrl(cfg, returnTo),
        };
    }, [
        status,
        account,
        roster,
        error,
        refresh,
        signOut,
        switchAccount,
        addAccountUrl,
        setDisplayIdentity,
        cfg,
        defaultReturnTo,
    ]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Access the current cross-subdomain oc_session. Must be called inside
 * an `<OcSessionProvider>`.
 */
export function useOcSession(): OcSessionState {
    const ctx = React.useContext(SessionContext);
    if (!ctx) {
        throw new Error(
            '[@orangecheck/auth-client] useOcSession() must be called inside <OcSessionProvider>'
        );
    }
    return ctx;
}

/**
 * Non-throwing variant — returns `null` if called outside a provider.
 * Useful for libraries that want to read the session *if it exists* but
 * shouldn't crash on apps that haven't opted in.
 */
export function useOptionalOcSession(): OcSessionState | null {
    return React.useContext(SessionContext);
}

export { DEFAULT_CONFIG };
