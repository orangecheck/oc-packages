/**
 * What a refused or failed call to the auth host says to a person. Sign-in
 * and linking read the same reasons from the same host, so they share these.
 */

import { ownWord } from './own-word';

/**
 * A sign-in the person's own sign-out or account deletion ended while it ran,
 * by any way in. `no_roster`: a sign-out elsewhere in this browser replaced
 * the account list this sign-in was joining, so the host kept no session.
 */
const ENDED_ERRORS: Record<string, string> = {
    signed_out: 'You were signed out while signing in. Sign in again.',
    account_deleted: "This account is being deleted, so you can't sign in to it.",
    no_roster:
        "An account in this browser was signed out while you were signing in, so this sign-in wasn't kept. Sign in again.",
};

export function endedSigninText(reason: string): string | undefined {
    return ownWord(ENDED_ERRORS, reason);
}

/**
 * An add refused because this browser sent more than one ochk.io sign-in. The
 * host cleared the extra cookies and spent nothing, so the same try can go
 * again once the person sees which account is signed in now.
 */
export const SEVERAL_SESSIONS_TEXT =
    "Your browser sent more than one ochk.io sign-in, so this account wasn't added. Check which account is signed in now, then try again.";

/**
 * A sign-out or an account switch ochk.io refused for the same reason. It
 * cleared the extra cookies and ended or switched nothing, so the provider
 * reads the session again and the page shows the account left signed in.
 */
export const SIGN_OUT_SEVERAL_SESSIONS_TEXT =
    "Your browser sent more than one ochk.io sign-in, so you weren't signed out. Check which account is signed in now, then try again.";
export const SWITCH_SEVERAL_SESSIONS_TEXT =
    "Your browser sent more than one ochk.io sign-in, so the account wasn't switched. Check which account is signed in now, then try again.";

/** True when an auth host answer is ochk.io's 409 `several_sessions`. */
export async function isSeveralSessionsAnswer(res: Response): Promise<boolean> {
    if (res.status !== 409) return false;
    try {
        const body = (await res.clone().json()) as { reason?: unknown } | null;
        return body?.reason === 'several_sessions';
    } catch {
        return false;
    }
}

/** True when a sign-in call threw ochk.io's `several_sessions` refusal. */
export function isSeveralSessions(err: unknown): boolean {
    return err instanceof Error && err.message === 'several_sessions';
}

/**
 * The auth host answers with machine reasons. Its /api/auth/signin says it
 * exposes them "so the /signin UI can give an actionable message", and this
 * form printed them verbatim instead: typing "hello" as an address showed
 * `bad_request`. Each reason maps to what happened and what to do next.
 */
const SIGNIN_ERRORS: Record<string, string> = {
    bad_request: "That doesn't look like a Bitcoin address.",
    invalid_challenge:
        "That signature doesn't match this address. Sign with the wallet that holds it.",
    sig_invalid: "That signature doesn't match this address. Sign with the wallet that holds it.",
    sig_unsupported_scheme:
        "We can't check this wallet's signature format yet. Try another wallet, or use email.",
    expired: 'That request timed out. Try again for a fresh one.',
    not_yet_valid: 'That request is not valid yet. Check your device clock, then try again.',
    nonce_mismatch: "That request didn't match. Try again for a fresh one.",
    audience_mismatch: "That request didn't match this site. Reload the page and try again.",
    purpose_mismatch: "That request didn't match. Try again for a fresh one.",
    malformed: "That signature couldn't be read. Copy it again, whole.",
    challenge_mismatch:
        'That sign-in message changed after it was issued. Get a new one and sign it again.',
    mainnet_only: 'Sign in with a mainnet Bitcoin address.',
    cross_site_blocked: 'Your browser blocked this request. Reload the page and try again.',
    rate_limited: 'Too many tries. Wait a minute, then try again.',
    invalid_email: "That email address doesn't look right.",
    mailer_unavailable: "We couldn't send the email right now. Try again in a minute.",
    mailer_error: "We couldn't send the email right now. Try again in a minute.",
    wrong_code: "That code isn't right. Check the newest email from us.",
    replay: 'That code was already used. Send a new one.',
    invalid_token: 'That code is no longer valid. Send a new one.',
    email_mismatch: 'That code was sent to a different address. Send a new one.',
    several_sessions: SEVERAL_SESSIONS_TEXT,
    ...ENDED_ERRORS,
};

const EMAIL_ERRORS: Record<string, string> = {
    expired: 'That code expired. Send a new one.',
    signed_out: 'You were signed out while signing in. Send a new code to sign in again.',
    no_roster:
        "An account in this browser was signed out while you were signing in, so this sign-in wasn't kept. Send a new code to sign in again.",
};

/**
 * `bad_request` means the host's body schema failed. Fetching a challenge
 * that is the address; submitting a signature it is the pasted signature
 * (under 10 characters, say), which is not an address problem at all.
 */
const SUBMIT_ERRORS: Record<string, string> = {
    bad_request: "That signature couldn't be read. Copy it again, whole.",
};

/** The auth host by name, so an outage reads as theirs and not the page's. */
export function networkError(authOrigin: string): string {
    let host = authOrigin;
    try {
        host = new URL(authOrigin).host;
    } catch {
        // not a URL: name it as given
    }
    return `We couldn't reach the orangecheck sign-in service at ${host}. Check your connection, then try again.`;
}

export function humanSigninError(
    reason: string,
    path: 'wallet' | 'email',
    step: 'challenge' | 'submit' = 'challenge'
): string {
    // A reason that is not a code is already a sentence.
    if (!/^[a-z0-9_]+$/.test(reason)) return reason;
    const own =
        (path === 'wallet' && step === 'submit' && ownWord(SUBMIT_ERRORS, reason)) ||
        (path === 'email' && ownWord(EMAIL_ERRORS, reason));
    if (own) return own;
    return (
        ownWord(SIGNIN_ERRORS, reason) ??
        (path === 'email'
            ? "That didn't work. Try again, or send a new code."
            : "That didn't work. Try again.")
    );
}

/**
 * A failed fetch ("Failed to fetch") or an HTML error page parsed as JSON
 * (a SyntaxError) is not prose meant for a person; everything else thrown
 * here carries a host reason code. A wallet's failure never comes here.
 */
export function failureMessage(
    err: unknown,
    path: 'wallet' | 'email',
    step: 'challenge' | 'submit',
    authOrigin: string
): string {
    if (err instanceof TypeError || err instanceof SyntaxError) return networkError(authOrigin);
    return humanSigninError(err instanceof Error ? err.message : 'failed', path, step);
}
