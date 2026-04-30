import * as React from 'react';

import { session } from './session';
import type { Session, SessionPolicy } from './types';

export interface OcSignInButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onError'> {
    scope: string[];
    sessionPolicy?: Partial<SessionPolicy>;
    returnTo?: string;
    onSignin?: (session: Session) => void;
    /** Called when the sign-in flow fails. Renamed from `onError` to avoid
     *  shadowing the native button error handler. */
    onSignInError?: (error: Error) => void;
    /** Custom button text. Defaults to "sign in with oc". */
    label?: string;
}

/**
 * Drop-in Sign-in-with-OC button. Triggers the me.ochk.io consent flow
 * for the requested scope, opens (or refreshes) a session, and calls
 * onSignin(session) on success. Class C billable event for the
 * integrating site; cashback flows to the user.
 *
 * Mounting requires <OcSessionProvider> from @orangecheck/auth-client
 * somewhere up the React tree so the resulting session can be read by
 * useOcSession() across the rest of the app.
 */
export function OcSignInButton({
    scope,
    sessionPolicy,
    returnTo,
    onSignin,
    onSignInError,
    label = 'sign in with oc',
    children,
    onClick,
    style,
    ...rest
}: OcSignInButtonProps) {
    const [pending, setPending] = React.useState(false);

    return (
        <button
            type="button"
            onClick={async (event) => {
                onClick?.(event);
                if (event.defaultPrevented) return;
                setPending(true);
                try {
                    const result = await session.create({ scope, sessionPolicy, returnTo });
                    onSignin?.(result);
                } catch (err) {
                    onSignInError?.(err instanceof Error ? err : new Error(String(err)));
                } finally {
                    setPending(false);
                }
            }}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                background: '#f97316',
                color: '#0b0909',
                border: '1px solid #f97316',
                borderRadius: 4,
                cursor: pending ? 'progress' : 'pointer',
                opacity: pending ? 0.7 : 1,
                ...(style ?? {}),
            }}
            disabled={pending || rest.disabled}
            data-oc-signin
            {...rest}
        >
            {/* compact OC mark */}
            <span
                aria-hidden
                style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    background: '#0b0909',
                }}
            />
            {children ?? (pending ? 'opening…' : label)}
        </button>
    );
}
