/**
 * @vitest-environment jsdom
 *
 * Every submit button the sign-in draws is a 44px target, as its tabs and the
 * opt-in row are: Send one-time code, Verify, the wallet step's button and the
 * pasted signature's Sign me in. The padding round one line of text drew them
 * 41.7px tall. So is every field on those steps: the email, the code, the
 * address, the message, the pasted signature and, with two browser wallets,
 * the picker (the email field was 43.6 inside SignInFrame). Each step is
 * reached as a person reaches it, with the host answered by a stub.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The wallets the adapter detects: none in a browser by default, so the wallet path is the pasted signature.
const MANUAL = { id: 'manual', name: 'Manual', detected: true };
const adapter = vi.hoisted(() => ({ wallets: [] as Array<{ id: string; name: string; detected: boolean }> }));
vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => adapter.wallets,
    getSigner: () => async () => 'unused',
}));

import { OcSignIn } from '../signin';

adapter.wallets = [MANUAL];

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';

function stubFetch() {
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        const body = u.endsWith('/api/auth/providers')
            ? { providers: [] }
            : u.endsWith('/email-otp/start')
              ? { ok: true, token: 't1' }
              : u.includes('/api/challenge')
                ? { message: 'sign this', nonce: 'n1' }
                : {};
        return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
}

const floor = (name: RegExp) => (screen.getByRole('button', { name }) as HTMLButtonElement).style.minHeight;
// Every field the step draws that is under the floor: 44px tall at least, padding and border inside it.
const fields = () => [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=hidden]), textarea, select')];
const short = () => fields().filter((f) => f.style.minHeight !== '44px' || f.style.boxSizing !== 'border-box').map((f) => f.id);

afterEach(() => {
    adapter.wallets = [MANUAL];
    cleanup();
    vi.restoreAllMocks();
});

describe('the sign-in submit buttons are 44px tall at least', () => {
    it('on the email path: Send one-time code, then Verify', async () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        expect(floor(/Send one-time code/)).toBe('44px');
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        expect(floor(/Verify/)).toBe('44px');
    });

    it('on the wallet path: the wallet step, then the pasted signature', async () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        await act(async () => {});
        const step = /Get the message to sign|Sign in with wallet/;
        expect(floor(step)).toBe('44px');
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: step }));
        });
        expect(floor(/Sign me in/)).toBe('44px');
    });
});

describe('the sign-in fields are 44px tall at least', () => {
    it('on the email path: the email, then the code', async () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
        expect(fields()).toHaveLength(1);
        expect(short()).toEqual([]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        expect(screen.getByRole('textbox', { name: 'One-time code' })).toBeTruthy();
        expect(short()).toEqual([]);
    });

    it('on the wallet path: the address, then the message and the pasted signature', async () => {
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        await act(async () => {});
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
        expect(short()).toEqual([]);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign|Sign in with wallet/ }));
        });
        expect(screen.getByLabelText('Signature')).toBeTruthy();
        expect(fields().length).toBeGreaterThanOrEqual(2);
        expect(short()).toEqual([]);
    });

    it('on the wallet path with two browser wallets: the address and the picker', async () => {
        adapter.wallets = [{ id: 'unisat', name: 'UniSat', detected: true }, { id: 'xverse', name: 'Xverse', detected: true }, MANUAL];
        stubFetch();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        expect((await screen.findByLabelText('Sign with')).tagName).toBe('SELECT');
        expect(fields().map((f) => f.tagName)).toEqual(['INPUT', 'SELECT']);
        expect(short()).toEqual([]);
    });
});
