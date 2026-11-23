/**
 * @vitest-environment jsdom
 *
 * Layered sign-in finishes only after the passkey: the wallet's sign-in alone
 * hands the site nothing, so a person who stops there is not signed in to it.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const SIG = 'AkcwRAIgXk3o9vTq0b1c2d3e4f5g6h7i8j9kAiBvOvnMEzFhPq';
const OPTIONS = { challenge: 'CHL', rpId: 'ochk.io', allowCredentials: [{ id: 'cred-1', type: 'public-key' }] };
const ASSERTION = { id: 'cred-1', rawId: 'cred-1', type: 'public-key', response: {} };
const WALLET_ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };
const LAYERED_ACCOUNT = { ...WALLET_ACCOUNT, layered: true };

function stubFetch(verify: { status?: number; body: unknown }) {
    const calls: Array<{ url: string; body: unknown; credentials?: RequestCredentials }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : null, credentials: init?.credentials });
        const hit = u.endsWith('/api/auth/providers')
            ? { body: { providers: [{ id: 'google', label: 'Google' }] } }
            : u.includes('/api/challenge')
              ? { body: { message: 'sign this', nonce: 'n1' } }
              : u.endsWith('/api/auth/signin')
                ? { body: { ok: true, account: WALLET_ACCOUNT, token: 'wallet-tok' } }
                : u.endsWith('/api/auth/passkey/options')
                  ? { body: { ok: true, options: OPTIONS, challenge_token: 'ct-layer' } }
                  : u.endsWith('/api/auth/passkey/verify')
                    ? verify
                    : { status: 404, body: {} };
        return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
    }) as unknown as typeof fetch;
    return calls;
}

async function signInWithWallet() {
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
    });
    fireEvent.change(screen.getByLabelText('Signature'), { target: { value: SIG } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Sign me in/ }));
    });
}

const confirmButton = () => screen.queryByRole('button', { name: /Confirm with your passkey/ });

// A function returned from beforeEach runs as its teardown: keep the body a block.
beforeEach(() => {
    vi.mocked(simpleWa.startAuthentication).mockResolvedValue(ASSERTION as never);
});
afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('OcSignIn · passkey="layered"', () => {
    it('starts with the wallet alone: no email, no provider', async () => {
        stubFetch({ body: {} });
        render(<OcSignIn audience="https://ochk.io" passkey="layered" onSuccess={vi.fn()} />);
        await act(async () => {});
        expect(screen.getByLabelText('Bitcoin address')).not.toBeNull();
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
        expect(document.querySelector('[data-oc-signin-provider]')).toBeNull();
    });

    it('hands nothing to the site after the wallet alone, and asks for the passkey behind a tap', async () => {
        stubFetch({ body: {} });
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" passkey="layered" onSuccess={onSuccess} />);
        await signInWithWallet();
        expect(onSuccess).not.toHaveBeenCalled();
        expect(confirmButton()).not.toBeNull();
        expect(simpleWa.startAuthentication).not.toHaveBeenCalled();
    });

    it('finishes with the passkey, and hands over the session that carries both', async () => {
        const calls = stubFetch({ body: { ok: true, account: LAYERED_ACCOUNT, token: 'layered-tok' } });
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" passkey="layered" onSuccess={onSuccess} />);
        await signInWithWallet();
        await act(async () => {
            fireEvent.click(confirmButton()!);
        });
        expect(calls.find((c) => c.url.endsWith('/api/auth/passkey/options'))).toMatchObject({
            body: { kind: 'layer' },
            credentials: 'include',
        });
        expect(calls.find((c) => c.url.endsWith('/api/auth/passkey/verify'))).toMatchObject({
            body: { challenge_token: 'ct-layer', response: ASSERTION },
        });
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(LAYERED_ACCOUNT, 'layered-tok');
    });

    it('hands nothing over when the passkey is refused, and lets the person try again', async () => {
        stubFetch({ status: 401, body: { ok: false, reason: 'passkey_not_recognised' } });
        const onSuccess = vi.fn();
        render(<OcSignIn audience="https://ochk.io" passkey="layered" onSuccess={onSuccess} />);
        await signInWithWallet();
        await act(async () => {
            fireEvent.click(confirmButton()!);
        });
        expect(onSuccess).not.toHaveBeenCalled();
        expect(screen.getByText(/isn't set up to sign in/)).not.toBeNull();
        expect(confirmButton()).not.toBeNull();
    });

    it('is not offered on a first-party site, which has no family session to add to', () => {
        stubFetch({ body: {} });
        render(
            <OcSignIn
                audience="https://ochk.app"
                mode="first-party"
                onSuccess={vi.fn()}
                {...({ passkey: 'layered' } as object)}
            />
        );
        expect(screen.queryByLabelText('Bitcoin address')).toBeNull();
        expect(screen.getByText(/adds to a family session/)).not.toBeNull();
    });
});
