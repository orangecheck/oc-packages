// Readers over a public Esplora API (mempool.space by default) for the checks
// chat-core leaves to its caller. Public chain data only.

import type { VerifyOnChain, WriteProof } from './channel';
import { UnansweredReadError } from './read';

/** One output from Esplora's /address/<addr>/utxo. */
export interface MempoolUtxo {
    txid: string;
    vout: number;
    value?: number;
    status?: { confirmed?: boolean; block_height?: number; block_hash?: string };
}

/** One address→UTXO-set read per distinct author for a batch of posts. */
export type WriteProofUtxoCache = Map<string, Promise<MempoolUtxo[] | null>>;

export interface EsploraOptions {
    /** Esplora API base; default https://mempool.space/api. */
    baseUrl?: string;
    fetch?: typeof fetch;
    /** Share one cache across the posts of a feed. */
    utxoCache?: WriteProofUtxoCache;
}

async function addressUtxos(
    address: string,
    base: string,
    f: typeof fetch,
    cache?: WriteProofUtxoCache
): Promise<MempoolUtxo[] | null> {
    const hit = cache?.get(address);
    if (hit) return hit;
    const p = (async () => {
        try {
            const res = await f(`${base}/address/${encodeURIComponent(address)}/utxo`);
            if (!res.ok) return null;
            return (await res.json()) as MempoolUtxo[];
        } catch {
            return null;
        }
    })();
    cache?.set(address, p);
    return p;
}

/**
 * Does a utxo-floor write proof match current chain state (§8.3.3), the
 * Bitcoin-load-bearing leg: the proof's outpoint is an unspent output of the
 * author's address with exactly the value, confirmation height and block hash
 * the proof states? 'no-answer' when the address's outputs could not be read.
 */
export async function writeProofOnChain(
    proof: WriteProof,
    authorAddress: string,
    opts: EsploraOptions = {}
): Promise<boolean | 'no-answer'> {
    const base = (opts.baseUrl ?? 'https://mempool.space/api').replace(/\/+$/, '');
    const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const utxos = await addressUtxos(authorAddress, base, f, opts.utxoCache);
    if (!utxos) return 'no-answer';
    const sep = proof.outpoint.lastIndexOf(':');
    if (sep <= 0) return false;
    const txid = proof.outpoint.slice(0, sep);
    const vout = Number.parseInt(proof.outpoint.slice(sep + 1), 10);
    return utxos.some(
        (u) =>
            u.txid === txid &&
            u.vout === vout &&
            u.status?.confirmed === true &&
            u.value === proof.value_sats &&
            u.status?.block_height === proof.anchor_block_height &&
            u.status?.block_hash === proof.anchor_block_hash
    );
}

/** writeProofOnChain, fail-closed: an unanswered read is false, so the post does not render. */
export async function verifyWriteProofOnChain(
    proof: WriteProof,
    authorAddress: string,
    opts: EsploraOptions = {}
): Promise<boolean> {
    return (await writeProofOnChain(proof, authorAddress, opts)) === true;
}

/**
 * A VerifyOnChain over Esplora, with one cache for the batch it is made for. An
 * unanswered read is false (a feed hides the post), or with `unanswered: 'throw'`
 * an UnansweredReadError, for a verifier that must say it could not tell.
 */
export function esploraWriteProofCheck(
    opts: EsploraOptions & { unanswered?: 'false' | 'throw' } = {}
): VerifyOnChain {
    const utxoCache = opts.utxoCache ?? new Map();
    return async (proof, address) => {
        const r = await writeProofOnChain(proof, address, { ...opts, utxoCache });
        if (r === 'no-answer') {
            if (opts.unanswered === 'throw') throw new UnansweredReadError('the chain could not be read');
            return false;
        }
        return r;
    };
}
