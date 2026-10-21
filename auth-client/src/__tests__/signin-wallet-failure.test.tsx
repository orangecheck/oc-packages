/**
 * @vitest-environment jsdom
 *
 * A browser wallet that declines, or signs with another account, is named in
 * the family's words on the sign-in form, never in the wallet's own.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const thrown = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('@orangecheck/wallet-adapter', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/wallet-adapter')>()),
    detectWallets: () => [{ id: 'unisat', name: 'UniSat', detected: true }],
    getSigner: () => async () => {
        throw thrown.value;
    },
}));

import { WrongAccountError } from '@orangecheck/wallet-adapter';

import { OcSignIn } from '../signin';

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

async function signInWithWallet(): Promise<string[]> {
    const posts: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.endsWith('/api/auth/providers')) return Response.json({ providers: [] });
        if (u.includes('/api/challenge')) return Response.json({ message: 'sign this', nonce: 'n1' });
        if (u.endsWith('/api/auth/signin')) posts.push(u);
        return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;
    render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Sign in with wallet/ }));
    });
    return posts;
}

describe('OcSignIn · a wallet that does not sign', () => {
    it('a decline reads as one, not as the wallet put it', async () => {
        thrown.value = { code: 4001, message: 'User rejected the request.' };
        const posts = await signInWithWallet();
        const said = screen.getByRole('alert').textContent;
        expect(said).toBe('The request was declined in your wallet. Sign again when you are ready.');
        expect(said).not.toMatch(/User rejected|object Object/);
        expect(posts).toEqual([]);
    });

    it('a wrong account says to switch the wallet to the address shown', async () => {
        thrown.value = new WrongAccountError(ADDR, 'bc1qother');
        await signInWithWallet();
        expect(screen.getByRole('alert').textContent).toBe(
            'That signature is not from the address shown. Switch your wallet to that address, then sign again.'
        );
    });
});
