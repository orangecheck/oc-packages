import { verifySignature } from '@orangecheck/bip322';
import { ballotId, distinctBallotCopies, type Ballot } from '@orangecheck/vote-core';

import type { NostrEvent } from './nostr.js';

/**
 * Every copy of this poll's ballots in `events`, byte-identical copies
 * collapsed. vote-core's tally verifies each copy before it picks one ballot
 * per voter; ballot_id leaves out sig.value, so copies with one id can carry
 * different signatures.
 */
export function ballotCopiesFromEvents(events: NostrEvent[], pid: string): Ballot[] {
    const parsed: Ballot[] = [];
    for (const ev of events) {
        try {
            const b = JSON.parse(ev.content) as Ballot;
            if (b && b.poll_id === pid) parsed.push(b);
        } catch {
            // skip malformed
        }
    }
    return distinctBallotCopies(parsed);
}

export interface BallotVerdict {
    voter: string;
    ballot_id: string;
    ok: boolean;
}

/** One verdict per ballot_id: valid when any copy of it carries a signature that verifies. */
export function ballotVerdicts(
    copies: Ballot[],
    verify: (address: string, message: string, signature: string) => boolean = verifySignature
): BallotVerdict[] {
    const byId = new Map<string, BallotVerdict>();
    for (const b of copies) {
        const id = ballotId(b);
        const ok = verify(b.voter, id, b.sig?.value ?? '');
        const prior = byId.get(id);
        if (!prior || (!prior.ok && ok)) byId.set(id, { voter: b.voter, ballot_id: id, ok });
    }
    return [...byId.values()];
}
