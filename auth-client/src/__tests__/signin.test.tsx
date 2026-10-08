/**
 * @vitest-environment jsdom
 *
 * OcSignIn is the front door of every ochk.io site. These pin what a person
 * sees when something goes wrong: a sentence and a next step, never a reason
 * code, and a way to finish on a device with no wallet extension.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));

import { humanSigninError, looksLikeBitcoinAddress, OcSignIn } from '../signin';

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

function stubFetch(route: Route) {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(url));
        const hit = route(String(url), init) ?? { status: 404, body: {} };
        return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
    }) as unknown as typeof fetch;
    return calls;
}

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('humanSigninError', () => {
    it('turns a host reason into a sentence', () => {
        expect(humanSigninError('bad_request', 'wallet')).toMatch(/Bitcoin address/);
        expect(humanSigninError('wrong_code', 'email')).toMatch(/code isn't right/);
    });

    it('reads "expired" in the context of the path', () => {
        expect(humanSigninError('expired', 'email')).toMatch(/Send a new one/);
        expect(humanSigninError('expired', 'wallet')).toMatch(/fresh one/);
    });

    it('never echoes an unknown code', () => {
        expect(humanSigninError('verify_failed_401', 'wallet')).not.toMatch(/_/);
    });

    it('passes a wallet extension message through', () => {
        expect(humanSigninError('User rejected the request', 'wallet')).toBe(
            'User rejected the request'
        );
    });
});

describe('looksLikeBitcoinAddress', () => {
    it('accepts the address shapes a wallet hands out', () => {
        expect(looksLikeBitcoinAddress(ADDR)).toBe(true);
        expect(looksLikeBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
        expect(looksLikeBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    });

    it('rejects what is not one', () => {
        expect(looksLikeBitcoinAddress('hello')).toBe(false);
        expect(looksLikeBitcoinAddress('not-a-real-address-at-all')).toBe(false);
    });
});

describe('OcSignIn · wallet path', () => {
    function openWalletTab() {
        stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.includes('/api/challenge'))
                return { body: { message: 'sign this', nonce: 'n1' } };
            if (url.endsWith('/api/auth/signin'))
                return { status: 401, body: { ok: false, reason: 'sig_invalid' } };
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.click(screen.getByRole('tab', { name: 'bitcoin wallet' }));
    }

    it('refuses a typo without fetching a challenge', async () => {
        openWalletTab();
        fireEvent.change(screen.getByPlaceholderText(/bc1q/), { target: { value: 'hello' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /→/ }));
        });
        expect(screen.getByRole('alert').textContent).toMatch(/doesn't look like a Bitcoin address/);
        const fetched = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        expect(fetched.some((c) => String(c[0]).includes('/api/challenge'))).toBe(false);
    });

    it('with no browser wallet, offers the message to sign elsewhere', async () => {
        openWalletTab();
        await act(async () => {});
        fireEvent.change(screen.getByPlaceholderText(/bc1q/), { target: { value: ADDR } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /get the message to sign/ }));
        });
        expect(screen.getByDisplayValue('sign this')).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText('paste the signature'), {
            target: { value: 'AkcwRAIg' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /sign me in/ }));
        });
        expect(screen.getByRole('alert').textContent).toMatch(/doesn't match this address/);
        expect(screen.queryByText(/sig_invalid/)).toBeNull();
    });
});

describe('OcSignIn · email path', () => {
    it('shows a sentence, not the reason code, and can send a new code', async () => {
        stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.endsWith('/email-otp/start')) return { body: { ok: true, token: 't1' } };
            if (url.endsWith('/email-otp/verify'))
                return { status: 401, body: { ok: false, reason: 'expired' } };
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
            target: { value: 'a@example.com' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /send one-time code/ }));
        });
        fireEvent.change(screen.getByPlaceholderText('6 digits'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /verify/ }));
        });
        expect(screen.getByRole('alert').textContent).toBe('That code expired. Send a new one.');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'send a new code' }));
        });
        expect(screen.getByText(/Sent a new code to/)).toBeTruthy();
    });
});
