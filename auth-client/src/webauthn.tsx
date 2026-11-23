/**
 * WebAuthn / passkey hooks for OrangeCheck consumer subdomains.
 *
 * Four hooks, all routing through the auth host (rpId='ochk.io'):
 *
 *   - `useWebAuthnRegister()` — bind a hardware key to the account, and
 *                                with `bind`, let it sign in.
 *   - `usePasskeySignIn()`    — sign in with a passkey that can.
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

import { passkeyCeremony, type PasskeyKind } from './passkey';
import { useOcSession, useOptionalOcSession } from './provider';
import type { OcAccount } from './types';
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
    | {
          ok: true;
          credential: WebAuthnCredentialPublic;
          /** Present when ochk.io offered a binding: whether the key now signs in, and why not. */
          binding?: { ok: true } | { ok: false; reason: string };
      }
    | { ok: false; reason: string };

/**
 * Signs `statement` with the wallet that holds `address`, BIP-322, e.g.
 * `(statement, address) => getSigner(walletId, { address })(statement)` from
 * `@orangecheck/wallet-adapter`.
 */
export type BindSigner = (statement: string, address: string) => Promise<string>;

export interface UseWebAuthnRegisterReturn {
    status: WebAuthnRegisterStatus;
    error: Error | null;
    /** With `bind`, an account with a verified Bitcoin address has the wallet sign for
     *  the new key, so it can sign in as well as step up. */
    register: (args?: { label?: string; bind?: BindSigner }) => Promise<WebAuthnRegisterResult>;
    reset: () => void;
}

const BINDING_PREFIX = 'oc-passkey:bind:v1\n';

/** The address a binding statement names, if it is a v1 statement about this very key; else null. */
function bindingAddress(statement: string, credentialId: string): string | null {
    if (!statement.startsWith(BINDING_PREFIX) || !statement.endsWith('\n')) return null;
    const lines = statement.slice(0, -1).split('\n');
    if (lines.length !== 8 || lines[4] !== `credential_id: ${credentialId}`) return null;
    const address = /^address: ([A-Za-z0-9]{14,90})$/.exec(lines[1] ?? '')?.[1];
    return address ?? null;
}

async function bindKey(
    authOrigin: string,
    statement: string,
    credentialId: string,
    sign: BindSigner
): Promise<{ ok: true } | { ok: false; reason: string }> {
    const address = bindingAddress(statement, credentialId);
    if (!address) return { ok: false, reason: 'binding_statement_mismatch' };
    let signature: string;
    try {
        signature = await sign(statement, address);
    } catch {
        return { ok: false, reason: 'cancelled' };
    }
    try {
        const r = await fetch(`${authOrigin}/api/auth/webauthn/bind`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential_id: credentialId, address, signature }),
        });
        const j = (await r.json()) as { ok?: boolean; reason?: string };
        return r.ok && j.ok ? { ok: true } : { ok: false, reason: j.reason ?? `bind_failed_${r.status}` };
    } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
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
        async (args?: { label?: string; bind?: BindSigner }): Promise<WebAuthnRegisterResult> => {
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
                    binding_statement?: unknown;
                    reason?: string;
                };
                if (!verifyRes.ok || !verifyBody.ok || !verifyBody.credential) {
                    const reason = verifyBody.reason ?? `verify_failed_${verifyRes.status}`;
                    setError(new Error(reason));
                    setStatus('error');
                    return { ok: false, reason };
                }
                const statement = verifyBody.binding_statement;
                // The key is registered either way; the binding only lets it sign in too.
                const binding =
                    typeof statement !== 'string'
                        ? undefined
                        : args?.bind
                          ? await bindKey(authOrigin, statement, attestation.id, args.bind)
                          : { ok: false as const, reason: 'not_bound' };
                setStatus('success');
                return { ok: true, credential: verifyBody.credential, ...(binding ? { binding } : {}) };
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

// ─── usePasskeySignIn ───────────────────────────────────────────────────

export type PasskeySignInResult =
    | { ok: true; account: OcAccount; token?: string }
    | { ok: false; reason: string };

export interface UsePasskeySignInReturn {
    status: WebAuthnAssertionStatus;
    error: Error | null;
    /**
     * `signin` (default) needs no session; `layer` adds the passkey to the wallet
     * sign-in this browser just made. `credentials: 'omit'` on a first-party site,
     * which takes the token and sets its own cookie.
     */
    signIn: (args?: {
        kind?: PasskeyKind;
        add?: boolean;
        credentials?: RequestCredentials;
    }) => Promise<PasskeySignInResult>;
    reset: () => void;
}

/**
 * Sign in with a passkey that the account's Bitcoin address has signed for.
 * Never throws: it resolves `{ ok: false, reason }` (`cancelled`,
 * `passkey_not_recognised`, …) and sets `error`. On a family site it then
 * reads the session again, so the page sees who signed in.
 */
export function usePasskeySignIn(opts?: UseHostOptions): UsePasskeySignInReturn {
    const authOrigin = resolveAuthOrigin(opts);
    const refresh = useOptionalOcSession()?.refresh;
    const [status, setStatus] = React.useState<WebAuthnAssertionStatus>('idle');
    const [error, setError] = React.useState<Error | null>(null);

    const reset = React.useCallback(() => {
        setStatus('idle');
        setError(null);
    }, []);

    const signIn = React.useCallback(
        async (args?: {
            kind?: PasskeyKind;
            add?: boolean;
            credentials?: RequestCredentials;
        }): Promise<PasskeySignInResult> => {
            setError(null);
            setStatus('authenticating');
            const credentials = args?.credentials ?? 'include';
            try {
                const r = await passkeyCeremony({
                    authOrigin,
                    kind: args?.kind ?? 'signin',
                    credentials,
                    add: args?.add,
                });
                if (!r.ok) {
                    setError(new Error(r.reason));
                    setStatus('error');
                    return { ok: false, reason: r.reason };
                }
                if (credentials !== 'omit') await refresh?.();
                setStatus('success');
                return { ok: true, account: r.account, ...(r.token ? { token: r.token } : {}) };
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                setError(new Error(reason));
                setStatus('error');
                return { ok: false, reason };
            }
        },
        [authOrigin, refresh]
    );

    return { status, error, signIn, reset };
}

// ─── useWebAuthnList ────────────────────────────────────────────────────

export type WebAuthnRenameResult =
    | { ok: true; credential: WebAuthnCredentialPublic }
    | { ok: false; reason: string };

export type WebAuthnRemoveResult =
    | { ok: true }
    | { ok: false; reason: string };

export interface UseWebAuthnListReturn {
    status: WebAuthnListStatus;
    credentials: WebAuthnCredentialPublic[];
    error: Error | null;
    refetch: () => Promise<void>;
    rename: (id: string, label: string) => Promise<WebAuthnRenameResult>;
    remove: (id: string) => Promise<WebAuthnRemoveResult>;
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
        async (id: string, label: string): Promise<WebAuthnRenameResult> => {
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
                    const reason = j.reason ?? `rename_failed_${r.status}`;
                    setError(new Error(reason));
                    return { ok: false, reason };
                }
                await refetch();
                return { ok: true, credential: j.credential };
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                setError(new Error(reason));
                return { ok: false, reason };
            }
        },
        [authOrigin, refetch]
    );

    const remove = React.useCallback(
        async (id: string): Promise<WebAuthnRemoveResult> => {
            try {
                const r = await fetch(`${authOrigin}/api/auth/webauthn/credentials/${id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                const j = (await r.json()) as { ok: boolean; reason?: string };
                if (!j.ok) {
                    const reason = j.reason ?? `delete_failed_${r.status}`;
                    setError(new Error(reason));
                    return { ok: false, reason };
                }
                await refetch();
                return { ok: true };
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                setError(new Error(reason));
                return { ok: false, reason };
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
 * Never throws. It resolves `{ ok: false, reason }`, and sets `error`, when:
 *   - the user has no credentials registered (`no_credentials_registered`)
 *   - the user cancels the platform prompt (`cancelled`)
 *   - the assertion fails verification on the host (`verify_failed`,
 *     `cloned_authenticator`, `credential_outside_allowlist`, …)
 *
 * Caller pattern. Test `ok`: the result is an object on failure too, so a
 * check like `if (!r)` never stops anything.
 *
 *   const { stepUp } = useStepUpAuth();
 *   const r = await stepUp({ purpose: 'spend_over_1m' });
 *   if (!r.ok) return; // r.reason says why: 'cancelled', 'verify_failed', …
 *   // …proceed with the sensitive action. On success stepUp has already
 *   // refreshed the session, so it carries the new step_up_at.
 *
 * A server still decides with `verifyStepUpClaim`; this check only keeps the
 * page from going on after a failed step-up.
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
