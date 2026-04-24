// UTXO snapshot source for the CLI. Defaults to mempool.space; swappable via
// --mempool-base flag.

import type { Utxo, UtxoLookup } from '@orangecheck/vote-core';

interface MempoolUtxo {
    txid: string;
    vout: number;
    value: number;
    status: { confirmed: boolean; block_height?: number; block_time?: number };
}

export interface UtxoSource {
    fetchUtxos(address: string): Promise<Utxo[]>;
    fetchTipHeight(): Promise<number>;
}

export function mempoolSource(base = 'https://mempool.space/api'): UtxoSource {
    return {
        async fetchUtxos(address) {
            const res = await fetch(`${base}/address/${address}/utxo`, {
                headers: { accept: 'application/json' },
            });
            if (!res.ok) throw new Error(`mempool utxo ${res.status}`);
            const data = (await res.json()) as MempoolUtxo[];
            return data
                .filter((u) => u.status.confirmed && typeof u.status.block_height === 'number')
                .map((u) => ({
                    value: u.value,
                    confirmed_height: u.status.block_height as number,
                }));
        },
        async fetchTipHeight() {
            const res = await fetch(`${base}/blocks/tip/height`);
            if (!res.ok) throw new Error(`tip ${res.status}`);
            return Number.parseInt((await res.text()).trim(), 10);
        },
    };
}

export function buildLookup(source: UtxoSource): UtxoLookup {
    return async (addr: string, snapshot: number): Promise<Utxo[]> => {
        const all = await source.fetchUtxos(addr);
        return all.filter((u) => u.confirmed_height <= snapshot);
    };
}
