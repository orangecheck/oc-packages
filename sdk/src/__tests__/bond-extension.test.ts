/**
 * SPEC §2.2: a signed `bond:` value is base-10 ASCII digits up to 2^53 - 1.
 * Any other value fails the attestation as bond_malformed, before any chain
 * read, rather than reading as a smaller bond or as no bond at all.
 */

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, verify } from '../index';

const KEY = '11'.repeat(32);
const ADDR = addressFromPrivateKey(KEY, 'p2wpkh');

function signedWithBond(value: string) {
    const msg = buildCanonicalMessage({ address: ADDR, identities: [] }, { bond: '5000' }, {
        nonce: '0011223344556677889900aabbccddee',
        issuedAt: '2026-04-22T12:00:00Z',
    }).replace('\nbond: 5000\n', `\nbond: ${value}\n`);
    return { addr: ADDR, msg, sig: signMessage(ADDR, msg, KEY) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('verify · bond: extension', () => {
    it.each(['5000abc', '1e9', '+5000', '5000.0', '9007199254740992'])(
        'fails a signed bond of %j as bond_malformed without reading the chain',
        async (value) => {
            const fetch = vi.fn();
            vi.stubGlobal('fetch', fetch);
            const out = await verify(signedWithBond(value));
            expect(out.ok).toBe(false);
            expect(out.codes).toContain('bond_malformed');
            expect(fetch).not.toHaveBeenCalled();
        }
    );

    it('reads a bond of plain digits and goes on to the chain', async () => {
        const fetch = vi.fn(async () => new Response('[]', { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        const out = await verify(signedWithBond('5000'));
        expect(out.codes).not.toContain('bond_malformed');
        expect(fetch).toHaveBeenCalled();
    });
});
