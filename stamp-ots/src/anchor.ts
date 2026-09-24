// Anchor verification. See SPEC.md §6.3.
//
// A confirmed anchor holds when all three are true:
//   1. the proof commits to the envelope id and walks to a Bitcoin
//      attestation at the declared height;
//   2. the message at that attestation equals the Merkle root in the block
//      header at that height;
//   3. that header double-SHA256es to the declared block hash.
//
// The resulting function is what `@orangecheck/stamp-core` expects at the
// `verifyOtsAnchor` input of `verify()`.

import { sha256 } from '@noble/hashes/sha2';

import { base64Decode, hexDecode, hexEncode } from './base64.js';
import { bitcoinAnchors, bytesEqual, parseProof } from './ots.js';
import type {
    AnchorVerificationInput,
    AnchorVerificationResult,
    AnchorVerifier,
    BlockHeaderSource,
} from './types.js';

export interface AnchorVerifierConfig {
    /**
     * Parse the proof bytes and return the Merkle root the proof walks to,
     * plus its block height. Optional: the built-in OTS parser is used when
     * omitted. `blockHeight` is the declared height, for proofs that carry
     * attestations at more than one height.
     */
    walkProof?: (input: {
        proofBytes: Uint8Array;
        digest: Uint8Array;
        blockHeight?: number;
    }) => Promise<{ merkleRoot: Uint8Array; blockHeight: number } | null>;
    /**
     * Source of Bitcoin block headers: a full node, SPV, a headers snapshot,
     * or `mempoolHeaderSource()`. This is the verifier's trust anchor.
     */
    headerSource: BlockHeaderSource;
}

/** Built-in walker: parse the OTS proof and pick the Bitcoin attestation. */
export async function walkOtsProof(input: {
    proofBytes: Uint8Array;
    digest: Uint8Array;
    blockHeight?: number;
}): Promise<{ merkleRoot: Uint8Array; blockHeight: number } | null> {
    try {
        const anchors = bitcoinAnchors(parseProof(input.proofBytes, input.digest));
        return anchors.find((a) => a.blockHeight === input.blockHeight) ?? anchors[0] ?? null;
    } catch {
        return null;
    }
}

/** Block hash (display hex) of an 80-byte header. */
export function blockHashOf(header: Uint8Array): string {
    return hexEncode(sha256(sha256(header)).reverse());
}

export function makeAnchorVerifier(
    cfg: AnchorVerifierConfig
): (proofB64: string, blockHeight: number, blockHash: string, envelopeId: string) => Promise<boolean> {
    const walkProof = cfg.walkProof ?? walkOtsProof;
    const verifier: AnchorVerifier = async (
        input: AnchorVerificationInput
    ): Promise<AnchorVerificationResult> => {
        const walked = await walkProof({
            proofBytes: input.proofBytes,
            digest: input.digest,
            blockHeight: input.blockHeight,
        });
        if (!walked) {
            return { ok: false, reason: 'proof could not be walked to a Bitcoin commitment' };
        }
        if (walked.blockHeight !== input.blockHeight) {
            return {
                ok: false,
                reason: `proof anchors at block ${walked.blockHeight}, envelope declares ${input.blockHeight}`,
            };
        }
        const header = await cfg.headerSource.getHeaderAt(input.blockHeight);
        if (!header || header.byteLength !== 80) {
            return { ok: false, reason: `no block header available at height ${input.blockHeight}` };
        }
        if (blockHashOf(header) !== input.blockHash.toLowerCase()) {
            return { ok: false, reason: 'block header does not hash to the declared block hash' };
        }
        // OTS attests to the Merkle root in header byte order (offset 36).
        const headerMerkle = header.subarray(36, 68);
        if (!bytesEqual(headerMerkle, walked.merkleRoot)) {
            return { ok: false, reason: 'block header Merkle root does not match walked proof root' };
        }
        return { ok: true, merkleRoot: hexEncode(headerMerkle) };
    };

    return async (proofB64, blockHeight, blockHash, envelopeId) => {
        const r = await verifier({
            proofBytes: base64Decode(proofB64),
            digest: hexDecode(envelopeId),
            blockHeight,
            blockHash,
        });
        return r.ok;
    };
}

/**
 * Anchor verifier using the built-in OTS parser. Kept async for callers of the
 * 0.1 API, which lazily loaded an optional parser here.
 */
export async function makeDefaultAnchorVerifier(opts: {
    headerSource: BlockHeaderSource;
}): Promise<
    (proofB64: string, blockHeight: number, blockHash: string, envelopeId: string) => Promise<boolean>
> {
    return makeAnchorVerifier({ headerSource: opts.headerSource });
}

export interface MempoolHeaderSourceOptions {
    /** Esplora-compatible API base. Default https://mempool.space/api. */
    baseUrl?: string;
    fetch?: typeof fetch;
}

/**
 * Block headers from an Esplora-compatible API. The verifier checks each
 * header against the declared block hash, so this source is trusted only to
 * report which block is at a height.
 */
export function mempoolHeaderSource(opts: MempoolHeaderSourceOptions = {}): BlockHeaderSource {
    const base = (opts.baseUrl ?? 'https://mempool.space/api').replace(/\/+$/, '');
    const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    return {
        async getHeaderAt(height) {
            const h = await fetchImpl(`${base}/block-height/${height}`);
            if (!h.ok) return null;
            const hash = (await h.text()).trim();
            if (!/^[0-9a-f]{64}$/.test(hash)) return null;
            const r = await fetchImpl(`${base}/block/${hash}/header`);
            if (!r.ok) return null;
            const hex = (await r.text()).trim();
            return /^[0-9a-f]{160}$/.test(hex) ? hexDecode(hex) : null;
        },
    };
}
