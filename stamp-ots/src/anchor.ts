// Anchor-verification helper. See SPEC.md §6.3.
//
// Full OTS proof verification requires:
//   1. Parsing the proof's Merkle path from digest to calendar root.
//   2. Walking that path to the declared Bitcoin Merkle root.
//   3. Fetching the Bitcoin block header at the declared height and comparing
//      its Merkle root.
//
// Step 1 needs a real OTS proof parser. We expose two composition points:
//
//   A) `makeAnchorVerifier({ walkProof, headerSource })` — you bring the
//      parser, we provide the glue that compares Merkle roots against the
//      block header.
//
//   B) `makeDefaultAnchorVerifier({ headerSource })` — dynamic-imports the
//      `opentimestamps` npm package (optional peer dependency) and wires
//      it into (A). One import, full verification.
//
// In both cases the resulting function is what `@orangecheck/stamp-core`
// expects at the `verifyOtsAnchor` input of `verify()` — no further adaptation
// needed. The envelope id is passed directly into the hook by stamp-core; we
// drop the old broken `adaptAnchorVerifier` that tried to derive the digest
// from the block hash.

import { base64Decode, hexDecode, hexEncode } from './base64.js';
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
 * The returned function matches the `verifyOtsAnchor` shape expected by
 * `@orangecheck/stamp-core`'s `verify()`:
 *
 *   (proofB64, blockHeight, blockHash, envelopeId) => Promise<boolean>
 *
 * Wire it in as:
 *
 *   verify({ envelope, verifyOtsAnchor: makeAnchorVerifier({...}) })
 */
export function makeAnchorVerifier(
    cfg: AnchorVerifierConfig
): (proofB64: string, blockHeight: number, blockHash: string, envelopeId: string) => Promise<boolean> {
    const verifier: AnchorVerifier = async (
        input: AnchorVerificationInput
    ): Promise<AnchorVerificationResult> => {
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
        // Bitcoin block header is 80 bytes; merkle root at offset 36, 32 bytes,
        // little-endian. Proof walkers vary in convention — compare both
        // endiannesses to stay compatible across implementations.
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
 * Default anchor verifier that dynamically imports the `opentimestamps` npm
 * package and wires it into `makeAnchorVerifier`. The import is lazy so
 * consumers who only need calendar submission don't pay the dep cost.
 *
 * Install `opentimestamps` alongside `@orangecheck/stamp-ots` to use this:
 *
 *   npm i @orangecheck/stamp-ots opentimestamps
 *
 * Then:
 *
 *   const verifyOtsAnchor = await makeDefaultAnchorVerifier({ headerSource });
 *   await verify({ envelope, verifyOtsAnchor });
 *
 * Throws if `opentimestamps` isn't resolvable. That's intentional — callers
 * who haven't installed it should use `makeAnchorVerifier` with their own
 * walker instead, so the failure surfaces immediately rather than silently
 * reporting every stamp as unverified.
 */
export async function makeDefaultAnchorVerifier(opts: {
    headerSource: BlockHeaderSource;
}): Promise<
    (proofB64: string, blockHeight: number, blockHash: string, envelopeId: string) => Promise<boolean>
> {
    const walkProof = await loadOpenTimestampsWalker();
    return makeAnchorVerifier({ walkProof, headerSource: opts.headerSource });
}

type OtsWalker = AnchorVerifierConfig['walkProof'];

async function loadOpenTimestampsWalker(): Promise<OtsWalker> {
    // Dynamic import so the dep is optional. If the package isn't installed,
    // the error is explicit and actionable.
    let ots: unknown;
    try {
        ots = await import(/* webpackIgnore: true */ 'opentimestamps' as string);
    } catch (e) {
        throw new Error(
            '@orangecheck/stamp-ots: makeDefaultAnchorVerifier requires the optional peer dependency `opentimestamps`. ' +
                `Install it with \`npm i opentimestamps\` or supply your own walkProof via makeAnchorVerifier. ` +
                `Underlying error: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    // Normalize the module shape. `opentimestamps` publishes both CJS-default
    // and named exports across its versions.
    const mod = (ots as { default?: unknown }).default ?? ots;
    const modAny = mod as Record<string, unknown>;

    type DetachedLike = { deserialize(bytes: Uint8Array): unknown; timestamp: unknown };
    type TimestampLike = {
        verify(): Promise<Map<string, { height: number; timestamp?: unknown }>>;
        msg: Uint8Array;
    };

    const DetachedCtor =
        (modAny.DetachedTimestampFile as { deserialize(b: Uint8Array): DetachedLike } | undefined) ??
        (modAny.default as Record<string, unknown> | undefined)?.DetachedTimestampFile as
            | { deserialize(b: Uint8Array): DetachedLike }
            | undefined;

    if (!DetachedCtor || typeof DetachedCtor.deserialize !== 'function') {
        throw new Error(
            '@orangecheck/stamp-ots: unexpected shape from `opentimestamps` package — ' +
                'expected DetachedTimestampFile.deserialize. If you are using a non-standard build, ' +
                'pass your own walkProof via makeAnchorVerifier instead.'
        );
    }

    return async ({ proofBytes }) => {
        try {
            const detached = DetachedCtor.deserialize(proofBytes);
            const ts = detached.timestamp as TimestampLike;
            const attestations = await ts.verify();
            const first = attestations.values().next();
            if (first.done) return null;
            const { height, timestamp } = first.value;
            if (typeof height !== 'number' || !timestamp) return null;
            // The attestation provides the block height; the merkle root the
            // walker produces is the timestamp.msg bytes the walker committed
            // against. opentimestamps resolves that through its internal
            // proof chain; reading ts.msg gives the final digest it committed.
            const merkleRoot = (timestamp as { msg?: Uint8Array }).msg;
            if (!merkleRoot) return null;
            return { merkleRoot, blockHeight: height };
        } catch {
            return null;
        }
    };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}
