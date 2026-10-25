// The chain reads behind the directory walk (lock-core/directory): a claim's or
// re-point's anchor from its OpenTimestamps proof, and coin facts from an
// Esplora-style API (mempool.space by default). Every failure to read is
// 'no-answer' or `{ unread }`, never a fail (oc-chat-protocol SPEC §8.2.5 (4)).

import {
    base64Decode,
    bitcoinAnchors,
    type BlockHeaderSource,
    hexDecode,
    parseProof,
} from '@orangecheck/stamp-ots';

import type { AnchorAnswer, CoinFacts } from './directory.js';

/**
 * The anchor of a proof over `idHex` (§8.2.1): the lowest Bitcoin attestation whose
 * header has the attested Merkle root. A header the source cannot read answers
 * `{ unread: height }` for that attestation, since a lower verified one decides the
 * order. Confirmations are the walk's to count.
 */
export async function directoryAnchor(
    proofB64: string,
    idHex: string,
    headers: BlockHeaderSource
): Promise<AnchorAnswer> {
    let anchors: ReturnType<typeof bitcoinAnchors>;
    try {
        anchors = bitcoinAnchors(parseProof(base64Decode(proofB64), hexDecode(idHex)));
    } catch {
        return null;
    }
    for (const a of anchors) {
        let header: Uint8Array | null;
        try {
            header = await headers.getHeaderAt(a.blockHeight);
        } catch {
            return { unread: a.blockHeight };
        }
        if (header && header.byteLength === 80 && equal(header.subarray(36, 68), a.merkleRoot)) {
            return a.blockHeight;
        }
    }
    return null;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

export interface EsploraCoinReaderOptions {
    /** Defaults to https://mempool.space/api. */
    baseUrl?: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

/**
 * Coin facts for an outpoint from an Esplora-style API. An outpoint the API says does
 * not exist answers as a coin that clears nothing; any other failure is 'no-answer'.
 */
export function esploraCoinReader(
    opts: EsploraCoinReaderOptions = {}
): (outpoint: string) => Promise<CoinFacts | 'no-answer'> {
    const base = (opts.baseUrl ?? 'https://mempool.space/api').replace(/\/+$/, '');
    const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const none: CoinFacts = { confirmedAt: null, value: 0, paysTo: '', spendHeight: null };
    const get = async (url: string): Promise<unknown | 'missing' | 'no-answer'> => {
        try {
            const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (r.status === 404) return 'missing';
            if (!r.ok) return 'no-answer';
            return await r.json();
        } catch {
            return 'no-answer';
        }
    };
    return async (outpoint) => {
        const m = /^([0-9a-f]{64}):(\d{1,10})$/.exec(outpoint);
        if (!m) return none;
        const [, txid, voutRaw] = m;
        const vout = Number(voutRaw);
        const tx = await get(`${base}/tx/${txid}`);
        if (tx === 'no-answer') return 'no-answer';
        if (tx === 'missing') return none;
        const t = tx as { status?: { confirmed?: unknown; block_height?: unknown }; vout?: unknown };
        const out = Array.isArray(t.vout) ? (t.vout[vout] as { value?: unknown; scriptpubkey_address?: unknown } | undefined) : undefined;
        if (!out) return none;
        const spend = await get(`${base}/tx/${txid}/outspend/${vout}`);
        if (spend === 'no-answer' || spend === 'missing') return 'no-answer';
        const s = spend as { spent?: unknown; status?: { confirmed?: unknown; block_height?: unknown } };
        const height = (st: { confirmed?: unknown; block_height?: unknown } | undefined): number | null =>
            st?.confirmed === true && typeof st.block_height === 'number' ? st.block_height : null;
        return {
            confirmedAt: height(t.status),
            value: typeof out.value === 'number' ? out.value : 0,
            paysTo: typeof out.scriptpubkey_address === 'string' ? out.scriptpubkey_address : '',
            spendHeight: s.spent === true ? height(s.status) : null,
        };
    };
}
