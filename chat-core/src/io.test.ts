// The on-chain leg of the utxo-floor gate (SPEC §8.3.3), over a stubbed Esplora.

import { describe, expect, it } from 'vitest';

import type { WriteProof } from './channel';
import { esploraWriteProofCheck, verifyWriteProofOnChain } from './io';

const AUTHOR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const PROOF: WriteProof = {
    outpoint: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90:0',
    value_sats: 50000,
    anchor_block_height: 800000,
    anchor_block_hash: '00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054',
};
const [TXID, VOUT] = PROOF.outpoint.split(':') as [string, string];
/** The author's UTXO set as Esplora returns it. */
const coin = {
    txid: TXID,
    vout: Number(VOUT),
    value: PROOF.value_sats,
    status: { confirmed: true, block_height: PROOF.anchor_block_height, block_hash: PROOF.anchor_block_hash },
};
const serving = (utxos: unknown, seen?: string[]) =>
    (async (url: string) => {
        seen?.push(url);
        return { ok: true, json: async () => utxos } as unknown as Response;
    }) as unknown as typeof fetch;

describe('verifyWriteProofOnChain', () => {
    it('accepts a proof matching an unspent output of the address, exact in value, height and hash', async () => {
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: serving([coin]) })).toBe(true);
    });

    it('refuses a value the coin does not carry', async () => {
        const forged = { ...PROOF, value_sats: PROOF.value_sats + 1 };
        expect(await verifyWriteProofOnChain(forged, AUTHOR, { fetch: serving([coin]) })).toBe(false);
    });

    it('refuses an outpoint not in the address UTXO set (not owned, or spent)', async () => {
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: serving([]) })).toBe(false);
    });

    it('refuses another anchor height or block hash', async () => {
        const f = serving([coin]);
        expect(await verifyWriteProofOnChain({ ...PROOF, anchor_block_height: 799995 }, AUTHOR, { fetch: f })).toBe(false);
        expect(await verifyWriteProofOnChain({ ...PROOF, anchor_block_hash: '0'.repeat(64) }, AUTHOR, { fetch: f })).toBe(false);
    });

    it('refuses an unconfirmed coin', async () => {
        const pending = { ...coin, status: { ...coin.status, confirmed: false } };
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: serving([pending]) })).toBe(false);
    });

    it('is false when the explorer does not answer', async () => {
        const down = (async () => ({ ok: false }) as unknown as Response) as unknown as typeof fetch;
        const throws = (async () => {
            throw new Error('offline');
        }) as unknown as typeof fetch;
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: down })).toBe(false);
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: throws })).toBe(false);
    });

    it('reads each address once per batch', async () => {
        const seen: string[] = [];
        const check = esploraWriteProofCheck({ baseUrl: 'https://esplora.test/api/', fetch: serving([coin], seen) });
        expect(await check(PROOF, AUTHOR)).toBe(true);
        expect(await check({ ...PROOF, value_sats: 1 }, AUTHOR)).toBe(false);
        expect(seen).toEqual([`https://esplora.test/api/address/${AUTHOR}/utxo`]);
    });
});
