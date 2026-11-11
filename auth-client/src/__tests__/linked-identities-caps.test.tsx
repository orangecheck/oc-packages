/**
 * @vitest-environment jsdom
 *
 * Linking an identity meets the same ochk.io caps as signing in. A capped
 * challenge or code says which limit and when, never "http_429" or a code.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));

import { OcLinkedIdentities } from '../linked-identities';

const RETRY = Math.floor(Date.now() / 1000) + 3600;
const AT = new Date(RETRY * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function stub(capped: { path: string; body: unknown }) {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes(capped.path)) return new Response(JSON.stringify(capped.body), { status: 429 });
        if (u.includes('/api/auth/identities'))
            return new Response(JSON.stringify({ ok: true, did_oc: `did:oc:${'a'.repeat(32)}`, linked: [] }));
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('OcLinkedIdentities · a capped network', () => {
    it('linking a wallet: a capped challenge says whose limit it is, and when', async () => {
        for (const [error, who] of [
            ['challenges_capped', 'this connection'],
            ['network_challenges_capped', 'this network'],
        ] as const) {
            stub({ path: '/api/challenge', body: { error, retry_at: RETRY } });
            render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
            await act(async () => {});
            fireEvent.click(screen.getByRole('button', { name: '+ link a Bitcoin address' }));
            fireEvent.change(screen.getByPlaceholderText(/bc1q/), {
                target: { value: 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8' },
            });
            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: 'get challenge' }));
            });
            expect(
                screen.getByText(`Too many wallet sign-in attempts from ${who}. Try again after ${AT}, or link an email instead.`)
            ).toBeTruthy();
            expect(screen.queryByText(/http_429|_capped/)).toBeNull();
            cleanup();
        }
    });

    it('linking an email: a capped code says when, and offers the wallet', async () => {
        stub({ path: '/api/auth/email-otp/start', body: { ok: false, reason: 'otp_network_cap', retry_at: RETRY } });
        render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', { name: '+ link an email' }));
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'send code' }));
        });
        expect(
            screen.getByText(
                `Too many codes were sent from your network in the last hour. Link a Bitcoin wallet instead, or try again after ${AT}.`
            )
        ).toBeTruthy();
    });
});
