// oc-vote vote — build + sign + publish a ballot, then ask each relay alone for
// it back. It is in only once min(2, asked) relays serve a valid copy (quorum.ts);
// below that it says so and exits 2, and `oc-vote republish` sends the same
// signed event again. An anchored poll's ballot stamp is read back the same way.
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
import { DEFAULT_RELAYS, fetchPollEvents } from '../nostr.js';
import { castBallot, castEvent, relaysServingStamp } from '../quorum.js';
import { report, type Standing } from '../report.js';
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
    // publishes, once a relay serves it back. A final count reads stamps at the
    // read floor, so the stamp is read back the same way as the ballot.
    let stamp: Standing | { error: string } | null = null;
    if (serving.length > 0 && isAnchoredPoll(poll)) {
        try {
            const env = await stampBallot(draft);
            const event = buildStampEvent(env);
            const on = await castEvent(event, [], () => relaysServingStamp(env, { relays }), { relays });
            stamp = { kind: 'stamp', event, relays, serving: on };
        } catch (e) {
            stamp = { error: (e as Error).message };
        }
    }

    report({
        id: ['ballot_id', bid],
        heading: [
            ['poll', poll.question],
            ['voter', opts.voter],
            ['option', `${opts.option}${poll.mode === 'secret' ? ' (sealed)' : ''}`],
        ],
        main: { kind: 'ballot', event: pub, relays, serving },
        stamp,
        json: Boolean(opts.json),
        jsonExtra: { ballot: draft },
    });
}
