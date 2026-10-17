// @vitest-environment jsdom
/**
 * OcBond backs the signed-in account with one coin (BOND.md) on any family
 * site: it reads the bond from the auth host with the family cookie, walks
 * address → coin → signature, and tells the site when it changed. The wallet
 * step is the wallet adapter's; here it signs at once.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter/react', () => ({
    OcWalletButton: ({ onSigned, message }: { onSigned: (s: string) => void; message: string }) => (
        <button type="button" data-message={message} onClick={() => onSigned('SIG')}>
            sign-with-wallet
        </button>
    ),
}));

import { OcBond } from './bond';

type Call = { url: string; method: string; body: Record<string, unknown> | null; credentials?: string };
let calls: Call[] = [];
let bonded = false;

const COIN = { outpoint: 'ab'.repeat(32) + ':1', sats: 150_000, age_blocks: 51_800, sats_floor: 100_000, days_floor: 90 };
const BOND = { address: 'bc1qholder0holder0holder', outpoint: COIN.outpoint, sats: 150_000, confirmed_height: 920_000, checked_at: 'x', checked_height: 971_800, created_at: 'x', sats_floor: 100_000, days_floor: 90 };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    calls = [];
    bonded = false;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit = {}) => {
            const c = { url: String(url), method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, credentials: init.credentials };
            calls.push(c);
            if (c.method === 'GET') return json({ ok: true, bond: bonded ? BOND : null });
            if (c.method === 'DELETE') return json({ ok: true, bond: null });
            if (c.body?.action === 'coins') return json({ ok: true, coins: [COIN] });
            if (c.body?.action === 'message') return json({ ok: true, message: 'orangecheck-bond\n…' });
            if (c.body?.action === 'bond') return json({ ok: true, bond: BOND });
            return json({}, 404);
        })
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe('OcBond', () => {
    it('backs the account with a chosen coin, against the auth host, with the family cookie', async () => {
        const onChange = vi.fn();
        render(<OcBond authOrigin="https://ochk.io" onChange={onChange} />);
        fireEvent.click(await screen.findByText('back it with a coin'));
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: 'bc1qholder0holder0holder' } });
        fireEvent.click(screen.getByText('find its coins'));
        expect(await screen.findByText(/apps would see at least 100,000 sats, held 90 days or more/)).toBeTruthy();
        fireEvent.click(screen.getByText('continue'));
        fireEvent.click(await screen.findByText('sign-with-wallet'));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(BOND));
        expect(screen.getByText(/apps see a coin at least 100,000 sats, held 90 days or more/)).toBeTruthy();
        expect(calls.every((c) => c.url === 'https://ochk.io/api/auth/bond' && c.credentials === 'include')).toBe(true);
        expect(calls.find((c) => c.body?.action === 'bond')?.body).toMatchObject({ signature: 'SIG' });
    });

    it('stops backing when asked', async () => {
        bonded = true;
        const onChange = vi.fn();
        render(<OcBond onChange={onChange} />);
        fireEvent.click(await screen.findByText('stop backing'));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
        expect(await screen.findByText('back it with a coin')).toBeTruthy();
    });

    it('offers a retry when the bond could not be read', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
        render(<OcBond />);
        expect(await screen.findByText(/couldn't read your backing/)).toBeTruthy();
        expect(screen.getByText('try again')).toBeTruthy();
    });
});
