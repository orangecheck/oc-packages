/**
 * verify() reaches its verdict from the signature and chain state. No option
 * changes that, so an unsigned message fails whatever the caller passes.
 * Runs offline: a failed signature returns before any chain lookup.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VerifyOptions } from '../types';

import { buildCanonicalMessage, verify } from '../index';

const ADDR = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const MSG = buildCanonicalMessage(
    { address: ADDR, identities: [{ protocol: 'github', identifier: 'alice' }] },
    {},
    { nonce: '0011223344556677889900aabbccddee', issuedAt: '2026-04-22T12:00:00Z' }
);
const BAD_SIG = 'AkcwRAIgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('verify() options', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('network is off in this test')))
        );
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('a bad signature fails with demoMode set', async () => {
        const out = await verify(
            { addr: ADDR, msg: MSG, sig: BAD_SIG },
            { demoMode: true } as VerifyOptions
        );
        expect(out.ok).toBe(false);
        expect(out.codes).not.toContain('sig_ok_bip322');
        expect(out.codes).not.toContain('bond_confirmed');
        expect(out.metrics).toBeUndefined();
    });

    it('demoMode does not change the outcome', async () => {
        const input = { addr: ADDR, msg: MSG, sig: BAD_SIG };
        const plain = await verify(input);
        const flagged = await verify(input, { demoMode: true } as VerifyOptions);
        expect(flagged).toEqual(plain);
    });
});
