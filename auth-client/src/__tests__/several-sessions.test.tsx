/**
 * @vitest-environment jsdom
 *
 * ochk.io refuses an add with 409 `several_sessions` when the browser sent more
 * than one ochk.io sign-in. It clears the extra cookies and spends nothing, so
 * the form says what happened in words, and the site reads its session again:
 * the account left signed in may not be the one the page showed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const wallets = vi.hoisted(() => ({ browser: false }));

vi.mock('@orangecheck/wallet-adapter', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/wallet-adapter')>()),
    detectWallets: () => [
        ...(wallets.browser ? [{ id: 'unisat', name: 'UniSat', detected: true }] : []),
        { id: 'manual', name: 'Manual', detected: true },
    ],
    getSigner: () => async () => SIG,
}));

import { OcSessionProvider } from '../provider';
import { OcSignIn } from '../signin';

const WORDS =
    "Your browser sent more than one ochk.io sign-in, so this account wasn't added. Check which account is signed in now, then try again.";
const SEVERAL = { status: 409, body: { ok: false, reason: 'several_sessions' } };
const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const SIG = 'AkcwRAIgXk3o9vTq0b1c2d3e4f5g6h7i8j9kAiBvOvnMEzFhPq';

type Answer = { status?: number; body: unknown };

/** Serves the sign-in calls; every request's path and body is kept. */
function serve(signin: Answer, verify: Answer = signin) {
    const calls: Array<{ path: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url), 'https://ochk.io').pathname;
        calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
        const hit: Answer | undefined =
            path === '/api/auth/providers'
                ? { body: { providers: [] } }
                : path === '/api/challenge'
                  ? { body: { message: 'sign this', nonce: 'n1' } }
                  : path === '/api/auth/signin'
                    ? signin
                    : path === '/api/auth/email-otp/start'
                      ? { body: { ok: true, token: 't1' } }
                      : path === '/api/auth/email-otp/verify'
                        ? verify
                        : path === '/api/auth/me'
                          ? { body: { account: null } }
                          : undefined;
        return Response.json(hit?.body ?? {}, { status: hit ? (hit.status ?? 200) : 404 });
    }) as unknown as typeof fetch;
    return calls;
}

async function signWithWallet(): Promise<string | null> {
    fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
    });
    fireEvent.change(screen.getByLabelText('Signature'), { target: { value: SIG } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Sign me in/ }));
    });
    return screen.getByRole('alert').textContent;
}

async function signWithBrowserWallet(): Promise<string | null> {
    fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Sign in with wallet/ }));
    });
    return screen.getByRole('alert').textContent;
}

async function verifyEmailCode(): Promise<string | null> {
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
        target: { value: 'a@example.com' },
    });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
    });
    fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Verify/ }));
    });
    return screen.getByRole('alert').textContent;
}

// The form loads the wallet adapter on its own; loading it here first keeps the mock's import from racing the form's.
beforeAll(async () => {
    await import('@orangecheck/wallet-adapter');
});

afterEach(() => {
    wallets.browser = false;
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
});

describe('OcSignIn · an add refused for several sign-ins', () => {
    it('wallet: says so in words and has the site read its session again, once', async () => {
        const calls = serve(SEVERAL);
        const recheck = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
        expect(await signWithWallet()).toBe(WORDS);
        expect(calls.find((c) => c.path === '/api/auth/signin')?.body).toMatchObject({ add: true });
        await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
        expect(calls.filter((c) => c.path === '/api/auth/signin')).toHaveLength(1);
    });

    it('browser wallet: says so in words and has the site read its session again, once', async () => {
        wallets.browser = true;
        const calls = serve(SEVERAL);
        const recheck = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
        expect(await signWithBrowserWallet()).toBe(WORDS);
        expect(calls.find((c) => c.path === '/api/auth/signin')?.body).toMatchObject({ add: true, signature: SIG });
        await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
        expect(calls.filter((c) => c.path === '/api/auth/signin')).toHaveLength(1);
    });

    it('email: says so in words and has the site read its session again, once', async () => {
        const calls = serve({ body: {} }, SEVERAL);
        const recheck = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
        expect(await verifyEmailCode()).toBe(WORDS);
        expect(calls.find((c) => c.path === '/api/auth/email-otp/verify')?.body).toMatchObject({ add: true });
        await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
        expect(calls.filter((c) => c.path === '/api/auth/email-otp/verify')).toHaveLength(1);
    });

    it('any other refusal reads no session again', async () => {
        serve({ status: 401, body: { ok: false, reason: 'sig_invalid' } });
        const recheck = vi.fn();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
        expect(await signWithWallet()).toMatch(/signature doesn't match/);
        cleanup();
        serve({ body: {} }, { status: 400, body: { ok: false, reason: 'wrong_code' } });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
        expect(await verifyEmailCode()).toMatch(/code isn't right/);
        await act(async () => {});
        expect(recheck).not.toHaveBeenCalled();
    });

    it('with no prop, the wrapping OcSessionProvider reads the session again', async () => {
        const calls = serve(SEVERAL);
        render(
            <OcSessionProvider config={{ multiAccount: false }}>
                <OcSignIn audience="https://ochk.io" linkPrompt={false} add />
            </OcSessionProvider>
        );
        await waitFor(() => expect(calls.filter((c) => c.path === '/api/auth/me')).toHaveLength(1));
        expect(await signWithWallet()).toBe(WORDS);
        await waitFor(() => expect(calls.filter((c) => c.path === '/api/auth/me')).toHaveLength(2));
    });

    it('the prop is what reads the session again, not the wrapping provider', async () => {
        const calls = serve(SEVERAL);
        const recheck = vi.fn();
        render(
            <OcSessionProvider config={{ multiAccount: false }}>
                <OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />
            </OcSessionProvider>
        );
        await waitFor(() => expect(calls.filter((c) => c.path === '/api/auth/me')).toHaveLength(1));
        expect(await signWithWallet()).toBe(WORDS);
        await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
        await act(async () => {});
        expect(calls.filter((c) => c.path === '/api/auth/me')).toHaveLength(1);
    });

    it('a re-read that fails leaves the words and throws nothing', async () => {
        serve(SEVERAL);
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);
        try {
            const recheck = vi.fn(async () => {
                throw new Error('offline');
            });
            render(<OcSignIn audience="https://ochk.io" linkPrompt={false} add onSeveralSessions={recheck} />);
            expect(await signWithWallet()).toBe(WORDS);
            await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
            await new Promise((r) => setTimeout(r, 10));
            expect(unhandled).toEqual([]);
            expect(screen.getByRole('alert').textContent).toBe(WORDS);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });

    it('a provider sign-in refused for it comes back with the same words', async () => {
        serve({ body: {} });
        window.history.replaceState({}, '', '/signin?add=1&oauth_error=several_sessions&oauth_provider=google');
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        await act(async () => {});
        expect(document.querySelector('[data-oc-signin-oauth-error]')?.textContent).toBe(WORDS);
    });
});
