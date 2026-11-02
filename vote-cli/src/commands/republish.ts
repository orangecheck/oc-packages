// oc-vote republish <file> — send a signed poll, ballot, reveal or ballot stamp
// again, as it is, and ask each relay alone for it back. The file holds the
// event `create`, `vote` or `reveal` printed (an `event:` line, or the whole
// --json output). Nothing new is signed: a poll keeps its id, so ballots cast
// against it stay its own, and nothing waits on a wallet.

import { readFileSync } from 'node:fs';

import { verifyEvent } from '@orangecheck/nostr-core';
import { verify as stampVerify } from '@orangecheck/stamp-core';
import { ballotId, pollId, revealId, verifyBallot, verifyPoll, verifyReveal } from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';
import { DEFAULT_RELAYS, fetchPollEvents, type NostrEvent } from '../nostr.js';
import {
    ballotOf,
    castEvent,
    pollOf,
    relaysServingBallot,
    relaysServingPoll,
    relaysServingReveal,
    relaysServingStamp,
    revealOf,
    stampOf,
} from '../quorum.js';
import { report, type Kind } from '../report.js';
import { findPoll } from '../select.js';
import { revealChainFor } from './reveal.js';

export interface RepublishOptions {
    file: string;
    relays?: string[];
    json?: boolean;
}

/** A signed event checked the way its readers check it, and how to read it back. */
export interface Signed {
    kind: Kind;
    event: NostrEvent;
    id: [string, string];
    heading: [string, string][];
    jsonExtra: Record<string, unknown>;
    readBack: (relays: readonly string[]) => Promise<string[]>;
}

/** Why `p` did not verify, or null when it did. */
async function failure(p: Promise<{ ok: boolean; reason?: string } | { ok: true }>): Promise<string | null> {
    const v = await p.catch((e: unknown) => ({ ok: false, reason: (e as Error).message }));
    return v.ok ? null : ('reason' in v && v.reason) || 'it does not verify';
}

/**
 * The signed event in `text`: an event, or --json output carrying one as
 * `event`. Refused unless its Nostr id and signature hold, it is a poll, ballot,
 * reveal or stamp, and that object verifies: a poll's or ballot's own signature,
 * a reveal against its poll (read from `relays`) as a count checks it now, a
 * stamp's signature.
 */
export async function readSigned(text: string, relays: readonly string[] = DEFAULT_RELAYS): Promise<Signed> {
    let obj: unknown;
    try {
        obj = JSON.parse(text);
    } catch {
        throw new Error('the file is not JSON');
    }
    const event = obj && typeof obj === 'object' && 'event' in obj ? (obj as { event: unknown }).event : obj;
    if (!verifyEvent(event)) throw new Error("no signed Nostr event in the file: its id or signature doesn't hold");

    if (event.kind === 30080) {
        const poll = pollOf(event);
        if (!poll) throw new Error("the event doesn't carry a poll");
        const why = await failure(verifyPoll(poll, bip322Verify));
        if (why) throw new Error(`the poll's signature doesn't verify: ${why}`);
        return {
            kind: 'poll',
            event,
            id: ['poll_id', pollId(poll)],
            heading: [['poll', poll.question]],
            jsonExtra: { poll },
            readBack: (r) => relaysServingPoll(poll, { relays: r }),
        };
    }
    if (event.kind === 30081) {
        const ballot = ballotOf(event);
        if (!ballot) throw new Error("the event doesn't carry a ballot");
        const why = await failure(verifyBallot(ballot, bip322Verify));
        if (why) throw new Error(`the ballot's signature doesn't verify: ${why}`);
        return {
            kind: 'ballot',
            event,
            id: ['ballot_id', ballotId(ballot)],
            heading: [
                ['poll', ballot.poll_id],
                ['voter', ballot.voter],
            ],
            jsonExtra: { ballot },
            readBack: (r) => relaysServingBallot(ballot, { relays: r }),
        };
    }
    if (event.kind === 30082) {
        const reveal = revealOf(event);
        if (!reveal) throw new Error("the event doesn't carry a reveal");
        const poll = (await findPoll(await fetchPollEvents(reveal.poll_id, relays), reveal.poll_id, bip322Verify)).poll;
        const chain = await revealChainFor(poll);
        const why = await failure(verifyReveal(reveal, poll, bip322Verify, Date.now(), chain));
        if (why) throw new Error(`the reveal doesn't verify against its poll: ${why}`);
        return {
            kind: 'reveal',
            event,
            id: ['reveal_id', revealId(reveal)],
            heading: [['poll', poll.question]],
            jsonExtra: { reveal },
            readBack: (r) => relaysServingReveal(reveal, poll, { relays: r, chain }),
        };
    }
    if (event.kind === 30083) {
        const env = stampOf(event);
        if (!env) throw new Error("the event doesn't carry an OC Stamp");
        const why = await failure(
            stampVerify({
                envelope: env,
                verifyBip322: async (message, signature, address) => bip322Verify({ address, message, signature }),
            }).then((v) => (v.ok ? { ok: true as const } : { ok: false, reason: v.message ?? v.code }))
        );
        if (why) throw new Error(`the stamp's signature doesn't verify: ${why}`);
        return {
            kind: 'stamp',
            event,
            id: ['stamp_id', env.id],
            heading: [['over', env.content.hash]],
            jsonExtra: { stamp: env },
            readBack: (r) => relaysServingStamp(env, { relays: r }),
        };
    }
    throw new Error(`the event is kind ${event.kind}: not a poll, ballot, reveal or stamp (30080 to 30083)`);
}

export async function runRepublish(opts: RepublishOptions): Promise<void> {
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const signed = await readSigned(readFileSync(opts.file, 'utf8'), relays);
    // Which relays serve it now is unknown here, so it goes to all of them.
    const serving = await castEvent(signed.event, [], () => signed.readBack(relays), { relays });
    report({
        id: signed.id,
        heading: signed.heading,
        main: { kind: signed.kind, event: signed.event, relays, serving },
        json: Boolean(opts.json),
        jsonExtra: signed.jsonExtra,
        file: opts.file,
    });
}
