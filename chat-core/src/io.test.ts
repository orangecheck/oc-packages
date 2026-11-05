// The on-chain leg of the utxo-floor gate (SPEC §8.3.3 (1)), over a stubbed
// Esplora: the coin a proof names is read on its own, its transaction and then
// its outspend, so a wallet of any size can be checked.

import { describe, expect, it, vi } from 'vitest';

import type { WriteProof } from './channel';
import { ESPLORA_TIMEOUT_MS, esploraWriteProofCheck, readOutpoint, verifyWriteProofOnChain, writeProofOnChain } from './io';
import { UnansweredReadError } from './read';

const AUTHOR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const PROOF: WriteProof = {
    outpoint: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90:0',
    value_sats: 50000,
    anchor_block_height: 800000,
    anchor_block_hash: '00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054',
};
const [TXID] = PROOF.outpoint.split(':') as [string, string];

/** The coin as Esplora holds it, and how each of its two reads answers. */
interface Coin {
    address?: string;
    value?: number;
    confirmed?: boolean;
    height?: number;
    hash?: string;
    spent?: boolean;
    /** No output at vout 0. */
    noVout?: boolean;
    txStatus?: number;
    spendStatus?: number;
}

function explorer(coin: Coin = {}) {
    const calls: string[] = [];
    const f = async (url: string | URL) => {
        const u = String(url);
        calls.push(u.replace(/^.*\/api/, ''));
        // A large wallet: Esplora will not list the address's set at all.
        if (u.includes('/address/')) return new Response('Too many unspent transaction outputs (>500).', { status: 400 });
        if (u.endsWith('/outspend/0')) {
            if (coin.spendStatus) return new Response('', { status: coin.spendStatus });
            return Response.json({ spent: coin.spent ?? false });
        }
        if (coin.txStatus) return new Response('', { status: coin.txStatus });
        return Response.json({
            vout: coin.noVout ? [] : [{ scriptpubkey_address: coin.address ?? AUTHOR, value: coin.value ?? PROOF.value_sats }],
            status: {
                confirmed: coin.confirmed ?? true,
                block_height: coin.height ?? PROOF.anchor_block_height,
                block_hash: coin.hash ?? PROOF.anchor_block_hash,
            },
        });
    };
    return { f: f as unknown as typeof fetch, calls };
}

describe('writeProofOnChain reads the one coin a proof names', () => {
    it('verifies it for a wallet too big for the explorer to list, with the transaction and its outspend only', async () => {
        const { f, calls } = explorer();
        expect(await writeProofOnChain(PROOF, AUTHOR, { fetch: f })).toBe(true);
        expect(calls).toEqual([`/tx/${TXID}`, `/tx/${TXID}/outspend/0`]);
    });

    it('compares the address in normal form: a bech32 author in capitals is the same address', async () => {
        expect(await writeProofOnChain(PROOF, AUTHOR.toUpperCase(), { fetch: explorer().f })).toBe(true);
        expect(await writeProofOnChain(PROOF, AUTHOR, { fetch: explorer({ address: AUTHOR.toUpperCase() }).f })).toBe(true);
    });

    it.each<[string, Coin, Partial<WriteProof>?]>([
        ['a spent coin (a mempool spend included)', { spent: true }],
        ['another address', { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }],
        ['another value', { value: PROOF.value_sats + 1 }],
        ['an unconfirmed coin', { confirmed: false }],
        ['another anchor height', {}, { anchor_block_height: 799995 }],
        ['another block hash', {}, { anchor_block_hash: '0'.repeat(64) }],
        ['no such transaction (404)', { txStatus: 404 }],
        ['no such output to spend (404 on the outspend)', { spendStatus: 404 }],
        ['a vout the transaction does not have', { noVout: true }],
    ])('refuses %s', async (_name, coin, proof = {}) => {
        expect(await writeProofOnChain({ ...PROOF, ...proof }, AUTHOR, { fetch: explorer(coin).f })).toBe(false);
    });

    it.each<[string, Coin]>([
        ['a 429 on the transaction', { txStatus: 429 }],
        ['a 503 on the outspend', { spendStatus: 503 }],
    ])('answers no-answer for %s, and does not keep it', async (_name, coin) => {
        const cache = new Map();
        expect(await writeProofOnChain(PROOF, AUTHOR, { fetch: explorer(coin).f, cache })).toBe('no-answer');
        await Promise.resolve();
        expect(cache.size).toBe(0);
        // The next read gets an answer: nothing unanswered was kept.
        expect(await writeProofOnChain(PROOF, AUTHOR, { fetch: explorer().f, cache })).toBe(true);
    });

    it('a thrown fetch or a body that does not parse is unanswered', async () => {
        const throws = (async () => {
            throw new Error('offline');
        }) as unknown as typeof fetch;
        const garbled = (async () => new Response('<html>busy</html>')) as unknown as typeof fetch;
        expect(await readOutpoint(PROOF.outpoint, { fetch: throws })).toBe('unanswered');
        expect(await readOutpoint(PROOF.outpoint, { fetch: garbled })).toBe('unanswered');
    });

    it('verifyWriteProofOnChain is fail-closed: false when the explorer does not answer', async () => {
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: explorer({ txStatus: 503 }).f })).toBe(false);
        expect(await verifyWriteProofOnChain(PROOF, AUTHOR, { fetch: explorer().f })).toBe(true);
    });
});

describe('a read that never answers', () => {
    // A hung explorer is a read with no answer, never a wait (11-03 sweep PK-io).
    const hung = (() => new Promise<Response>(() => {})) as typeof fetch;
    const hungBody = (async (url: string | URL) =>
        String(url).includes('/outspend/')
            ? ({ ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response)
            : explorer().f(url)) as typeof fetch;

    it('is unanswered after timeoutMs, for the transaction and for the outspend body', async () => {
        const t0 = Date.now();
        expect(await readOutpoint(PROOF.outpoint, { fetch: hung, timeoutMs: 50 })).toBe('unanswered');
        expect(await readOutpoint(PROOF.outpoint, { fetch: hungBody, timeoutMs: 50 })).toBe('unanswered');
        expect(Date.now() - t0).toBeLessThan(2000);
    });

    it('aborts the request it gave up on', async () => {
        let signal: AbortSignal | undefined;
        const f = ((_: unknown, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>(() => {});
        }) as typeof fetch;
        await readOutpoint(PROOF.outpoint, { fetch: f, timeoutMs: 20 });
        expect(signal?.aborted).toBe(true);
    });

    it('gives up after ESPLORA_TIMEOUT_MS, 8 s, by default', async () => {
        vi.useFakeTimers();
        try {
            let done = false;
            const read = readOutpoint(PROOF.outpoint, { fetch: hung }).then((r) => {
                done = true;
                return r;
            });
            await vi.advanceTimersByTimeAsync(ESPLORA_TIMEOUT_MS - 1);
            expect(done).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            expect(await read).toBe('unanswered');
            expect(ESPLORA_TIMEOUT_MS).toBe(8000);
        } finally {
            vi.useRealTimers();
        }
    });

    it('through esploraWriteProofCheck, throws UnansweredReadError rather than waiting', async () => {
        const check = esploraWriteProofCheck({ fetch: hung, timeoutMs: 20 });
        await expect(check(PROOF, AUTHOR)).rejects.toBeInstanceOf(UnansweredReadError);
    });
});

describe('esploraWriteProofCheck', () => {
    it('reads each coin once per batch, at the base it is given', async () => {
        const seen: string[] = [];
        const f = (async (url: string) => {
            seen.push(url);
            return explorer().f(url);
        }) as unknown as typeof fetch;
        const check = esploraWriteProofCheck({ baseUrl: 'https://esplora.test/api/', fetch: f });
        expect(await check(PROOF, AUTHOR)).toBe(true);
        expect(await check({ ...PROOF, value_sats: 1 }, AUTHOR)).toBe(false);
        expect(seen).toEqual([`https://esplora.test/api/tx/${TXID}`, `https://esplora.test/api/tx/${TXID}/outspend/0`]);
    });

    it('throws UnansweredReadError on a read that gets no answer, so a verifier never reads silence as "no"', async () => {
        await expect(esploraWriteProofCheck({ fetch: explorer({ txStatus: 429 }).f })(PROOF, AUTHOR)).rejects.toBeInstanceOf(
            UnansweredReadError
        );
        expect(await esploraWriteProofCheck({ fetch: explorer({ spent: true }).f })(PROOF, AUTHOR)).toBe(false);
    });

    it("is false instead with unanswered: 'false', for a caller that only needs fail-closed", async () => {
        expect(await esploraWriteProofCheck({ fetch: explorer({ txStatus: 429 }).f, unanswered: 'false' })(PROOF, AUTHOR)).toBe(false);
    });
});
