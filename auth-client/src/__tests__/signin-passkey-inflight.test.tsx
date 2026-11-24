/**
 * @vitest-environment jsdom
 *
 * A passkey ceremony that is still running when the email field goes: a sign-in
 * ochk.io has already made still reaches the host, and a prompt the person opened
 * is never cancelled by the field's autofill. Its own file, because a prompt held
 * open by another file's test would hold the module's prompt count.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));
vi.mock('@simplewebauthn/browser', () => ({
    startAuthentication: vi.fn(),
    browserSupportsWebAuthnAutofill: vi.fn(async () => false),
    WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));

import * as simpleWa from '@simplewebauthn/browser';

import { cancelPasskeyAutofill, passkeyCeremony } from '../passkey';
import { OcSignIn } from '../signin';

const OPTIONS = { challenge: 'CHP', rpId: 'ochk.io', allowCredentials: [], userVerification: 'required' };
const ASSERTION = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };
const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };

beforeEach(() => {
    vi.mocked(simpleWa.startAuthentication).mockResolvedValue(ASSERTION as never);
    vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(true);
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const emailField = () => screen.queryByRole('textbox', { name: 'Email' });
/** Routes for an autofill sign-in whose verify answers only when the test says. */
function heldVerify(extra: Record<string, unknown> = {}) {
    let answer: ((r: { status?: number; body: unknown }) => void) | undefined;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith('/api/auth/providers')) return new Response(JSON.stringify({ providers: [] }));
        if (u.endsWith('/api/auth/passkey/options'))
            return new Response(JSON.stringify({ ok: true, options: OPTIONS, challenge_token: 'ct-1' }));
        if (u.endsWith('/api/auth/passkey/verify'))
            return new Promise<Response>((resolve) => {
                answer = (r) => resolve(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
            });
        for (const [path, body] of Object.entries(extra)) {
            if (u.endsWith(path)) return new Response(JSON.stringify(body));
        }
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    return {
        inFlight: () => answer !== undefined,
        answer: (r: { status?: number; body: unknown }) => answer!(r),
    };
}

describe('OcSignIn · passkey autofill in flight', () => {
    it('with: a passkey picked in autofill still signs in when the field goes before ochk.io answers', async () => {
        const verify = heldVerify();
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" onSuccess={onSuccess} />);
        await waitFor(() => expect(verify.inFlight()).toBe(true));
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        expect(emailField()).toBeNull();
        await act(async () => verify.answer({ body: { ok: true, account: ACCOUNT, token: 'tok' } }));
        expect(onSuccess).toHaveBeenCalledWith(ACCOUNT, 'tok');
    });

    it('with: a refusal that arrives after the field has gone is not shown when the field comes back', async () => {
        const verify = heldVerify({ '/api/auth/email-otp/start': { ok: true, token: 'otp-1' } });
        vi.mocked(simpleWa.startAuthentication)
            .mockResolvedValueOnce(ASSERTION as never)
            .mockReturnValue(new Promise(() => {}));
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" />);
        await waitFor(() => expect(verify.inFlight()).toBe(true));
        fireEvent.change(emailField()!, { target: { value: 'person@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        expect(emailField()).toBeNull();
        await act(async () => verify.answer({ status: 401, body: { ok: false, reason: 'passkey_not_for_signin' } }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
        });
        expect(emailField()).not.toBeNull();
        expect(screen.queryByText(/isn't set up to sign in/)).toBeNull();
    });

    it('cancelPasskeyAutofill leaves a passkey prompt the person opened, and stops autofill once it closes', async () => {
        heldVerify();
        let close!: (v: unknown) => void;
        vi.mocked(simpleWa.startAuthentication).mockReturnValueOnce(
            new Promise((resolve) => (close = resolve)) as never
        );
        const run = passkeyCeremony({ authOrigin: 'https://ochk.io', kind: 'signin', credentials: 'include' });
        await waitFor(() => expect(simpleWa.startAuthentication).toHaveBeenCalledTimes(1));
        cancelPasskeyAutofill();
        expect(simpleWa.WebAuthnAbortService.cancelCeremony).not.toHaveBeenCalled();
        close(ASSERTION);
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('https://ochk.io/api/auth/passkey/verify', expect.anything()));
        cancelPasskeyAutofill();
        expect(simpleWa.WebAuthnAbortService.cancelCeremony).toHaveBeenCalledTimes(1);
    });
});
