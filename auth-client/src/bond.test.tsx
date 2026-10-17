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
    OcWalletButton: ({
        onSigned,
        message,
    }: {
        onSigned: (s: string) => void;
        message: string;
    }) => (
        <button type="button" data-message={message} onClick={() => onSigned('SIG')}>
            sign-with-wallet
        </button>
    ),
}));

import { bondRefusal, OcBond } from './bond';

type Call = {
    url: string;
    method: string;
    body: Record<string, unknown> | null;
    credentials?: string;
};
type Answer = (c: Call) => Response | undefined;

let calls: Call[] = [];
let bonded = false;
let coins: unknown[] = [];
let answer: Answer = () => undefined;

const COIN = {
    outpoint: 'ab'.repeat(32) + ':1',
    sats: 150_000,
    age_blocks: 51_800,
    sats_floor: 100_000,
    days_floor: 90,
};
const dust = (i: number, sats: number) => ({
    outpoint: `d${i}`.repeat(32) + ':0',
    sats,
    age_blocks: 51_800,
    sats_floor: 0,
    days_floor: 90,
});
const BOND = {
    address: 'bc1qholder0holder0holder',
    outpoint: COIN.outpoint,
    sats: 150_000,
    confirmed_height: 920_000,
    checked_at: 'x',
    checked_height: 971_800,
    created_at: 'x',
    sats_floor: 100_000,
    days_floor: 90,
};
const ADDRESS_LABEL = 'bitcoin address that holds the coin';
const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    calls = [];
    bonded = false;
    coins = [COIN];
    answer = () => undefined;
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit = {}) => {
            const c: Call = {
                url: String(url),
                method: init.method ?? 'GET',
                body: init.body ? JSON.parse(String(init.body)) : null,
                credentials: init.credentials,
            };
            calls.push(c);
            const special = answer(c);
            if (special) return special;
            if (c.method === 'GET') return json({ ok: true, bond: bonded ? BOND : null });
            if (c.method === 'DELETE') return json({ ok: true, bond: null });
            if (c.body?.action === 'coins') return json({ ok: true, coins });
            if (c.body?.action === 'message') {
                return json({ ok: true, message: 'orangecheck-bond\n…' });
            }
            if (c.body?.action === 'bond') return json({ ok: true, bond: BOND });
            return json({}, 404);
        })
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

/** Open the form and find the coins at an address, submitting it as Enter would. */
async function toCoins(address = 'bc1qholder0holder0holder') {
    fireEvent.click(await screen.findByText('back your account'));
    const input = screen.getByLabelText(ADDRESS_LABEL) as HTMLInputElement;
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: address } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(calls.some((c) => c.body?.action === 'coins')).toBe(true));
}

describe('OcBond', () => {
    it('backs the account with a chosen coin, on the auth host, with the cookie', async () => {
        const onChange = vi.fn();
        render(<OcBond authOrigin="https://ochk.io" onChange={onChange} />);
        await toCoins();
        expect(
            await screen.findByText(/apps would see at least 100,000 sats, held 90 days or more/)
        ).toBeTruthy();
        expect((screen.getByRole('radio') as HTMLInputElement).checked).toBe(true);
        fireEvent.click(screen.getByText('continue'));
        fireEvent.click(await screen.findByText('sign-with-wallet'));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(BOND));
        expect(
            screen.getByText(/apps see a coin at least 100,000 sats, held 90 days or more/)
        ).toBeTruthy();
        expect(
            calls.every(
                (c) => c.url === 'https://ochk.io/api/auth/bond' && c.credentials === 'include'
            )
        ).toBe(true);
        expect(calls.find((c) => c.body?.action === 'coins')?.body).toMatchObject({
            address: 'bc1qholder0holder0holder',
        });
        expect(calls.find((c) => c.body?.action === 'bond')?.body).toMatchObject({
            signature: 'SIG',
        });
    });

    it('goes back a step from signing and from the coin list, keeping the address', async () => {
        render(<OcBond />);
        await toCoins();
        fireEvent.click(await screen.findByText('continue'));
        await screen.findByText('sign-with-wallet');
        fireEvent.click(screen.getByText('back'));
        expect(await screen.findByText(/pick one coin/)).toBeTruthy();
        expect(screen.queryByText('sign-with-wallet')).toBeNull();
        fireEvent.click(screen.getByText('back'));
        const input = (await screen.findByLabelText(ADDRESS_LABEL)) as HTMLInputElement;
        expect(input.value).toBe('bc1qholder0holder0holder');
    });

    it('says why a coin was refused', async () => {
        answer = (c) =>
            c.body?.action === 'bond'
                ? json({ ok: false, reason: 'coin_backs_another_account' }, 409)
                : undefined;
        const onChange = vi.fn();
        render(<OcBond onChange={onChange} />);
        await toCoins();
        fireEvent.click(await screen.findByText('continue'));
        fireEvent.click(await screen.findByText('sign-with-wallet'));
        expect(
            await screen.findByText('that coin already backs another orangecheck account')
        ).toBeTruthy();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('lists only coins big enough to back an account, and counts the rest', async () => {
        coins = [dust(1, 546), COIN, dust(2, 999)];
        render(<OcBond />);
        await toCoins();
        expect(
            await screen.findByText('2 coins under 1,000 sats, too small to back an account')
        ).toBeTruthy();
        const radios = screen.getAllByRole('radio') as HTMLInputElement[];
        expect(radios.map((r) => r.value)).toEqual([COIN.outpoint]);
        expect(radios[0]!.checked).toBe(true);
    });

    it('says so when every coin is too small, with no list to pick from', async () => {
        coins = [dust(1, 546)];
        render(<OcBond />);
        await toCoins();
        expect(
            await screen.findByText('1 coin under 1,000 sats, too small to back an account')
        ).toBeTruthy();
        expect(screen.getByText(/send at least 1,000 sats there in one payment/)).toBeTruthy();
        expect(screen.queryByRole('radiogroup')).toBeNull();
        expect(screen.queryByText('continue')).toBeNull();
        fireEvent.click(screen.getByText('back'));
        expect(await screen.findByLabelText(ADDRESS_LABEL)).toBeTruthy();
    });

    it('asks before it stops backing, and keeps the backing on "keep"', async () => {
        bonded = true;
        const onChange = vi.fn();
        render(<OcBond onChange={onChange} />);
        fireEvent.click(await screen.findByText('stop backing'));
        expect(
            screen.getByText(
                'stop backing? apps that ask for a backed account may stop letting you in.'
            )
        ).toBeTruthy();
        fireEvent.click(screen.getByText('keep'));
        expect(screen.queryByText(/stop backing\?/)).toBeNull();
        expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

        fireEvent.click(screen.getByText('stop backing'));
        fireEvent.click(screen.getByText('stop backing'));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
        expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
        expect(await screen.findByText('back your account')).toBeTruthy();
    });

    it('re-pins a tab pinned to this account with the token the host minted', async () => {
        bonded = true;
        window.sessionStorage.setItem(
            'oc_tab_session',
            JSON.stringify({ token: 'OLD', didOc: 'did:oc:pinned' })
        );
        answer = (c) =>
            c.method === 'DELETE' ? json({ ok: true, bond: null, token: 'NEW' }) : undefined;
        render(<OcBond />);
        fireEvent.click(await screen.findByText('stop backing'));
        fireEvent.click(screen.getByText('stop backing'));
        await screen.findByText('back your account');
        expect(JSON.parse(window.sessionStorage.getItem('oc_tab_session')!)).toEqual({
            token: 'NEW',
            didOc: 'did:oc:pinned',
        });
        window.sessionStorage.clear();
    });

    it('offers a retry when the bond could not be read, and the retry reads it again', async () => {
        let fails = 1;
        answer = (c) => (c.method === 'GET' && fails-- > 0 ? json({}, 503) : undefined);
        render(<OcBond />);
        expect(await screen.findByText(/couldn't read your backing/)).toBeTruthy();
        fireEvent.click(screen.getByText('try again'));
        expect(await screen.findByText('back your account')).toBeTruthy();
        expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
    });
});

describe('refusals', () => {
    // Every reason /api/auth/bond gives, and a phrase only its own text carries.
    const REASONS: Record<string, RegExp> = {
        invalid_address: /isn't a Bitcoin address/,
        chain_unavailable: /couldn't read the chain/,
        sig_invalid: /signature isn't from this coin's address/,
        bond_expired: /message expired/,
        bond_not_yet_valid: /clock looks wrong/,
        bond_subject_mismatch: /message was for another account/,
        bond_malformed: /changed on the way/,
        bond_window_too_long: /signing window is too long/,
        coin_not_found: /doesn't exist on-chain/,
        coin_address_mismatch: /isn't at this address/,
        coin_unconfirmed: /isn't confirmed yet/,
        coin_too_recent: /needs six confirmations/,
        coin_spent: /has been spent/,
        coin_too_small: /under 1,000 sats, too small to back an account/,
        coin_backs_another_account: /already backs another orangecheck account/,
        coin_backed_another_recently: /30 days after it was released/,
        not_authenticated: /session ended/,
        rate_limited: /too many tries/,
    };

    it('says each reason the auth host gives in its own words', () => {
        const fallback = bondRefusal('something_new');
        for (const [reason, phrase] of Object.entries(REASONS)) {
            const text = bondRefusal(reason);
            expect(text, reason).not.toBe(fallback);
            expect(text, reason).toMatch(phrase);
        }
        const texts = Object.keys(REASONS).map((r) => bondRefusal(r));
        expect(new Set(texts).size).toBe(texts.length);
    });

    it('says anything else plainly', () => {
        expect(bondRefusal(undefined)).toBe(
            "your backing didn't save · nothing changed, try again"
        );
        expect(bondRefusal('something_new')).toBe(bondRefusal(undefined));
    });
});
