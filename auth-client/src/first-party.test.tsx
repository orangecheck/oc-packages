// @vitest-environment jsdom
/**
 * First-party mode (ochk.app) and the single-account provider.
 *
 * ochk.app is orangecheck's own site on another domain. The family cookie is
 * SameSite=None, so if this component sent it from there, ochk.app scripts
 * could act as the family session. In first-party mode no call to the auth
 * host carries credentials, the token goes to onSuccess, and nothing opens a
 * window. The provider, told the site has one account, never pins a tab.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider } from './provider';
import { OcSignIn } from './signin';

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:0123456789abcdef0123456789abcdef' };

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    calls = [];
    sessionStorage.clear();
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
            calls.push({ url: String(url), init });
            const u = String(url);
            if (u.endsWith('/api/auth/providers')) {
                return json({ ok: true, providers: [{ id: 'google', label: 'Google' }] });
            }
            if (u.endsWith('/api/auth/email-otp/start')) return json({ ok: true, token: 't'.repeat(48) });
            if (u.endsWith('/api/auth/email-otp/verify')) {
                return json({ ok: true, token: 'app-token', account: ACCOUNT });
            }
            if (u.endsWith('/api/auth/me')) return json({ account: ACCOUNT });
            if (u.endsWith('/api/auth/tab')) return json({ ok: false });
            return json({}, 404);
        })
    );
    vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function signInByEmail(): Promise<void> {
    fireEvent.change(screen.getByLabelText('email'), { target: { value: 'a@example.com' } });
    await act(async () => {
        fireEvent.submit(screen.getByLabelText('email').closest('form')!);
    });
    const code = await screen.findByLabelText('one-time code');
    fireEvent.change(code, { target: { value: '123456' } });
    await act(async () => {
        fireEvent.submit(code.closest('form')!);
    });
}

describe('OcSignIn mode="first-party"', () => {
    it('signs in on the page, sends no credentials, and hands over the token', async () => {
        const onSuccess = vi.fn();
        render(
            <OcSignIn
                mode="first-party"
                audience="https://ochk.app"
                authOrigin="https://ochk.io"
                onSuccess={onSuccess}
            />
        );
        await signInByEmail();
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
        expect(onSuccess.mock.calls[0]![1]).toBe('app-token');
        const toHost = calls.filter((c) => c.url.startsWith('https://ochk.io'));
        expect(toHost.map((c) => c.url)).toEqual([
            'https://ochk.io/api/auth/email-otp/start',
            'https://ochk.io/api/auth/email-otp/verify',
        ]);
        for (const c of toHost) expect(c.init?.credentials, c.url).toBe('omit');
        expect(window.open).not.toHaveBeenCalled();
    });

    it('offers no provider, and asks for none, without a start route of its own', async () => {
        render(<OcSignIn mode="first-party" audience="https://ochk.app" onSuccess={vi.fn()} />);
        await act(async () => {});
        expect(calls.some((c) => c.url.endsWith('/api/auth/providers'))).toBe(false);
        expect(document.querySelector('[data-oc-signin-provider]')).toBeNull();
    });

    it("starts each provider on the site's own route", async () => {
        render(
            <OcSignIn
                mode="first-party"
                audience="https://ochk.app"
                onSuccess={vi.fn()}
                providerHref={(id) => `/api/auth/oauth/${id}?return_to=%2Fme`}
            />
        );
        const link = await waitFor(() => {
            const a = document.querySelector('[data-oc-signin-provider="google"]');
            expect(a).not.toBeNull();
            return a as HTMLAnchorElement;
        });
        expect(link.getAttribute('href')).toBe('/api/auth/oauth/google?return_to=%2Fme');
        const providers = calls.find((c) => c.url.endsWith('/api/auth/providers'));
        expect(providers?.init?.credentials).toBe('omit');
    });

    it('never offers to link or add an account', async () => {
        window.history.replaceState(null, '', '/signin?add=1');
        render(<OcSignIn mode="first-party" audience="https://ochk.app" onSuccess={vi.fn()} />);
        await act(async () => {});
        expect(document.querySelector('[data-oc-signin-linkalso]')).toBeNull();
        expect(document.querySelector('[data-oc-signin-add-mode]')).toBeNull();
        window.history.replaceState(null, '', '/');
    });
});

describe('OcSignIn family mode is unchanged', () => {
    it('sends the family cookie', async () => {
        render(<OcSignIn audience="https://me.ochk.io" onSuccess={vi.fn()} linkPrompt={false} />);
        await signInByEmail();
        const start = calls.find((c) => c.url.endsWith('/api/auth/email-otp/start'));
        expect(start?.init?.credentials).toBe('include');
    });
});

describe('OcSessionProvider multiAccount', () => {
    async function mount(multiAccount?: boolean): Promise<void> {
        render(
            <OcSessionProvider
                config={{
                    authOrigin: 'https://ochk.app',
                    ...(multiAccount === undefined ? {} : { multiAccount }),
                }}
            >
                <span />
            </OcSessionProvider>
        );
        await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/auth/me'))).toBe(true));
        await act(async () => {});
    }

    it('pins no tab and fetches no roster when the site has one account', async () => {
        await mount(false);
        expect(calls.some((c) => c.url.endsWith('/api/auth/tab'))).toBe(false);
        expect(calls.filter((c) => c.url.endsWith('/api/auth/me'))).toHaveLength(1);
    });

    it('still pins the tab by default', async () => {
        await mount();
        await waitFor(() => expect(calls.some((c) => c.url.endsWith('/api/auth/tab'))).toBe(true));
    });
});
