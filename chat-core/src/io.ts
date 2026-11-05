// Readers over a public Esplora API (mempool.space by default) for the checks
// chat-core leaves to its caller. Public chain data only.

import { normalizeAddress } from '@orangecheck/bip322';

import type { VerifyOnChain, WriteProof } from './channel';
import { UnansweredReadError } from './read';

/** The coin a write proof names, as the explorer holds it. */
export interface OutpointRead {
    /** The output's scriptpubkey_address; null for a script with none. */
    address: string | null;
    value: number | null;
    confirmed: boolean;
    height: number | null;
    hash: string | null;
    /** Spent, a spend still in the mempool included. */
    spent: boolean;
}

/**
 * One read per outpoint for a batch of posts: two posts naming one coin read it
 * once. A read that got no answer is not kept, so the next asks again.
 */
export type WriteProofCache = Map<string, Promise<OutpointRead | 'missing' | 'unanswered'>>;

export interface EsploraOptions {
    /** Esplora API base; default https://mempool.space/api. */
    baseUrl?: string;
    fetch?: typeof fetch;
    /** Share one cache across the posts of a feed. */
    cache?: WriteProofCache;
    /** How long each of the two reads may take, its body included; default ESPLORA_TIMEOUT_MS. */
    timeoutMs?: number;
}

/** Each Esplora read's default time: past it, the read is aborted and has no answer. */
export const ESPLORA_TIMEOUT_MS = 8000;

/** `read` within `ms`, or 'timeout' and its request aborted. */
async function within<T>(ms: number, read: (signal: AbortSignal) => Promise<T>): Promise<T | 'timeout'> {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => {
            ctl.abort();
            resolve('timeout');
        }, ms);
    });
    try {
        return await Promise.race([read(ctl.signal), timedOut]);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The one coin a write proof names (§8.3.3 (1)): GET /tx/<txid> for the output
 * at vout, then GET /tx/<txid>/outspend/<vout>. A 404 from either, or a vout the
 * transaction does not have, is 'missing'. A 429, a 5xx, no answer within
 * `timeoutMs` (each read, its body included) or a body that does not parse is
 * 'unanswered'. Reading the coin rather than the address's whole UTXO set holds
 * for any wallet: Esplora refuses to list an address past a few hundred UTXOs,
 * and anyone can send an author dust.
 */
export async function readOutpoint(
    outpoint: string,
    opts: EsploraOptions = {}
): Promise<OutpointRead | 'missing' | 'unanswered'> {
    const hit = opts.cache?.get(outpoint);
    if (hit) return hit;
    const base = (opts.baseUrl ?? 'https://mempool.space/api').replace(/\/+$/, '');
    const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const p = (async (): Promise<OutpointRead | 'missing' | 'unanswered'> => {
        const sep = outpoint.lastIndexOf(':');
        const txid = outpoint.slice(0, sep);
        const vout = Number(outpoint.slice(sep + 1));
        if (sep <= 0 || !/^[0-9a-f]{64}$/i.test(txid) || !Number.isInteger(vout) || vout < 0) {
            return 'missing';
        }
        const ms = opts.timeoutMs ?? ESPLORA_TIMEOUT_MS;
        try {
            const tx = await within(ms, async (signal) => {
                const res = await f(`${base}/tx/${txid}`, { signal });
                if (res.status === 404) return 'missing' as const;
                if (!res.ok) return 'unanswered' as const;
                return (await res.json()) as {
                    vout?: { scriptpubkey_address?: string; value?: number }[];
                    status?: { confirmed?: boolean; block_height?: number; block_hash?: string };
                };
            });
            if (tx === 'timeout' || tx === 'unanswered') return 'unanswered';
            if (tx === 'missing') return 'missing';
            const out = tx.vout?.[vout];
            if (!out) return 'missing';
            const spend = await within(ms, async (signal) => {
                const res = await f(`${base}/tx/${txid}/outspend/${vout}`, { signal });
                if (res.status === 404) return 'missing' as const;
                if (!res.ok) return 'unanswered' as const;
                return (await res.json()) as { spent?: unknown };
            });
            if (spend === 'timeout' || spend === 'unanswered') return 'unanswered';
            if (spend === 'missing') return 'missing';
            if (typeof spend.spent !== 'boolean') return 'unanswered';
            return {
                address: out.scriptpubkey_address ?? null,
                value: typeof out.value === 'number' ? out.value : null,
                confirmed: tx.status?.confirmed === true,
                height: tx.status?.block_height ?? null,
                hash: tx.status?.block_hash ?? null,
                spent: spend.spent,
            };
        } catch {
            return 'unanswered';
        }
    })();
    opts.cache?.set(outpoint, p);
    void p.then((r) => {
        if (r === 'unanswered' && opts.cache?.get(outpoint) === p) opts.cache.delete(outpoint);
    });
    return p;
}

/**
 * Does a utxo-floor write proof match current chain state (§8.3.3 (1)), the
 * Bitcoin-load-bearing leg: the proof's outpoint pays the author's address
 * (both in normal form, so a bech32 address in capitals is the same address)
 * exactly the value, confirmed at the height and block hash the proof states,
 * and is unspent (a spend still in the mempool counts as spent)? 'no-answer'
 * when the explorer did not answer; false when the coin is missing or differs.
 */
export async function writeProofOnChain(
    proof: WriteProof,
    authorAddress: string,
    opts: EsploraOptions = {}
): Promise<boolean | 'no-answer'> {
    const coin = await readOutpoint(proof.outpoint, opts);
    if (coin === 'unanswered') return 'no-answer';
    if (coin === 'missing') return false;
    const owner = coin.address === null ? null : normalizeAddress(coin.address);
    return (
        owner !== null &&
        owner === normalizeAddress(authorAddress) &&
        coin.value === proof.value_sats &&
        coin.confirmed &&
        coin.height === proof.anchor_block_height &&
        coin.hash === proof.anchor_block_hash &&
        !coin.spent
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
 * A VerifyOnChain over Esplora, with one cache for the batch it is made for. A
 * read that gets no answer throws UnansweredReadError, so a verifier says it
 * could not tell rather than read the silence as "no" (verifyChannelPosts
 * counts the post unchecked). `unanswered: 'false'` makes it false instead, for
 * a caller that only needs fail-closed.
 */
export function esploraWriteProofCheck(
    opts: EsploraOptions & { unanswered?: 'throw' | 'false' } = {}
): VerifyOnChain {
    const cache = opts.cache ?? new Map();
    return async (proof, address) => {
        const r = await writeProofOnChain(proof, address, { ...opts, cache });
        if (r === 'no-answer') {
            if (opts.unanswered === 'false') return false;
            throw new UnansweredReadError('the chain could not be read');
        }
        return r;
    };
}
