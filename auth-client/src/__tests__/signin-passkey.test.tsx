/**
 * @vitest-environment jsdom
 *
 * OcSignIn offers a passkey only where the site asks for one: `with` beside
 * the other ways in, `only` alone, and by default not at all.
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

import { OcSignIn } from '../signin';

const OPTIONS = { challenge: 'CHP', rpId: 'ochk.io', allowCredentials: [], userVerification: 'required' };
const ASSERTION = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };
const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };

interface Call {
    url: string;
    init?: RequestInit;
}

function stubFetch(verify: { status?: number; body: unknown } = { body: { ok: true, account: ACCOUNT, token: 'tok' } }) {
    const calls: Call[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        const hit = u.endsWith('/api/auth/providers')
            ? { body: { providers: [] } }
            : u.endsWith('/api/auth/passkey/options')
              ? { body: { ok: true, options: OPTIONS, challenge_token: 'ct-1' } }
              : u.endsWith('/api/auth/passkey/verify')
                ? verify
                : { status: 404, body: {} };
        return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
    }) as unknown as typeof fetch;
    return calls;
}

const posted = (calls: Call[], path: string) =>
    calls.filter((c) => c.url.endsWith(path)).map((c) => ({ body: JSON.parse(String(c.init?.body)), credentials: c.init?.credentials }));

beforeEach(() => {
    vi.mocked(simpleWa.startAuthentication).mockResolvedValue(ASSERTION as never);
    vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(false);
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const passkeyButton = () => screen.queryByRole('button', { name: /Sign in with a passkey/ });
const emailField = () => screen.queryByRole('textbox', { name: 'Email' });

describe('OcSignIn · passkey', () => {
    it('offers no passkey when the site asks for none', () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        expect(passkeyButton()).toBeNull();
        expect(emailField()?.getAttribute('autocomplete')).toBe('email');
        expect(simpleWa.browserSupportsWebAuthnAutofill).not.toHaveBeenCalled();
    });

    it('with: offers a passkey button and the passkey in the email field autofill', () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" />);
        expect(passkeyButton()).not.toBeNull();
        expect(emailField()?.getAttribute('autocomplete')).toBe('username webauthn');
        expect(screen.getByRole('tab', { name: 'Bitcoin wallet' })).not.toBeNull();
    });

    it('only: offers the passkey alone', () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" passkey="only" />);
        expect(passkeyButton()).not.toBeNull();
        expect(screen.queryByRole('tab')).toBeNull();
        expect(emailField()).toBeNull();
        expect(screen.queryByLabelText('Bitcoin address')).toBeNull();
    });

    it('signs in with the passkey ochk.io recognises, and hands over its account and token', async () => {
        const calls = stubFetch();
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" passkey="only" onSuccess={onSuccess} />);
        await act(async () => {
            fireEvent.click(passkeyButton()!);
        });
        expect(posted(calls, '/api/auth/passkey/options')).toEqual([{ body: { kind: 'signin' }, credentials: 'include' }]);
        expect(simpleWa.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS, useBrowserAutofill: false });
        expect(posted(calls, '/api/auth/passkey/verify')).toEqual([
            { body: { challenge_token: 'ct-1', response: ASSERTION }, credentials: 'include' },
        ]);
        expect(onSuccess).toHaveBeenCalledWith(ACCOUNT, 'tok');
    });

    it('first-party: sends no cookie either way', async () => {
        const calls = stubFetch();
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.app" mode="first-party" passkey="only" onSuccess={onSuccess} />);
        await act(async () => {
            fireEvent.click(passkeyButton()!);
        });
        expect(calls.filter((c) => c.url.includes('/api/auth/passkey/')).map((c) => c.init?.credentials)).toEqual([
            'omit',
            'omit',
        ]);
        expect(onSuccess).toHaveBeenCalledWith(ACCOUNT, 'tok');
    });

    it('says in words when the passkey cannot sign in, and tells the browser the key is unknown', async () => {
        stubFetch({ status: 401, body: { ok: false, reason: 'passkey_not_recognised' } });
        const signal = vi.fn(async () => {});
        vi.stubGlobal('PublicKeyCredential', { signalUnknownCredential: signal });
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" passkey="only" onSuccess={onSuccess} />);
        await act(async () => {
            fireEvent.click(passkeyButton()!);
        });
        expect(screen.getByText(/isn't set up to sign in/)).not.toBeNull();
        expect(signal).toHaveBeenCalledWith({ rpId: 'ochk.io', credentialId: 'cred-1' });
        expect(onSuccess).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('with: autofill runs a conditional request while the email field shows, and stops on a switch to the wallet', async () => {
        stubFetch();
        vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(true);
        vi.mocked(simpleWa.startAuthentication).mockReturnValue(new Promise(() => {}));
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" />);
        await waitFor(() =>
            expect(simpleWa.startAuthentication).toHaveBeenCalledWith({ optionsJSON: OPTIONS, useBrowserAutofill: true })
        );
        expect(simpleWa.WebAuthnAbortService.cancelCeremony).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        expect(simpleWa.WebAuthnAbortService.cancelCeremony).toHaveBeenCalledTimes(1);
    });

    it('with: an autofill sign-in finishes like the button', async () => {
        stubFetch();
        vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(true);
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" onSuccess={onSuccess} />);
        await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(ACCOUNT, 'tok'));
    });

    it('with: a failed autofill request stays silent until the person picks a passkey', async () => {
        globalThis.fetch = vi.fn(async (url: RequestInfo | URL) =>
            String(url).endsWith('/api/auth/providers')
                ? new Response(JSON.stringify({ providers: [] }))
                : new Response(JSON.stringify({ ok: false, reason: 'rate_limited' }), { status: 429 })
        ) as unknown as typeof fetch;
        vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(true);
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" />);
        await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
            'https://ochk.io/api/auth/passkey/options',
            expect.anything()
        ));
        await act(async () => {});
        expect(simpleWa.startAuthentication).not.toHaveBeenCalled();
        expect(screen.queryByText(/Too many tries/)).toBeNull();
    });

    it('with: autofill never starts over a passkey prompt the person opened', async () => {
        let release!: () => void;
        const slowOptions = new Promise<void>((r) => (release = r));
        let optionsCalls = 0;
        globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
            const u = String(url);
            if (u.endsWith('/api/auth/providers')) return new Response(JSON.stringify({ providers: [] }));
            if (u.endsWith('/api/auth/passkey/options')) {
                // The autofill request's options arrive only after the button's prompt is open.
                if (++optionsCalls === 1) await slowOptions;
                return new Response(JSON.stringify({ ok: true, options: OPTIONS, challenge_token: 'ct-1' }));
            }
            return new Response(JSON.stringify({ ok: false }), { status: 401 });
        }) as unknown as typeof fetch;
        vi.mocked(simpleWa.browserSupportsWebAuthnAutofill).mockResolvedValue(true);
        vi.mocked(simpleWa.startAuthentication).mockReturnValue(new Promise(() => {}));
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} passkey="with" />);
        await waitFor(() => expect(optionsCalls).toBe(1));
        await act(async () => {
            fireEvent.click(passkeyButton()!);
        });
        await waitFor(() => expect(simpleWa.startAuthentication).toHaveBeenCalledTimes(1));
        await act(async () => release());
        await act(async () => {});
        expect(vi.mocked(simpleWa.startAuthentication).mock.calls.map(([o]) => o.useBrowserAutofill)).toEqual([false]);
    });
});
