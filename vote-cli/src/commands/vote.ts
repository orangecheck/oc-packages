// oc-vote vote — build + sign + publish a ballot.
//
// Public mode: just --poll --voter --option --sig.
// Secret mode: additionally --reveal-pk (from the poll); we seal the option
//   id into an oc-lock envelope + commit it per SPEC §4.4.

import { seal } from '@orangecheck/lock-core';
import { utf8Encode } from '@orangecheck/lock-crypto';
import { ballotId, commit, pollId as computePollId } from '@orangecheck/vote-core';
import type { Ballot, Poll } from '@orangecheck/vote-core';

import { buildBallotEvent } from '../events.js';
import { DEFAULT_RELAYS, fetchPollEvent, publishEvent } from '../nostr.js';
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
    const event = await fetchPollEvent(opts.pollId, opts.relays ?? DEFAULT_RELAYS);
    if (!event) throw new Error('poll not found on relays');
    const poll = JSON.parse(event.content) as Poll;
    if (computePollId(poll) !== opts.pollId) {
        throw new Error('poll content does not match poll_id');
    }
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

    const pub = buildBallotEvent(draft);
    const results = await publishEvent(pub, opts.relays ?? DEFAULT_RELAYS);
    const okCount = results.filter((r) => r.ok).length;

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    ballot_id: bid,
                    published: okCount,
                    total: results.length,
                    relays: results,
                    ballot: draft,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  ballot_id:  ${bid}\n`);
    w(`  poll:       ${poll.question}\n`);
    w(`  voter:      ${opts.voter}\n`);
    w(`  option:     ${opts.option}${poll.mode === 'secret' ? ' (sealed)' : ''}\n`);
    w(`  published:  ${okCount}/${results.length} relays\n`);
    for (const r of results) {
        w(`    ${r.ok ? '✓' : '✗'} ${r.relay}${r.reason ? ` (${r.reason})` : ''}\n`);
    }
    w(`\n`);
}
