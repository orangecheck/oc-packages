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

import { type AnchorAnswer, type CoinFacts, MAX_ATTESTATIONS } from './directory.js';

/**
 * The anchor of a proof over `idHex` (§8.2.1): the height of its lowest Bitcoin
 * attestation, when the header there has the attested Merkle root. The lowest
 * attestation alone decides and is the only header read: one whose header carries
 * another root, or whose source answers null (no block at that height, as
 * mempoolHeaderSource answers only a 404), leaves the proof unanchored, never passed
 * over to a higher one. A header that cannot be read (the source throws, or answers
 * anything but 80 bytes) answers `{ unread: height }` (§8.2.5 (4)). A source must
 * never turn a failed read into null. Confirmations are the walk's to count.
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
    // More than MAX_ATTESTATIONS anchors nothing, before any header is read (§8.2.1).
    if (anchors.length > MAX_ATTESTATIONS) return null;
    const lowest = anchors[0];
    if (!lowest) return null;
    let header: unknown;
    try {
        header = await headers.getHeaderAt(lowest.blockHeight);
    } catch {
        return { unread: lowest.blockHeight };
    }
    if (header === null) return null;
    if (!(header instanceof Uint8Array) || header.byteLength !== 80) return { unread: lowest.blockHeight };
    return equal(header.subarray(36, 68), lowest.merkleRoot) ? lowest.blockHeight : null;
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

const height = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : undefined;

/** An Esplora `status`: confirmed with a height, or not confirmed. Anything else is undefined. */
function statusHeight(st: unknown): number | null | undefined {
    if (typeof st !== 'object' || st === null) return undefined;
    const { confirmed, block_height } = st as { confirmed?: unknown; block_height?: unknown };
    if (confirmed === false) return null;
    if (confirmed === true) return height(block_height);
    return undefined;
}

/**
 * Coin facts for an outpoint from an Esplora-style API, read strictly: a transaction the
 * API says does not exist (404), or an output index past its outputs, answers as a coin
 * that clears nothing. Any other failure, or an answer out of shape, is 'no-answer'.
 */
export function esploraCoinReader(
    opts: EsploraCoinReaderOptions = {}
): (outpoint: string) => Promise<CoinFacts | 'no-answer'> {
    for (const k of Object.keys(opts)) {
        if (k !== 'baseUrl' && k !== 'fetch' && k !== 'timeoutMs') {
            throw new TypeError(`esploraCoinReader does not read option "${k}"`);
        }
    }
    const base = (opts.baseUrl ?? 'https://mempool.space/api').replace(/\/+$/, '');
    const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const none: CoinFacts = { confirmedAt: null, value: 0, paysTo: '', spendHeight: null };
    const get = async (url: string): Promise<unknown | 'missing' | 'no-answer'> => {
        try {
            const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (r.status === 404) return 'missing';
            if (!r.ok) return 'no-answer';
            const body: unknown = await r.json();
            return typeof body === 'object' && body !== null && !Array.isArray(body) ? body : 'no-answer';
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
        const t = tx as { txid?: unknown; status?: unknown; vout?: unknown };
        const confirmedAt = statusHeight(t.status);
        if (t.txid !== txid || !Array.isArray(t.vout) || confirmedAt === undefined) return 'no-answer';
        if (vout >= t.vout.length) return none;
        const out = t.vout[vout] as { value?: unknown; scriptpubkey_address?: unknown } | null;
        if (typeof out !== 'object' || out === null) return 'no-answer';
        const value = height(out.value);
        if (value === undefined) return 'no-answer';
        const paysTo = out.scriptpubkey_address === undefined ? '' : out.scriptpubkey_address;
        if (typeof paysTo !== 'string') return 'no-answer';
        const spend = await get(`${base}/tx/${txid}/outspend/${vout}`);
        if (spend === 'no-answer' || spend === 'missing') return 'no-answer';
        const sp = spend as { spent?: unknown; status?: unknown };
        let spendHeight: number | null;
        if (sp.spent === false) spendHeight = null;
        else if (sp.spent === true) {
            // A spend in the mempool has no height yet; a confirmed one must carry it.
            const h = statusHeight(sp.status);
            if (h === undefined) return 'no-answer';
            spendHeight = h;
        } else return 'no-answer';
        return { confirmedAt, value, paysTo, spendHeight };
    };
}
