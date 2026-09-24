// SPEC §6.3 / §8 step 5 for the CLI: a claimed OTS anchor is only reported as
// anchored once the proof chains to the block header at the claimed height.

import type { StampEnvelope } from '@orangecheck/stamp-core';
import {
    fromStampOts,
    makeAnchorVerifier,
    submitToCalendars,
    toStampOts,
    upgradeProof,
    type BlockHeaderSource,
} from '@orangecheck/stamp-ots';

export type AnchorState = 'anchored' | 'unverified' | 'pending' | 'none' | 'fail';

export interface AnchorOutcome {
    state: AnchorState;
    blockHeight?: number;
    message?: string;
}

/**
 * Check the envelope's anchor claim. A header source that cannot answer leaves
 * the claim unverified (offline verifiers MAY defer, §6.3); a header that
 * answers and does not match fails it.
 */
export async function checkAnchorClaim(
    env: StampEnvelope,
    headers: BlockHeaderSource
): Promise<AnchorOutcome> {
    const ots = env.ots;
    if (!ots) return { state: 'none' };
    if (ots.status !== 'confirmed' || ots.block_height === null || !ots.block_hash) {
        return { state: 'pending' };
    }
    const blockHeight = ots.block_height;
    let header: Uint8Array | null = null;
    try {
        header = await headers.getHeaderAt(blockHeight);
    } catch {
        header = null;
    }
    if (!header) {
        return { state: 'unverified', blockHeight, message: 'block header source unreachable' };
    }
    const verify = makeAnchorVerifier({ headerSource: { getHeaderAt: async () => header } });
    const ok = await verify(ots.proof, blockHeight, ots.block_hash, env.id);
    return ok
        ? { state: 'anchored', blockHeight }
        : { state: 'fail', blockHeight, message: `OTS proof does not chain to block ${blockHeight}` };
}

/**
 * The next OTS state for an envelope: submit when it has no proof, ask the
 * listed calendars to upgrade a pending one, leave a confirmed one alone.
 */
export async function advanceOts(
    env: StampEnvelope,
    opts: { headers: BlockHeaderSource; fetch?: typeof fetch }
): Promise<StampEnvelope> {
    if (!env.ots) {
        const proof = await submitToCalendars(env.id, { fetch: opts.fetch });
        return { ...env, ots: toStampOts(proof) };
    }
    if (env.ots.status === 'confirmed') return env;
    const next = await upgradeProof(fromStampOts(env.ots), env.id, {
        headerSource: opts.headers,
        fetch: opts.fetch,
    });
    return { ...env, ots: toStampOts(next) };
}
