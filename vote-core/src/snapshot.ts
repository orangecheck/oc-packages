// Resolving `snapshot_block: "deadline"` to a concrete height, per SPEC §3:
// "the tallier MUST use the block whose `median_time_past` is the greatest
// value ≤ deadline and has ≥ 6 confirmations."
//
// median_time_past (BIP-113) is the median timestamp of the previous 11
// blocks. It is monotonic where a raw block timestamp is not, which is why the
// spec picks it: two talliers must agree. The chain tip is not a substitute —
// it keeps moving after the deadline, so the weights would too.

import { isBlockHeight } from './verify.js';
import type { Poll } from './types.js';

export interface BlockTimeSource {
    /** Height of a block at or near a unix timestamp (seed for the walk). */
    blockHeightAtTimestamp(unixSeconds: number): Promise<number>;
    /** median_time_past for a height (BIP-113). Throws if the block does not exist. */
    medianTimePast(height: number): Promise<number>;
    /** Current chain tip height. */
    tipHeight(): Promise<number>;
}

export type SnapshotResolution =
    | { ok: true; height: number; confirmations: number }
    | { ok: false; code: 'E_REORG'; reason: string }
    | { ok: false; code: 'E_SNAPSHOT_UNRESOLVED'; reason: string };

/** SPEC §3 / §10.5 confirmation floor for a snapshot block. */
export const MIN_SNAPSHOT_CONFIRMATIONS = 6;

/** Bound on the walk. median_time_past lags a block's own timestamp by about
 *  an hour, so the seed is normally within a handful of blocks; exceeding
 *  this fails closed rather than guessing. */
const MAX_WALK = 32;

/**
 * Resolve `snapshot_block: "deadline"` per SPEC §3. Fails closed: an
 * unresolvable or under-confirmed snapshot is an error, never a plausible
 * height.
 */
export async function resolveDeadlineSnapshot(
    deadlineIso: string,
    source: BlockTimeSource
): Promise<SnapshotResolution> {
    const unresolved = (reason: string): SnapshotResolution => ({
        ok: false,
        code: 'E_SNAPSHOT_UNRESOLVED',
        reason,
    });
    const deadlineMs = Date.parse(deadlineIso);
    if (!Number.isFinite(deadlineMs)) return unresolved(`unparseable deadline: ${deadlineIso}`);
    const deadline = Math.floor(deadlineMs / 1000);

    let height: number;
    try {
        height = await source.blockHeightAtTimestamp(deadline);
    } catch (e) {
        return unresolved(`seed lookup failed: ${(e as Error).message}`);
    }

    try {
        // Walk down while this block's median_time_past is after the deadline.
        let steps = 0;
        while ((await source.medianTimePast(height)) > deadline) {
            if (++steps > MAX_WALK || height <= 0) {
                return unresolved(`no block with median_time_past <= deadline within ${MAX_WALK} blocks`);
            }
            height -= 1;
        }
        // Walk up while the next block still qualifies: the GREATEST such height.
        steps = 0;
        for (;;) {
            let nextMtp: number;
            try {
                nextMtp = await source.medianTimePast(height + 1);
            } catch {
                break; // next block does not exist yet
            }
            if (nextMtp > deadline) break;
            height += 1;
            if (++steps > MAX_WALK) {
                return unresolved(`walk exceeded ${MAX_WALK} blocks looking for the greatest qualifying height`);
            }
        }
    } catch (e) {
        return unresolved(`median_time_past lookup failed: ${(e as Error).message}`);
    }

    let tip: number;
    try {
        tip = await source.tipHeight();
    } catch (e) {
        return unresolved(`tip lookup failed: ${(e as Error).message}`);
    }

    const confirmations = tip - height + 1;
    if (confirmations < MIN_SNAPSHOT_CONFIRMATIONS) {
        return {
            ok: false,
            code: 'E_REORG',
            reason: `snapshot block ${height} has ${confirmations} confirmation(s), needs ${MIN_SNAPSHOT_CONFIRMATIONS} — tally deferred`,
        };
    }
    return { ok: true, height, confirmations };
}

/**
 * The snapshot height for any poll: `snapshot_block` itself when it is a
 * number (which must also carry 6 confirmations), otherwise the §3 deadline
 * resolution.
 */
export async function resolvePollSnapshot(
    poll: Pick<Poll, 'snapshot_block' | 'deadline'>,
    source: BlockTimeSource
): Promise<SnapshotResolution> {
    if (poll.snapshot_block === 'deadline') return resolveDeadlineSnapshot(poll.deadline, source);
    const height = poll.snapshot_block;
    if (!isBlockHeight(height)) {
        return { ok: false, code: 'E_SNAPSHOT_UNRESOLVED', reason: `invalid snapshot_block ${String(height)}` };
    }
    let tip: number;
    try {
        tip = await source.tipHeight();
    } catch (e) {
        return { ok: false, code: 'E_SNAPSHOT_UNRESOLVED', reason: `tip lookup failed: ${(e as Error).message}` };
    }
    const confirmations = tip - height + 1;
    if (confirmations < MIN_SNAPSHOT_CONFIRMATIONS) {
        return {
            ok: false,
            code: 'E_REORG',
            reason: `snapshot block ${height} has ${Math.max(0, confirmations)} confirmation(s), needs ${MIN_SNAPSHOT_CONFIRMATIONS} — tally deferred`,
        };
    }
    return { ok: true, height, confirmations };
}

/**
 * `BlockTimeSource` over a mempool.space-compatible REST API (esplora plus
 * `/v1/mining/blocks/timestamp`). The explorer is a named trust anchor: pass
 * `base` to use your own instance.
 */
export function mempoolBlockTimeSource(
    opts: { base?: string; fetch?: typeof fetch } = {}
): BlockTimeSource {
    const base = opts.base ?? 'https://mempool.space/api';
    const get = opts.fetch ?? ((url: string) => fetch(url));
    const text = async (path: string) => {
        const res = await get(`${base}${path}`);
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        return (await res.text()).trim();
    };
    return {
        async tipHeight() {
            const n = Number.parseInt(await text('/blocks/tip/height'), 10);
            if (!Number.isFinite(n)) throw new Error('tip height parse');
            return n;
        },
        async blockHeightAtTimestamp(unixSeconds) {
            const j = JSON.parse(await text(`/v1/mining/blocks/timestamp/${unixSeconds}`)) as {
                height?: unknown;
            };
            if (typeof j.height !== 'number') throw new Error('block-at-timestamp parse');
            return j.height;
        },
        async medianTimePast(height) {
            // mediantime lives on the block object: height -> hash -> block.
            const hash = await text(`/block-height/${height}`);
            const j = JSON.parse(await text(`/block/${hash}`)) as { mediantime?: unknown };
            if (typeof j.mediantime !== 'number') throw new Error('mediantime missing');
            return j.mediantime;
        },
    };
}
