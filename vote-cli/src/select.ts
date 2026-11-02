// Pick the poll / reveal out of everything relays return under a d-tag.
//
// The poll is an event whose content hashes to the requested id (SPEC §3.2);
// among those, one whose creator signature verifies (§10.1) is preferred.
// The reveal is the first that verifies against the poll (§6.4, §10.3).

import {
    pollId as computePollId,
    verifyPoll,
    verifyReveal,
    type Poll,
    type Reveal,
    type SignatureVerifier,
} from '@orangecheck/vote-core';

import { readShortfall, type EventsFetch, type NostrEvent, type PagedFetch } from './nostr.js';

function parse<T>(ev: NostrEvent): T | null {
    try {
        return JSON.parse(ev.content) as T;
    } catch {
        return null;
    }
}

export async function selectPoll(
    events: NostrEvent[],
    pid: string,
    verify: SignatureVerifier
): Promise<{ poll: Poll; signatureValid: boolean } | null> {
    let unverified: Poll | null = null;
    for (const ev of events) {
        const p = parse<Poll>(ev);
        if (!p || p.kind !== 'oc-vote/poll' || computePollId(p) !== pid) continue;
        if ((await verifyPoll(p, verify)).ok) return { poll: p, signatureValid: true };
        unverified ??= p;
    }
    return unverified ? { poll: unverified, signatureValid: false } : null;
}

/**
 * selectPoll over a relay answer, distinguishing "no relay has it" from "no
 * relay finished answering" — only the first is "not found".
 */
export async function findPoll(
    fetched: EventsFetch,
    pid: string,
    verify: SignatureVerifier
): Promise<{ poll: Poll; signatureValid: boolean }> {
    const selected = await selectPoll(fetched.events, pid, verify);
    if (selected) return selected;
    throw new Error(
        fetched.complete
            ? 'poll not found on relays'
            : 'no relay finished answering the poll query; try again'
    );
}

/** Refuse to draw a conclusion from a set that does not stand for what the relays hold. */
export function requireComplete(fetched: EventsFetch | PagedFetch, what: string): NostrEvent[] {
    if (fetched.complete) return fetched.events;
    const short = 'relays' in fetched ? readShortfall(fetched.relays) : null;
    throw new Error(
        short
            ? `can't count: the ${what} lookup ${short}, so ${what}s may be missing; try again`
            : `no relay finished answering the ${what} query; try again`
    );
}

/**
 * The ballots a tally counts. A clock-dated count rests on the ballot read
 * alone, so a read that was cut short or is below the floor can't be counted.
 * An anchored count is held provisional instead (anchoredChain, the same
 * `readShortfall`), so it needs only a relay that answered at all.
 */
export function ballotsToCount(fetched: PagedFetch, anchored: boolean): NostrEvent[] {
    if (!anchored) return requireComplete(fetched, 'ballot');
    if (fetched.relays.some((r) => r.answered || r.truncated)) return fetched.events;
    throw new Error('no relay finished answering the ballot query; try again');
}

/**
 * The first reveal that verifies against the poll. An anchored poll's reveal
 * counts only once `chain.tipHeight` reaches H_close + G + 6 (SPEC §10.3), so
 * without `chain` none does.
 */
export async function selectReveal(
    events: NostrEvent[],
    poll: Poll,
    verify: SignatureVerifier,
    chain?: { tipHeight: number; closeHeight: number | null }
): Promise<Reveal | null> {
    return (await findReveal(events, poll, verify, chain))?.reveal ?? null;
}

/** `selectReveal`, with the event that carried it. */
export async function findReveal(
    events: readonly NostrEvent[],
    poll: Poll,
    verify: SignatureVerifier,
    chain?: { tipHeight: number; closeHeight: number | null }
): Promise<{ event: NostrEvent; reveal: Reveal } | null> {
    for (const event of events) {
        const reveal = parse<Reveal>(event);
        if (reveal && (await verifyReveal(reveal, poll, verify, Date.now(), chain)).ok) return { event, reveal };
    }
    return null;
}
