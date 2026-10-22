// Anchored polls (SPEC §4.6): whether a ballot is in time is decided by the
// Bitcoin block whose OpenTimestamps proof commits to its ballot_id.

import { canonicalBytes } from './canonical.js';
import { ballotId } from './ids.js';
import type { Ballot, Poll } from './types.js';
import { isBlockHeight, parseUtc } from './verify.js';

/** A poll whose deadline is at or after this instant is an anchored poll. */
export const ANCHOR_CUTOVER = '2026-11-15T00:00:00Z';
/** `G`: blocks after `H_close` in which an anchor still counts. */
export const ANCHOR_GRACE_BLOCKS = 36;
/** Confirmations the last anchorable block needs before a tally is final. */
export const ANCHOR_FINAL_CONFIRMATIONS = 6;
/** `content.mime` of an OC Stamp over a ballot. */
export const BALLOT_STAMP_MIME = 'application/vnd.oc-vote.ballot+json';

/** Whether `poll` is anchored (SPEC §4.6). A deadline that does not parse is not. */
export function isAnchoredPoll(poll: Pick<Poll, 'deadline'>): boolean {
    const deadline = parseUtc(poll.deadline);
    return deadline !== null && deadline >= Date.parse(ANCHOR_CUTOVER);
}

/** The highest block an anchor may sit in and still count: `H_close + G`. */
export function lastAnchorHeight(closeHeight: number): number {
    return closeHeight + ANCHOR_GRACE_BLOCKS;
}

/**
 * Whether a tally of an anchored poll is final at `tipHeight`: `H_close` is
 * known and the tip is at least `H_close + G + 6`. A null `closeHeight` means
 * no block's median_time_past has passed the deadline yet.
 */
export function anchoredTallyIsFinal(closeHeight: number | null, tipHeight: number): boolean {
    return closeHeight !== null && tipHeight >= closeHeight + ANCHOR_GRACE_BLOCKS + ANCHOR_FINAL_CONFIRMATIONS;
}

/** The `content` an OC Stamp over `ballot` carries (SPEC §4.6): the bytes `ballot_id` hashes. */
export function ballotStampContent(ballot: Ballot): { hash: string; length: number; mime: string } {
    const bytes = canonicalBytes({ ...ballot, sig: { ...ballot.sig, value: '' } });
    return {
        hash: `sha256:${ballotId(ballot)}`,
        length: new TextEncoder().encode(bytes).length,
        mime: BALLOT_STAMP_MIME,
    };
}

/**
 * `anchor_height(b)` (SPEC §4.6) from every stamp copy read from every relay:
 * the lowest height among stamps whose `content.hash` names this ballot and
 * whose anchor `verifyAnchor` confirms. `verifyAnchor` must rebuild the stamp's
 * id from the same object and walk its OpenTimestamps proof to a block header
 * the caller checked, returning that header's height or null. It must throw
 * when it cannot check (headers unreachable), and then this rejects too, even
 * if another copy verified: the copy that could not be checked may hold the
 * lowest anchor, and a failed lookup is never a missing anchor. Never pass one
 * copy per ballot or per `d` tag: copies of one stamp carry different proofs.
 */
export async function anchorHeightFromStamps(
    ballotIdHex: string,
    stamps: readonly unknown[],
    verifyAnchor: (stamp: { content: { hash: string } }) => Promise<number | null> | number | null
): Promise<number | null> {
    const want = `sha256:${ballotIdHex}`;
    let lowest: number | null = null;
    for (const stamp of stamps) {
        const hash = (stamp as { content?: { hash?: unknown } } | null)?.content?.hash;
        if (hash !== want) continue;
        const height = await verifyAnchor(stamp as { content: { hash: string } });
        if (isBlockHeight(height) && (lowest === null || height < lowest)) lowest = height;
    }
    return lowest;
}
