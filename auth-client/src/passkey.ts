/**
 * The passkey sign-in ceremony against ochk.io's `/api/auth/passkey/*`.
 * `signin` needs no session: the passkey is discoverable and names its account.
 *
 * Only a passkey its account's Bitcoin address has signed for can sign in;
 * ochk.io answers `passkey_not_recognised` for any other.
 */

import {
    startAuthentication,
    WebAuthnAbortService,
    type AuthenticationResponseJSON,
    type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import type { OcAccount } from './types';

/** Which passkey a site asks for. `off` asks for none. */
export type PasskeyPath = 'off' | 'with' | 'only';

export type PasskeyKind = 'signin';

export type PasskeyCeremonyResult =
    | { ok: true; account: OcAccount; token?: string }
    /** `step` says where it stopped: a refusal at `verify` came after the person chose a passkey. */
    | { ok: false; reason: string; step: 'options' | 'prompt' | 'verify' };

// A page runs one WebAuthn ceremony at a time, and starting one aborts the
// last: autofill waits on the fetch, so it must not start over a prompt.
let prompting = 0;

/** Stop the email field's passkey autofill, and never a passkey prompt the person opened. */
export function cancelPasskeyAutofill(): void {
    if (prompting === 0) WebAuthnAbortService.cancelCeremony();
}

function isCancel(err: unknown): boolean {
    return err instanceof Error && /NotAllowed|Abort|aborted|cancel/i.test(`${err.name} ${err.message}`);
}

/** Tell the browser's passkey manager a key ochk.io no longer knows, where it has the call (WebAuthn L3 §5.1.10.2). */
function signalUnknown(rpId: string | undefined, credentialId: string): void {
    const pkc = (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential as
        | { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> }
        | undefined;
    if (!rpId || typeof pkc?.signalUnknownCredential !== 'function') return;
    void pkc.signalUnknownCredential({ rpId, credentialId }).catch(() => {});
}

/**
 * Run one passkey ceremony. Resolves a refusal or a cancel; throws only when
 * ochk.io cannot be reached or answers something that is not JSON.
 */
export async function passkeyCeremony(args: {
    authOrigin: string;
    kind: PasskeyKind;
    credentials: RequestCredentials;
    add?: boolean;
    /** Offer the passkey in the email field's autofill (conditional mediation) rather than a prompt. */
    autofill?: boolean;
}): Promise<PasskeyCeremonyResult> {
    const { authOrigin, kind, credentials } = args;
    const optsRes = await fetch(`${authOrigin}/api/auth/passkey/options`, {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...(args.add ? { add: true } : {}) }),
    });
    const opts = (await optsRes.json()) as {
        ok?: boolean;
        options?: PublicKeyCredentialRequestOptionsJSON;
        challenge_token?: string;
        reason?: string;
    };
    if (!optsRes.ok || !opts.ok || !opts.options || !opts.challenge_token) {
        return { ok: false, reason: opts.reason ?? `options_failed_${optsRes.status}`, step: 'options' };
    }
    const autofill = args.autofill === true;
    if (autofill && prompting > 0) return { ok: false, reason: 'cancelled', step: 'prompt' };
    let response: AuthenticationResponseJSON;
    if (!autofill) prompting++;
    try {
        response = await startAuthentication({ optionsJSON: opts.options, useBrowserAutofill: autofill });
    } catch (err) {
        return { ok: false, reason: isCancel(err) ? 'cancelled' : 'passkey_failed', step: 'prompt' };
    } finally {
        if (!autofill) prompting--;
    }
    const verifyRes = await fetch(`${authOrigin}/api/auth/passkey/verify`, {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_token: opts.challenge_token, response }),
    });
    const body = (await verifyRes.json()) as {
        ok?: boolean;
        account?: OcAccount;
        token?: string;
        reason?: string;
    };
    if (!verifyRes.ok || !body.ok || !body.account) {
        const reason = body.reason ?? `verify_failed_${verifyRes.status}`;
        if (reason === 'passkey_not_recognised') signalUnknown(opts.options.rpId, response.id);
        return { ok: false, reason, step: 'verify' };
    }
    return { ok: true, account: body.account, ...(body.token ? { token: body.token } : {}) };
}
