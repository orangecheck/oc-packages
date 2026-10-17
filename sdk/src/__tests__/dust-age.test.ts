/**
 * Old dust must not lend its age to a fresh deposit. With no `bond:` line,
 * the age a checker compares to `minDays` is the youngest of the oldest coins
 * that cover `minSats`, as the bonded-set rule in SPEC §7 already is.
 * Before, it was the single oldest coin: a year-old 546-sat output plus
 * 100,000 sats deposited today passed `minDays: 365`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { verify } from '../verify';
import tv21 from './vectors/tv21.json';

const { address, message, signature } = tv21.input as {
    address: string;
    message: string;
    signature: string;
};
const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

function coin(value: number, daysOld: number, n: number) {
    return {
        txid: n.toString(16).padStart(64, '0'),
        vout: 0,
        value,
        status: { confirmed: true, block_height: 900_000 + n, block_time: now - daysOld * DAY },
    };
}

function chainWith(utxos: unknown[]) {
    vi.stubGlobal('fetch', async (url: string) =>
        url.endsWith(`/address/${address}/utxo`)
            ? new Response(JSON.stringify(utxos))
            : new Response('not found', { status: 404 })
    );
}

afterEach(() => vi.unstubAllGlobals());

describe('coin age under a minimum amount', () => {
    it('ages the deposit, not the dust beside it', async () => {
        chainWith([coin(546, 400, 1), coin(100_000, 1, 2)]);
        const r = await verify({ addr: address, msg: message, sig: signature }, { coverSats: 100_000 });
        expect(r.metrics).toMatchObject({ sats_bonded: 100_546, days_unspent: 1 });
    });

    it('stops at the coins it needs, oldest first', async () => {
        chainWith([coin(80_000, 300, 1), coin(30_000, 200, 2), coin(5_000, 2, 3)]);
        const r = await verify({ addr: address, msg: message, sig: signature }, { coverSats: 100_000 });
        expect(r.metrics?.days_unspent).toBe(200);
    });

    it('keeps the plain metric for callers that ask for no amount', async () => {
        chainWith([coin(546, 400, 1), coin(100_000, 1, 2)]);
        const r = await verify({ addr: address, msg: message, sig: signature });
        expect(r.metrics?.days_unspent).toBe(400);
    });
});
