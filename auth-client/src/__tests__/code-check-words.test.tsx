/**
 * @vitest-environment jsdom
 *
 * ochk.io's wrong-code cap (429 otp_wrong_code_cap, with retry_at) and its
 * unreadable count (503 code_check_unavailable) read as words wherever a code
 * is checked, and the link forms never show a reason code or a fetch error.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));

import { capText } from '../caps';
import { OcLinkedIdentities } from '../linked-identities';
import { OcSignIn } from '../signin';

const RETRY = Math.floor(Date.now() / 1000) + 3600;
const AT = new Date(RETRY * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const UNAVAILABLE = "We couldn't check your code just now. It still works: try it again in a minute.";
const DID = `did:oc:${'a'.repeat(32)}`;

type Answer = { status?: number; body: unknown } | 'offline';

function stub(route: (url: string, init?: RequestInit) => Answer | undefined) {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const a = route(String(url), init);
        if (a === 'offline') throw new TypeError('Failed to fetch');
        if (a) return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('capText · a code check that is held or cannot count', () => {
    it('names the email, when it frees, and what else to do', () => {
        expect(capText('otp_wrong_code_cap', RETRY)).toBe(
            `Too many wrong codes were entered for this email. Try again after ${AT}, or sign in another way.`
        );
        expect(capText('otp_wrong_code_cap', 'soon', 'link a Bitcoin wallet instead')).toBe(
            'Too many wrong codes were entered for this email. Try again later, or link a Bitcoin wallet instead.'
        );
    });

    it('drops the other way when nothing else would help', () => {
        expect(capText('otp_wrong_code_cap', RETRY, '')).toBe(
            `Too many wrong codes were entered for this email. Try again after ${AT}.`
        );
        expect(capText('otp_network_cap', undefined, '')).toBe(
            'Too many codes were sent from your network in the last hour. Try again within the hour.'
        );
        expect(capText('challenges_capped', undefined, '')).toBe(
            'Too many wallet sign-in attempts from this connection. Try again later.'
        );
    });

    it('says the code still works when the count cannot be read', () => {
        expect(capText('code_check_unavailable', undefined)).toBe(UNAVAILABLE);
    });
});

describe('OcSignIn · the email code step', () => {
    async function verifyWith(answer: Answer) {
        stub((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.endsWith('/email-otp/start')) return { body: { ok: true, token: 't' } };
            if (url.endsWith('/email-otp/verify')) return answer;
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Verify/ }));
        });
        return screen.getByRole('alert').textContent;
    }

    it('a held address says when, never the general sentence', async () => {
        expect(await verifyWith({ status: 429, body: { ok: false, reason: 'otp_wrong_code_cap', retry_at: RETRY } })).toBe(
            `Too many wrong codes were entered for this email. Try again after ${AT}, or sign in another way.`
        );
    });

    it('an unreadable count keeps the code', async () => {
        expect(await verifyWith({ status: 503, body: { ok: false, reason: 'code_check_unavailable' } })).toBe(UNAVAILABLE);
    });
});

describe('OcLinkedIdentities · words, never codes', () => {
    function withLink(answer: Answer, rows: unknown[] = []) {
        stub((url, init) => {
            if (url.includes('/api/auth/link/email-code')) return { body: { ok: true, token: 't' } };
            if (url.includes('/api/auth/link/email')) return answer;
            if (url.includes('/api/auth/identities') && init?.method === 'DELETE') return answer;
            if (url.includes('/api/auth/identities')) return { body: { ok: true, did_oc: DID, linked: rows } };
            return undefined;
        });
    }

    async function linkEmail(answer: Answer) {
        withLink(answer);
        render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', { name: '+ link an email' }));
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'send code' }));
        });
        fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'verify + link' }));
        });
        return screen.getByRole('alert').textContent;
    }

    it('a held address names it and offers the wallet', async () => {
        expect(await linkEmail({ status: 429, body: { ok: false, reason: 'otp_wrong_code_cap', retry_at: RETRY } })).toBe(
            `Too many wrong codes were entered for this email. Try again after ${AT}, or link a Bitcoin wallet instead.`
        );
    });

    it('a wrong code reads as words', async () => {
        expect(await linkEmail({ status: 401, body: { ok: false, reason: 'wrong_code' } })).toBe(
            "That code isn't right. Check the newest email from us."
        );
    });

    it('an unreadable count keeps the code', async () => {
        expect(await linkEmail({ status: 503, body: { ok: false, reason: 'code_check_unavailable' } })).toBe(UNAVAILABLE);
    });

    it('a failed fetch names the host, not the browser error', async () => {
        expect(await linkEmail('offline')).toBe(
            "We couldn't reach the orangecheck sign-in service at ochk.io. Check your connection, then try again."
        );
    });

    it('unlinking asks for a fresh confirmation when the host wants one', async () => {
        const assign = vi.fn();
        const original = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...original, href: 'https://vault.ochk.io/lock', assign },
        });
        try {
            withLink({ status: 401, body: { ok: false, reason: 'sudo_required' } }, [
                {
                    id: 'id-2',
                    kind: 'email',
                    value: 'b@example.com',
                    verified_at: '2026-11-01T00:00:00Z',
                    verification_method: 'email-otp',
                    is_primary: false,
                },
            ]);
            render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
            await act(async () => {});
            fireEvent.click(screen.getByRole('button', { name: 'unlink' }));
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'confirm unlink' }));
            });
            expect(assign).toHaveBeenCalledOnce();
            const url = new URL(assign.mock.calls[0]![0] as string);
            expect(url.pathname).toBe('/sudo');
            expect(url.searchParams.get('purpose')).toBe('remove a way to sign in');
            expect(screen.queryByText(/sudo_required/)).toBeNull();
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: original });
        }
    });
});
