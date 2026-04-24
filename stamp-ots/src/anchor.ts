// Anchor-verification helper. See SPEC.md §6.3.
//
// Full OTS proof verification requires:
//   1. Parsing the proof's Merkle path from digest to calendar root.
//   2. Walking that path to the declared Bitcoin Merkle root.
//   3. Fetching the Bitcoin block header at the declared height and comparing
//      its Merkle root.
//
// Step 1 needs a maintained OTS proof parser. We do not ship one here; this
// file exposes a small helper that composes a parsed-anchor result with a
// block-header source into the `verifyOtsAnchor` callback expected by
// @orangecheck/stamp-core's verify().

import { base64Decode, hexEncode } from './base64.js';
import type {
    AnchorVerificationInput,
    AnchorVerificationResult,
    AnchorVerifier,
    BlockHeaderSource,
} from './types.js';

export interface AnchorVerifierConfig {
    /**
     * Parse the proof bytes and return the Merkle root the proof walks to,
     * plus the declared block height. Returns null if parsing failed or the
     * proof isn't anchored.
     */
    walkProof: (input: {
        proofBytes: Uint8Array;
        digest: Uint8Array;
    }) => Promise<{ merkleRoot: Uint8Array; blockHeight: number } | null>;
    /**
     * Source of Bitcoin block headers. Can be a full node, SPV, or a
     * pre-computed headers snapshot.
     */
    headerSource: BlockHeaderSource;
}

/**
 * Build a concrete anchor verifier from a proof walker plus a header source.
 *
 * Callers wire this into `verify({ verifyOtsAnchor: makeAnchorVerifier(...) })`.
 * If either the proof walker returns null or the header's Merkle root does
 * not match, the verifier returns `{ ok: false, ... }`.
 */
export function makeAnchorVerifier(cfg: AnchorVerifierConfig): AnchorVerifier {
    return async (input: AnchorVerificationInput): Promise<AnchorVerificationResult> => {
        const walked = await cfg.walkProof({ proofBytes: input.proofBytes, digest: input.digest });
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
        if (!header) {
            return { ok: false, reason: `no block header available at height ${input.blockHeight}` };
        }
        // Bitcoin block header: 80 bytes. Merkle root is at offset 36, 32 bytes,
        // stored little-endian. Compare to the proof-walked root, which OTS
        // reports in big-endian conventionally.
        if (header.byteLength < 80) {
            return { ok: false, reason: 'malformed Bitcoin header (too short)' };
        }
        const headerMerkleLE = header.subarray(36, 68);
        const headerMerkleBE = new Uint8Array(headerMerkleLE).reverse();
        const matchesLE = bytesEqual(headerMerkleLE, walked.merkleRoot);
        const matchesBE = bytesEqual(headerMerkleBE, walked.merkleRoot);
        if (!matchesLE && !matchesBE) {
            return { ok: false, reason: 'block header Merkle root does not match walked proof root' };
        }
        return { ok: true, merkleRoot: hexEncode(matchesBE ? headerMerkleBE : headerMerkleLE) };
    };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Adapt an AnchorVerifier into the signature that
 * @orangecheck/stamp-core#verify expects: a function taking (proofB64,
 * blockHeight, blockHash) that returns boolean.
 */
export function adaptAnchorVerifier(
    verifier: AnchorVerifier,
    digestLookup: (blockHash: string) => Uint8Array
): (proofB64: string, blockHeight: number, blockHash: string) => Promise<boolean> {
    return async (proofB64, blockHeight, blockHash) => {
        const r = await verifier({
            proofBytes: base64Decode(proofB64),
            digest: digestLookup(blockHash),
            blockHeight,
            blockHash,
        });
        return r.ok;
    };
}
