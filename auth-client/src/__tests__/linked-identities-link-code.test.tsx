/**
 * @vitest-environment jsdom
 *
 * Linking an email asks ochk.io for a code issued to this account for this
 * address, which can only link it. A sign-in start mails what signs in to the
 * address's own account, so the form never asks for one.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [],
    getSigner: () => async () => 'unused',
}));

import { OcLinkedIdentities } from '../linked-identities';

const DID = `did:oc:${'a'.repeat(32)}`;
const HELD = 'held@example.com';
const RETRY = Math.floor(Date.now() / 1000) + 3600;
const AT = new Date(RETRY * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Mail = { to: string; kind: 'sign-in code' | 'sign-in link' | 'link code' };
let mailbox: Mail[];
let linked: Array<{ email: string; token: string }>;

// ochk.io as far as these forms reach it. An address held after wrong codes
// gets a sign-in link from the sign-in start, and nothing from the link start.
beforeEach(() => {
    mailbox = [];
    linked = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        const body = (init?.body ? JSON.parse(String(init.body)) : {}) as { email?: string; token?: string };
        if (path === '/api/auth/identities') return json({ ok: true, did_oc: DID, linked: [] });
        if (path === '/api/auth/email-otp/start') {
            mailbox.push({ to: body.email ?? '', kind: body.email === HELD ? 'sign-in link' : 'sign-in code' });
            return json({ ok: true, token: `signin:${body.email}` });
        }
        if (path === '/api/auth/link/email-code') {
            if (init?.credentials !== 'include') return json({ ok: false, reason: 'not_authenticated' }, 401);
            if (body.email === HELD) return json({ ok: false, reason: 'otp_wrong_code_cap', retry_at: RETRY }, 429);
            mailbox.push({ to: body.email ?? '', kind: 'link code' });
            return json({ ok: true, token: `link:${body.email}` });
        }
        if (path === '/api/auth/link/email') {
            linked.push({ email: body.email ?? '', token: body.token ?? '' });
            return json({ ok: true });
        }
        return json({}, 404);
    }) as unknown as typeof fetch;
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

async function addEmail(email: string): Promise<void> {
    render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '+ link an email' }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'send code' }));
    });
}

describe('OcLinkedIdentities · the code that links an email', () => {
    it('is a code for linking, and it links the address to this account', async () => {
        await addEmail('new@example.com');
        expect(mailbox).toEqual([{ to: 'new@example.com', kind: 'link code' }]);
        fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'verify + link' }));
        });
        expect(linked).toEqual([{ email: 'new@example.com', token: 'link:new@example.com' }]);
        expect(document.querySelector('[data-oc-li-form="email"]')).toBeNull();
    });

    it('a held address is mailed nothing, and the form says when it frees and offers the wallet', async () => {
        await addEmail(HELD);
        expect(mailbox).toEqual([]);
        expect(screen.getByRole('alert').textContent).toBe(
            `Too many wrong codes were entered for this email. Try again after ${AT}, or link a Bitcoin wallet instead.`
        );
        expect(screen.queryByPlaceholderText('123456')).toBeNull();
        expect(linked).toEqual([]);
    });
});
