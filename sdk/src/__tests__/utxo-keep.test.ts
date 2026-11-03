/**
 * A server that answers many checks of one address read the chain once per
 * check: a caller varying min_sats or min_days made each question a fresh
 * UTXO read against mempool.space, which then rate-limits every check.
 * `utxoKeepMs` keeps each address's read for the window in this process and
 * shares a read in flight. Unset, every verify() reads the chain, as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verify } from '../verify';
import tv21 from './vectors/tv21.json';

const { address, message, signature } = tv21.input as {
    address: string;
    message: string;
    signature: string;
};
const now = Math.floor(Date.now() / 1000);
const COINS = [
    {
        txid: '1'.padStart(64, '0'),
        vout: 0,
        value: 100_000,
        status: { confirmed: true, block_height: 900_001, block_time: now - 40 * 86_400 },
    },
];

let reads = 0;
let failNext = false;
beforeEach(() => {
    reads = 0;
    failNext = false;
    vi.stubGlobal('fetch', async (url: string) => {
        if (!url.endsWith(`/address/${address}/utxo`)) return new Response('no', { status: 404 });
        reads++;
        if (failNext) return new Response('busy', { status: 503 });
        return new Response(JSON.stringify(COINS));
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

const input = { addr: address, msg: message, sig: signature };
// Each test its own endpoint, so nothing one keeps is seen by another.
let n = 0;
const keep = (ms: number) => ({ utxoKeepMs: ms, esploraMainnetBase: `https://e${++n}.example/api` });

describe('verify({ utxoKeepMs })', () => {
    it('reads the chain on every verify() when unset', async () => {
        await verify(input);
        await verify(input);
        expect(reads).toBe(2);
    });

    it('reads an address once a window, and once for reads in flight together', async () => {
        const opts = keep(30_000);
        const answers = await Promise.all([verify(input, opts), verify(input, opts), verify(input, opts)]);
        await verify(input, { ...opts, coverSats: 50_000 });
        expect(reads).toBe(1);
        expect(answers.map((a) => a.metrics?.sats_bonded)).toEqual([100_000, 100_000, 100_000]);
    });

    it('reads again once the window is over', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const opts = keep(30_000);
        await verify(input, opts);
        vi.setSystemTime(Date.now() + 30_000);
        await verify(input, opts);
        expect(reads).toBe(2);
    });

    it('keeps no failed read', async () => {
        const opts = keep(30_000);
        failNext = true;
        await verify(input, opts);
        const firstReads = reads;
        failNext = false;
        const r = await verify(input, opts);
        expect(reads).toBeGreaterThan(firstReads);
        expect(r.metrics?.sats_bonded).toBe(100_000);
    });
});
