/**
 * WebAuthn / passkey hooks for OrangeCheck consumer subdomains.
 *
 * Three hooks, all routing through the auth host (rpId='ochk.io'):
 *
 *   - `useWebAuthnRegister()` — bind a hardware key to the account.
 *   - `useWebAuthnList()`     — read + rename + revoke registered keys.
 *   - `useStepUpAuth()`       — prove possession of a key before a
 *                                sensitive action; the auth host
 *                                re-issues the session cookie with a
 *                                fresh `step_up_at` claim.
 *
 * Consumers don't talk to navigator.credentials directly — these hooks
 * own the round-trip to ochk.io + the @simplewebauthn/browser ceremony.
 *
 * Server-side gating is one import away in auth-core's
 * `verifyStepUpClaim(payload, { max_age_secs })`.
 */

import * as React from 'react';
import {
    startAuthentication,
    startRegistration,
    type AuthenticationResponseJSON,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialRequestOptionsJSON,
    type RegistrationResponseJSON,
} from '@simplewebauthn/browser';

import { useOcSession } from './provider';
import { resolveConfig, type OcAuthConfig } from './types';

// ─── Shared types ───────────────────────────────────────────────────────

export interface WebAuthnCredentialPublic {
    id: string;
    label: string;
    authenticator_type: 'platform' | 'cross-platform' | 'unknown';
    transports: string[];
    user_verified: boolean;
    created_at: string;
    last_used_at: string | null;
}

export type WebAuthnRegisterStatus =
    | 'idle'
    | 'requesting-options'
    | 'authenticating'
    | 'verifying'
    | 'success'
    | 'error';

export type WebAuthnAssertionStatus = WebAuthnRegisterStatus;
export type WebAuthnListStatus = 'loading' | 'ready' | 'error';

interface UseHostOptions {
    /** Override the auth host origin. Defaults to https://ochk.io.
     *  Same convention as <OcSessionProvider config={{ authOrigin }} />. */
    authOrigin?: string;
}

function resolveAuthOrigin(opts?: UseHostOptions | OcAuthConfig): string {
    if (!opts) return resolveConfig(undefined).authOrigin;
    return resolveConfig(opts as OcAuthConfig).authOrigin;
}

interface OptionsResponse<T> {
    ok: boolean;
    options?: T;
    challenge_token?: string;
    reason?: string;
}

function isAbortError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return /NotAllowed|aborted|cancel|user cancelled/i.test(err.message);
}

// ─── useWebAuthnRegister ────────────────────────────────────────────────

export type WebAuthnRegisterResult =
    | { ok: true; credential: WebAuthnCredentialPublic }
    | { ok: false; reason: string };

export interface UseWebAuthnRegisterReturn {
    status: WebAuthnRegisterStatus;
    error: Error | null;
    register: (args?: { label?: string }) => Promise<WebAuthnRegisterResult>;
    reset: () => void;
}

export function useWebAuthnRegister(opts?: UseHostOptions): UseWebAuthnRegisterReturn {
    const authOrigin = resolveAuthOrigin(opts);
    const [status, setStatus] = React.useState<WebAuthnRegisterStatus>('idle');
    const [error, setError] = React.useState<Error | null>(null);

    const reset = React.useCallback(() => {
        setStatus('idle');
        setError(null);
    }, []);

    const register = React.useCallback(
        async (args?: { label?: string }): Promise<WebAuthnRegisterResult> => {
            setError(null);
            setStatus('requesting-options');
            try {
                const optsRes = await fetch(`${authOrigin}/api/auth/webauthn/register/options`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label: args?.label }),
                });
                const optsBody = (await optsRes.json()) as OptionsResponse<PublicKeyCredentialCreationOptionsJSON>;
                if (!optsRes.ok || !optsBody.ok || !optsBody.options || !optsBody.challenge_token) {
                    const reason = optsBody.reason ?? `options_failed_${optsRes.status}`;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                setStatus('authenticating');
                let attestation: RegistrationResponseJSON;
                try {
                    attestation = await startRegistration({ optionsJSON: optsBody.options });
                } catch (e) {
                    const reason = isAbortError(e) ? 'cancelled' : (e as Error).message;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                setStatus('verifying');
                const verifyRes = await fetch(`${authOrigin}/api/auth/webauthn/register/verify`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        challenge_token: optsBody.challenge_token,
                        response: attestation,
                        label: args?.label,
                    }),
                });
                const verifyBody = (await verifyRes.json()) as {
                    ok: boolean;
                    credential?: WebAuthnCredentialPublic;
                    reason?: string;
                };
                if (!verifyRes.ok || !verifyBody.ok || !verifyBody.credential) {
                    const reason = verifyBody.reason ?? `verify_failed_${verifyRes.status}`;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                setStatus('success');
                return { ok: true, credential: verifyBody.credential };
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                setError(new Error(reason));
                setStatus('error');
                return { ok: false, reason };
            }
        },
        [authOrigin]
    );

    return { status, error, register, reset };
}

// ─── useWebAuthnList ────────────────────────────────────────────────────

export interface UseWebAuthnListReturn {
    status: WebAuthnListStatus;
    credentials: WebAuthnCredentialPublic[];
    error: Error | null;
    refetch: () => Promise<void>;
    rename: (id: string, label: string) => Promise<WebAuthnCredentialPublic | null>;
    remove: (id: string) => Promise<boolean>;
}

export function useWebAuthnList(opts?: UseHostOptions): UseWebAuthnListReturn {
    const authOrigin = resolveAuthOrigin(opts);
    const { status: sessionStatus } = useOcSession();
    const [credentials, setCredentials] = React.useState<WebAuthnCredentialPublic[]>([]);
    const [status, setStatus] = React.useState<WebAuthnListStatus>('loading');
    const [error, setError] = React.useState<Error | null>(null);

    const refetch = React.useCallback(async () => {
        setError(null);
        if (sessionStatus !== 'authenticated') {
            setCredentials([]);
            setStatus('ready');
            return;
        }
        setStatus('loading');
        try {
            const r = await fetch(`${authOrigin}/api/auth/webauthn/credentials`, {
                credentials: 'include',
            });
            if (r.status === 401) {
                setCredentials([]);
                setStatus('ready');
                return;
            }
            const j = (await r.json()) as {
                ok: boolean;
                credentials?: WebAuthnCredentialPublic[];
                reason?: string;
            };
            if (!j.ok || !j.credentials) {
                throw new Error(j.reason ?? 'list_failed');
            }
            setCredentials(j.credentials);
            setStatus('ready');
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setStatus('error');
        }
    }, [authOrigin, sessionStatus]);

    React.useEffect(() => {
        void refetch();
    }, [refetch]);

    const rename = React.useCallback(
        async (id: string, label: string) => {
            try {
                const r = await fetch(`${authOrigin}/api/auth/webauthn/credentials/${id}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label }),
                });
                const j = (await r.json()) as {
                    ok: boolean;
                    credential?: WebAuthnCredentialPublic;
                    reason?: string;
                };
                if (!j.ok || !j.credential) {
                    setError(new Error(j.reason ?? 'rename_failed'));
                    return null;
                }
                await refetch();
                return j.credential;
            } catch (e) {
                setError(e instanceof Error ? e : new Error(String(e)));
                return null;
            }
        },
        [authOrigin, refetch]
    );

    const remove = React.useCallback(
        async (id: string) => {
            try {
                const r = await fetch(`${authOrigin}/api/auth/webauthn/credentials/${id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                const j = (await r.json()) as { ok: boolean; reason?: string };
                if (!j.ok) {
                    setError(new Error(j.reason ?? 'delete_failed'));
                    return false;
                }
                await refetch();
                return true;
            } catch (e) {
                setError(e instanceof Error ? e : new Error(String(e)));
                return false;
            }
        },
        [authOrigin, refetch]
    );

    return { status, credentials, error, refetch, rename, remove };
}

// ─── useStepUpAuth ──────────────────────────────────────────────────────

export type WebAuthnStepUpResult =
    | { ok: true; step_up_at: number }
    | { ok: false; reason: string };

export interface UseStepUpAuthReturn {
    status: WebAuthnAssertionStatus;
    error: Error | null;
    stepUp: (args: { purpose: string }) => Promise<WebAuthnStepUpResult>;
    reset: () => void;
}

/**
 * Prove possession of a registered hardware key before a sensitive
 * action. On success the auth host sets a fresh oc_session cookie
 * carrying `step_up_at = <unix-now>`; the provider re-fetches the
 * session so `verifyStepUpClaim(payload, …)` flips to true immediately.
 *
 * Throws via `error` (not via `throw`) when:
 *   - the user has no credentials registered (`no_credentials_registered`)
 *   - the user cancels the platform prompt (`cancelled`)
 *   - the assertion fails verification on the host (`verify_failed`,
 *     `cloned_authenticator`, `credential_outside_allowlist`, …)
 *
 * Caller pattern:
 *
 *   const { stepUp } = useStepUpAuth();
 *   const { refresh } = useOcSession();
 *   const r = await stepUp({ purpose: 'spend_over_1m' });
 *   if (!r) return; // user cancelled or step-up failed
 *   await refresh(); // pick up the new step_up_at
 *   // …proceed with the sensitive action
 */
export function useStepUpAuth(opts?: UseHostOptions): UseStepUpAuthReturn {
    const authOrigin = resolveAuthOrigin(opts);
    const { refresh } = useOcSession();
    const [status, setStatus] = React.useState<WebAuthnAssertionStatus>('idle');
    const [error, setError] = React.useState<Error | null>(null);

    const reset = React.useCallback(() => {
        setStatus('idle');
        setError(null);
    }, []);

    const stepUp = React.useCallback(
        async (args: { purpose: string }): Promise<WebAuthnStepUpResult> => {
            setError(null);
            setStatus('requesting-options');
            try {
                const optsRes = await fetch(`${authOrigin}/api/auth/webauthn/assertion/options`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ purpose: args.purpose }),
                });
                const optsBody = (await optsRes.json()) as OptionsResponse<PublicKeyCredentialRequestOptionsJSON>;
                if (!optsRes.ok || !optsBody.ok || !optsBody.options || !optsBody.challenge_token) {
                    const reason = optsBody.reason ?? `options_failed_${optsRes.status}`;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                setStatus('authenticating');
                let assertion: AuthenticationResponseJSON;
                try {
                    assertion = await startAuthentication({ optionsJSON: optsBody.options });
                } catch (e) {
                    const reason = isAbortError(e) ? 'cancelled' : (e as Error).message;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                setStatus('verifying');
                const verifyRes = await fetch(
                    `${authOrigin}/api/auth/webauthn/assertion/verify`,
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            challenge_token: optsBody.challenge_token,
                            response: assertion,
                        }),
                    }
                );
                const verifyBody = (await verifyRes.json()) as {
                    ok: boolean;
                    step_up_at?: number;
                    reason?: string;
                };
                if (!verifyRes.ok || !verifyBody.ok || typeof verifyBody.step_up_at !== 'number') {
                    const reason = verifyBody.reason ?? `verify_failed_${verifyRes.status}`;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                // Re-fetch the session so consumers see the fresh
                // step_up_at claim without a separate `refresh()` call.
                await refresh();
                setStatus('success');
                return { ok: true, step_up_at: verifyBody.step_up_at };
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                setError(new Error(reason));
                setStatus('error');
                return { ok: false, reason };
            }
        },
        [authOrigin, refresh]
    );

    return { status, error, stepUp, reset };
}
