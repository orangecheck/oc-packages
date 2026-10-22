// SPEC §6 for the CLI: submit a stamp to the calendars, or upgrade its pending proof.

import type { StampEnvelope } from '@orangecheck/stamp-core';
import {
    fromStampOts,
    submitToCalendars,
    toStampOts,
    upgradeProof,
    type BlockHeaderSource,
} from '@orangecheck/stamp-ots';

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
