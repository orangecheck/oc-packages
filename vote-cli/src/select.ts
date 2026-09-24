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

import type { NostrEvent } from './nostr.js';

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

export async function selectReveal(
    events: NostrEvent[],
    poll: Poll,
    verify: SignatureVerifier
): Promise<Reveal | null> {
    for (const ev of events) {
        const r = parse<Reveal>(ev);
        if (r && (await verifyReveal(r, poll, verify)).ok) return r;
    }
    return null;
}
