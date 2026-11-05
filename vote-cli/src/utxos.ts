// UTXO snapshot source for the CLI. Defaults to mempool.space; swappable via
// --mempool-base flag.

import { UtxoUnreadError, type Utxo, type UtxoLookup } from '@orangecheck/vote-core';

interface MempoolUtxo {
    txid: string;
    vout: number;
    value: number;
    status: { confirmed: boolean; block_height?: number; block_time?: number };
}

export interface UtxoSource {
    fetchUtxos(address: string): Promise<Utxo[]>;
}

/** How long one ask may take, its body included: a hung explorer is a voter not read, not a tally that waits. */
export const UTXO_FETCH_TIMEOUT_MS = 8_000;

/**
 * Why a voter's coins were not read (OC Vote SPEC §8). mempool.space answers 400
 * "Too many unspent transaction outputs (>500)" for an address with more coins
 * than it lists (read 2026-11-05; blockstream says "Too many unspent outputs"),
 * and anyone can push an address there by sending it dust. A rate limit, a
 * server error, no answer or an answer that is not a coin list may pass; any
 * other refusal is the explorer's.
 */
function unreadBecause(status: number, body: string): UtxoUnreadError {
    if (/too many unspent/i.test(body)) {
        return new UtxoUnreadError('utxo_cap_unread', `mempool utxo ${status}: past its cap`);
    }
    if (status === 429 || status >= 500) {
        return new UtxoUnreadError('chain_unread', `mempool utxo ${status}`);
    }
    return new UtxoUnreadError('provider_refused_unread', `mempool utxo ${status}`);
}

/** A coin as mempool.space lists it, or null for anything else. */
function asCoin(u: unknown): MempoolUtxo | null {
    const c = u as MempoolUtxo | null;
    return c && typeof c === 'object' && typeof c.value === 'number' && c.status && typeof c.status === 'object'
        ? c
        : null;
}

/** `work` with a signal that aborts after `ms`, body reads included. */
async function withTimeout<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    try {
        return await work(ac.signal);
    } finally {
        clearTimeout(timer);
    }
}

export function mempoolSource(base = 'https://mempool.space/api', timeoutMs = UTXO_FETCH_TIMEOUT_MS): UtxoSource {
    return {
        /** Throws UtxoUnreadError when the coins were not read, so the tally names the voter. */
        async fetchUtxos(address) {
            let data: unknown;
            try {
                data = await withTimeout(timeoutMs, async (signal) => {
                    const res = await fetch(`${base}/address/${address}/utxo`, {
                        headers: { accept: 'application/json' },
                        signal,
                    });
                    if (!res.ok) throw unreadBecause(res.status, await res.text().catch(() => ''));
                    return res.json();
                });
            } catch (err) {
                if (err instanceof UtxoUnreadError) throw err;
                // No answer, a timeout, a body that is not JSON, or a bug here:
                // each reads as chain_unread, so say which by name. Only the
                // name: a message can carry the voter's address.
                process.stderr.write(
                    `oc-vote: coin lookup threw ${err instanceof Error ? err.name : typeof err}; read as chain_unread\n`
                );
                throw new UtxoUnreadError('chain_unread', 'mempool utxo: no answer');
            }
            const listed = Array.isArray(data) ? data.map(asCoin) : null;
            if (!listed || listed.some((c) => c === null)) {
                process.stderr.write('oc-vote: coin lookup answered something other than a coin list; read as chain_unread\n');
                throw new UtxoUnreadError('chain_unread', 'mempool utxo: not a coin list');
            }
            return (listed as MempoolUtxo[])
                .filter((u) => u.status.confirmed && typeof u.status.block_height === 'number')
                .map((u) => ({
                    value: u.value,
                    confirmed_height: u.status.block_height as number,
                }));
        },
    };
}

export function buildLookup(source: UtxoSource): UtxoLookup {
    return async (addr: string, snapshot: number): Promise<Utxo[]> => {
        const all = await source.fetchUtxos(addr);
        return all.filter((u) => u.confirmed_height <= snapshot);
    };
}
