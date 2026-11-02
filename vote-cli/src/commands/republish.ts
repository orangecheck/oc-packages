// oc-vote republish <file> — send a signed ballot event again, as it is, and ask
// each relay alone for it back. The file holds the event `oc-vote vote` printed
// (its `event:` line, or the whole --json output). Nothing new is signed, so a
// ballot that isn't in yet can be sent again without the wallet.

import { readFileSync } from 'node:fs';

import { verifyEvent } from '@orangecheck/nostr-core';
import { verifyBallot, type Ballot } from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';
import { DEFAULT_RELAYS, type NostrEvent } from '../nostr.js';
import { ballotOf, castBallot } from '../quorum.js';
import { reportCast } from './vote.js';

export interface RepublishOptions {
    file: string;
    relays?: string[];
    json?: boolean;
}

/**
 * The signed ballot event in `text`: an event, or `oc-vote vote --json` output
 * carrying one. Refused unless its Nostr id and signature hold, it is a ballot
 * (kind 30081), and the ballot's own signature verifies.
 */
export async function readSignedBallot(text: string): Promise<{ event: NostrEvent; ballot: Ballot }> {
    let obj: unknown;
    try {
        obj = JSON.parse(text);
    } catch {
        throw new Error('the file is not JSON');
    }
    const event = obj && typeof obj === 'object' && 'event' in obj ? (obj as { event: unknown }).event : obj;
    if (!verifyEvent(event)) throw new Error("no signed Nostr event in the file: its id or signature doesn't hold");
    if (event.kind !== 30081) throw new Error(`the event is kind ${event.kind}, not a ballot (30081)`);
    const ballot = ballotOf(event);
    if (!ballot) throw new Error("the event doesn't carry a ballot");
    const verdict = await verifyBallot(ballot, bip322Verify).catch((e: unknown) => ({
        ok: false as const,
        reason: (e as Error).message,
    }));
    if (!verdict.ok) throw new Error(`the ballot's signature doesn't verify: ${verdict.reason}`);
    return { event, ballot };
}

export async function runRepublish(opts: RepublishOptions): Promise<void> {
    const { event, ballot } = await readSignedBallot(readFileSync(opts.file, 'utf8'));
    const relays = opts.relays ?? DEFAULT_RELAYS;
    // Which relays serve it now is unknown here, so it goes to all of them.
    const serving = await castBallot(event, ballot, [], { relays });
    reportCast({
        ballot,
        event,
        relays,
        serving,
        json: Boolean(opts.json),
        heading: [
            ['poll', ballot.poll_id],
            ['voter', ballot.voter],
        ],
        file: opts.file,
    });
}
