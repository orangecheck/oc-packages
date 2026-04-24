import * as React from 'react';

import { useOcSession } from './provider';

function shortenAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export interface OcSignInButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    /** Label shown when no user is signed in. Defaults to `sign in with bitcoin`. */
    label?: string;
    /**
     * When `true`, render an `<a>` even while the session is loading, to
     * avoid layout shift. Defaults to `false` (renders nothing while loading).
     */
    eager?: boolean;
}

/**
 * Drop-in sign-in button. Renders an anchor that deep-links to the auth
 * host's sign-in page with the current URL as `?return_to=…`.
 *
 * When the user is already authenticated it renders nothing — wrap it in
 * a conditional or use `<OcAccountPill>` as the signed-in affordance.
 */
export function OcSignInButton({
    label = 'sign in with bitcoin',
    eager = false,
    className,
    ...rest
}: OcSignInButtonProps): React.ReactElement | null {
    const { status, signInUrl } = useOcSession();
    if (status === 'authenticated') return null;
    if (!eager && status === 'loading') return null;

    return (
        <a
            {...rest}
            href={signInUrl}
            className={className}
            data-oc-sign-in-button=""
        >
            {label}
        </a>
    );
}

export interface OcAccountPillProps extends React.HTMLAttributes<HTMLDivElement> {
    /** URL to link the address to. Defaults to the auth origin's `/dashboard`. */
    dashboardUrl?: string;
    /** Override the display text. Defaults to the shortened address. */
    render?: (account: { address: string; displayName?: string | null }) => React.ReactNode;
}

/**
 * Shows the signed-in user as a short pill: `bc1q…abcd  sign out`.
 *
 * Renders nothing while loading or when no user is signed in — pair with
 * `<OcSignInButton>` for the anonymous case.
 */
export function OcAccountPill({
    dashboardUrl,
    render,
    className,
    ...rest
}: OcAccountPillProps): React.ReactElement | null {
    const { status, account, signOut } = useOcSession();

    if (status !== 'authenticated' || !account) return null;

    const label = render
        ? render({ address: account.address, displayName: account.displayName })
        : (account.displayName ?? shortenAddress(account.address));

    return (
        <div
            {...rest}
            className={className}
            data-oc-account-pill=""
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', ...(rest.style ?? {}) }}
        >
            {dashboardUrl ? (
                <a href={dashboardUrl}>{label}</a>
            ) : (
                <span>{label}</span>
            )}
            <button
                type="button"
                onClick={() => {
                    void signOut();
                }}
                aria-label="Sign out"
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                    padding: 0,
                }}
            >
                sign out
            </button>
        </div>
    );
}
