/**
 * @vitest-environment jsdom
 *
 * ochk.io spends a link's proof on any try it answers, the "linked to another
 * account" refusal included: a wallet message once, an email code once. So
 * moving a way in here takes one more proof, a new message to sign or a new
 * code, sent with confirm_transfer. Re-sending the spent one was always
 * refused, and the move could never succeed.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [],
    getSigner: () => async () => 'unused',
}));
// The wallet signs whatever message it is shown, or sends what was pasted into it.
vi.mock('@orangecheck/wallet-adapter/react', () => ({
    OcWalletButton: function Wallet(p: { message: string; onSigned: (sig: string) => void }) {
        const [pasted, setPasted] = React.useState('');
        return (
            <>
                <input aria-label="pasted signature" value={pasted} onChange={(e) => setPasted(e.target.value)} />
                <button type="button" onClick={() => p.onSigned(pasted || `sig(${p.message})`)}>
                    sign with wallet
                </button>
            </>
        );
    },
}));

import { OcLinkedIdentities } from '../linked-identities';

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let posts: Array<{ proof: string; transfer: boolean }>;
let issued: number;
let badOnce: boolean;

beforeEach(() => {
    posts = [];
    issued = 0;
    badOnce = false;
    const spent = new Set<string>();
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/auth/identities'))
            return json({ ok: true, did_oc: `did:oc:${'a'.repeat(32)}`, linked: [] });
        if (u.includes('/api/challenge')) return json({ message: `message ${++issued}` });
        if (u.includes('/api/auth/link/email-code')) return json({ ok: true, token: `token ${++issued}` });
        const link = /\/api\/auth\/link\/(btc|email)$/.exec(u);
        if (link) {
            const body = JSON.parse(String(init?.body)) as {
                message?: string;
                token?: string;
                confirm_transfer?: boolean;
            };
            const proof = (link[1] === 'btc' ? body.message : body.token) ?? '';
            posts.push({ proof, transfer: body.confirm_transfer === true });
            if (spent.has(proof))
                return json({ ok: false, reason: link[1] === 'btc' ? 'invalid_challenge' : 'code_invalid' }, 401);
            spent.add(proof);
            if (badOnce) {
                badOnce = false;
                return json({ ok: false, reason: 'sig_invalid' }, 401);
            }
            if (!body.confirm_transfer)
                return json({ ok: false, reason: `${link[1] === 'btc' ? 'address' : 'email'}_linked_elsewhere` }, 409);
            return json({ ok: true });
        }
        return json({}, 404);
    }) as unknown as typeof fetch;
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

const click = async (name: string | RegExp) => {
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name }));
    });
    await act(async () => {});
};

async function walletLinkedElsewhere(): Promise<void> {
    render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '+ link a Bitcoin address' }));
    fireEvent.change(screen.getByPlaceholderText(/bc1q/), { target: { value: ADDR } });
    await click('get challenge');
    await click('sign with wallet');
    expect(screen.getByRole('button', { name: 'transfer link here' })).toBeTruthy();
}

describe('OcLinkedIdentities · moving a way in here', () => {
    it('a wallet: transfer asks for one more signature over a new message, then moves it', async () => {
        await walletLinkedElsewhere();
        await click('transfer link here');
        expect(screen.getByText(/sign one more message/i)).toBeTruthy();
        await click('sign with wallet');
        expect(posts).toEqual([
            { proof: 'message 1', transfer: false },
            { proof: 'message 2', transfer: true },
        ]);
        expect(document.querySelector('[data-oc-li-form="btc"]')).toBeNull();
        expect(screen.queryByText(/invalid_challenge|challenge expired/i)).toBeNull();
    });

    it('a wallet: a refused signature brings a new message, and the next one still links', async () => {
        await walletLinkedElsewhere();
        await click('transfer link here');
        badOnce = true;
        fireEvent.change(screen.getByLabelText('pasted signature'), { target: { value: 'a bad paste' } });
        await click('sign with wallet');
        expect(document.querySelector('[data-oc-li-form="btc"]')?.textContent).toMatch(/signature/i);
        // A new message to sign, with nothing left over from the last one.
        expect((screen.getByLabelText('pasted signature') as HTMLInputElement).value).toBe('');
        await click('sign with wallet');
        expect(posts.map((p) => p.proof)).toEqual(['message 1', 'message 2', 'message 3']);
        expect(posts[2]).toEqual({ proof: 'message 3', transfer: true });
        expect(document.querySelector('[data-oc-li-form="btc"]')).toBeNull();
    });

    it('an email: transfer sends a new code, and that code moves it', async () => {
        render(<OcLinkedIdentities authOrigin="https://ochk.io" />);
        await act(async () => {});
        fireEvent.click(screen.getByRole('button', { name: '+ link an email' }));
        fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@example.com' } });
        await click('send code');
        fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '111111' } });
        await click('verify + link');
        await click('transfer link here');
        expect(screen.getByText(/new 6-digit code/i)).toBeTruthy();
        expect((screen.getByPlaceholderText('123456') as HTMLInputElement).value).toBe('');
        fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '222222' } });
        await click(/^verify \+ /);
        expect(posts).toEqual([
            { proof: 'token 1', transfer: false },
            { proof: 'token 2', transfer: true },
        ]);
        expect(document.querySelector('[data-oc-li-form="email"]')).toBeNull();
    });
});
