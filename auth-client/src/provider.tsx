import * as React from 'react';

import {
    buildSignInUrl,
    DEFAULT_CONFIG,
    resolveConfig,
    type OcAccount,
    type OcAuthConfig,
    type OcSessionState,
} from './types';

const SessionContext = React.createContext<OcSessionState | null>(null);

type RawSigningMethod = 'fedimint_threshold' | 'fedimint_client' | 'bip322';

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
            setAccount(acct);
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

    const signOut = React.useCallback(async () => {
        try {
            await fetch(`${cfg.authOrigin}${cfg.logoutPath}`, {
                method: 'POST',
                credentials: 'include',
            });
        } catch {
            // fall through — we still clear local state so the UI reflects
            // the user's intent even if the server round-trip fails.
        }
        setAccount(null);
        setStatus('anonymous');
    }, [cfg.authOrigin, cfg.logoutPath]);

    const value = React.useMemo<OcSessionState>(() => {
        const returnTo =
            defaultReturnTo ?? (typeof window !== 'undefined' ? window.location.href : undefined);
        return {
            status,
            account,
            error,
            refresh,
            signOut,
            signInUrl: buildSignInUrl(cfg, returnTo),
        };
    }, [status, account, error, refresh, signOut, cfg, defaultReturnTo]);

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
