// oc-vote vote — build + sign + publish a ballot, then ask each relay alone for
// it back. It is in only once min(2, asked) relays serve a valid copy (quorum.ts);
// below that it says so and exits 2, and `oc-vote republish` sends the same
// signed event again.
//
// Public mode: just --poll --voter --option --sig.
// Secret mode: additionally --reveal-pk (from the poll); we seal the option
//   id into an oc-lock envelope + commit it per SPEC §4.4.

import { seal } from '@orangecheck/lock-core';
import { utf8Encode } from '@orangecheck/lock-crypto';
import { ballotId, commit, isAnchoredPoll } from '@orangecheck/vote-core';
import type { Ballot } from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';

import { stampBallot } from '../anchors.js';
import { buildBallotEvent, buildStampEvent } from '../events.js';
import { DEFAULT_RELAYS, fetchPollEvents, publishEvent, type NostrEvent } from '../nostr.js';
import { ballotIsIn, castBallot, writeQuorum } from '../quorum.js';
import { findPoll } from '../select.js';
import { promptForSignature } from '../sig.js';

export interface VoteOptions {
    pollId: string;
    voter: string;
    option: string;
    sig?: string;
    relays?: string[];
    dryRun?: boolean;
    json?: boolean;
}

export async function runVote(opts: VoteOptions): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(opts.pollId)) {
        throw new Error('poll id must be 64 hex chars');
    }

    // Fetch the poll from relays so we know the mode + options + reveal_pk.
    const fetched = await fetchPollEvents(opts.pollId, opts.relays ?? DEFAULT_RELAYS);
    const selected = await findPoll(fetched, opts.pollId, bip322Verify);
    if (!selected.signatureValid) {
        throw new Error('poll signature does not verify against its creator (SPEC §10.1)');
    }
    const poll = selected.poll;
    if (poll.mode === 'public' && !poll.options.some((o) => o.id === opts.option)) {
        throw new Error(`option "${opts.option}" not in poll options (${poll.options.map((o) => o.id).join(', ')})`);
    }

    let ballotOption: string | null = opts.option;
    let secret: Ballot['secret'] = null;

    if (poll.mode === 'secret') {
        if (!poll.reveal_pk) throw new Error('secret-mode poll missing reveal_pk');
        const envelope = await seal({
            payload: utf8Encode(opts.option),
            sender: { address: opts.voter, signMessage: async () => '' },
            recipients: [
                {
                    address: `oc-vote:reveal:${opts.pollId}`,
                    device_id: 'reveal',
                    device_pk: poll.reveal_pk,
                },
            ],
        });
        ballotOption = null;
        secret = {
            envelope: envelope as unknown as Record<string, unknown>,
            commit: commit(opts.pollId, opts.voter, opts.option),
        };
    }

    const draft: Ballot = {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: opts.pollId,
        voter: opts.voter,
        option: ballotOption,
        attestation_id: null,
        secret,
        created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        sig: { alg: 'bip322', pubkey: opts.voter, value: '' },
    };

    const bid = ballotId(draft);

    if (opts.dryRun) {
        process.stdout.write(JSON.stringify({ ballot_id: bid, ballot: draft }, null, 2) + '\n');
        return;
    }

    const sigValue = await promptForSignature(opts.voter, bid, opts.sig);
    draft.sig.value = sigValue;

    // Built once: every try, and `oc-vote republish`, sends this same event.
    const pub = buildBallotEvent(draft);
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const serving = await castBallot(pub, draft, [], { relays });

    // SPEC §4.6: in an anchored poll the voter's client stamps the ballot it
    // publishes, once a relay serves it back.
    let stamped: { relays: number; total: number } | { error: string } | null = null;
    if (serving.length > 0 && isAnchoredPoll(poll)) {
        try {
            const env = await stampBallot(draft);
            const sent = await publishEvent(buildStampEvent(env), relays);
            stamped = { relays: sent.filter((r) => r.ok).length, total: sent.length };
        } catch (e) {
            stamped = { error: (e as Error).message };
        }
    }

    reportCast({
        ballot: draft,
        event: pub,
        relays,
        serving,
        json: Boolean(opts.json),
        heading: [
            ['poll', poll.question],
            ['voter', opts.voter],
            ['option', `${opts.option}${poll.mode === 'secret' ? ' (sealed)' : ''}`],
        ],
        stamped,
    });
}

/** Exit status when the ballot is published but not in yet. */
export const NOT_IN_YET = 2;

export interface CastReport {
    ballot: Ballot;
    event: NostrEvent;
    relays: readonly string[];
    serving: readonly string[];
    json: boolean;
    heading?: [string, string][];
    stamped?: { relays: number; total: number } | { error: string } | null;
    /** The file the signed event came from, for the "again" line. */
    file?: string;
}

/**
 * Where a published ballot stands, from the relays that serve it back, each
 * asked alone. Never more than the read-back showed. Below min(2, asked) it
 * says the ballot isn't in yet, gives the signed event to send again, and sets
 * the exit status to NOT_IN_YET.
 */
export function reportCast(r: CastReport): void {
    const asked = r.relays.length;
    const isIn = ballotIsIn(r.serving.length, asked);
    if (!isIn) process.exitCode = NOT_IN_YET;
    const bid = ballotId(r.ballot);

    if (r.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    ballot_id: bid,
                    in: isIn,
                    served_by: r.serving,
                    asked,
                    quorum: writeQuorum(asked),
                    ...(r.stamped ? { stamp: r.stamped } : {}),
                    ballot: r.ballot,
                    event: r.event,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  ballot_id:  ${bid}\n`);
    for (const [k, v] of r.heading ?? []) w(`  ${`${k}:`.padEnd(12)}${v}\n`);
    if (isIn) {
        w(`  in:         yes, ${r.serving.length} of ${asked} relays serve it back\n`);
    } else if (r.serving.length === 0) {
        w(`  in:         not yet: no relay serves it back, so a count would not see it\n`);
    } else {
        w(
            `  in:         not yet: only ${r.serving.length} of ${asked} relays serves it back, ` +
                `and a count is sure to see it only once ${writeQuorum(asked)} do\n`
        );
    }
    for (const relay of r.relays) w(`    ${r.serving.includes(relay) ? '✓' : '✗'} ${relay}\n`);
    if (!isIn) {
        if (r.file) {
            w(`  again:      oc-vote republish ${r.file}\n`);
            w(`              sends the same signed ballot, with nothing new to sign\n`);
        } else {
            w(`  again:      save the signed event below to a file and run oc-vote republish <file>;\n`);
            w(`              it sends the same signed ballot, with nothing new to sign\n`);
            w(`  event:      ${JSON.stringify(r.event)}\n`);
        }
    }
    const stamped = r.stamped;
    if (stamped && 'error' in stamped) {
        w(`  stamp:      not made here (${stamped.error}); vote.ochk.io's anchorer stamps every ballot it sees\n`);
    } else if (stamped) {
        w(`  stamp:      published to ${stamped.relays}/${stamped.total} relays; a Bitcoin block usually anchors it within an hour or two\n`);
    }
    w(`\n`);
}
