// oc-vote reveal — publish the reveal event for a secret-mode poll.

import { revealId } from '@orangecheck/vote-core';
import type { Reveal } from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';

import { buildRevealEvent } from '../events.js';
import { DEFAULT_RELAYS, fetchPollEvents, fetchRevealEvents, publishEvent } from '../nostr.js';
import { findPoll, selectReveal } from '../select.js';
import { promptForSignature } from '../sig.js';

export interface RevealOptions {
    pollId: string;
    revealSk: string;
    creator: string;
    sig?: string;
    relays?: string[];
    force?: boolean;
    dryRun?: boolean;
    json?: boolean;
}

export async function runReveal(opts: RevealOptions): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(opts.pollId)) {
        throw new Error('poll id must be 64 hex chars');
    }
    if (!/^[0-9a-f]{64}$/.test(opts.revealSk)) {
        throw new Error('reveal_sk must be 64 hex chars');
    }

    const relays = opts.relays ?? DEFAULT_RELAYS;
    const selected = await findPoll(await fetchPollEvents(opts.pollId, relays), opts.pollId, bip322Verify);
    const poll = selected.poll;
    if (poll.mode !== 'secret') throw new Error('poll is public-mode — no reveal needed');
    if (poll.creator !== opts.creator) {
        throw new Error(
            `poll creator is ${poll.creator} but you provided ${opts.creator}`
        );
    }
    if (Date.parse(poll.deadline) > Date.now() && !opts.force) {
        throw new Error(
            `poll deadline is ${poll.deadline} — pass --force to publish before deadline`
        );
    }

    // Only a reveal that verifies against the poll counts as already published.
    const existing = await selectReveal((await fetchRevealEvents(opts.pollId, relays)).events, poll, bip322Verify);
    if (existing && !opts.force) {
        throw new Error('a reveal event already exists for this poll (pass --force to replace)');
    }

    const draft: Reveal = {
        v: 0,
        kind: 'oc-vote/reveal',
        poll_id: opts.pollId,
        reveal_sk: opts.revealSk,
        revealed_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        sig: { alg: 'bip322', pubkey: opts.creator, value: '' },
    };

    const rid = revealId(draft);

    if (opts.dryRun) {
        process.stdout.write(JSON.stringify({ reveal_id: rid, reveal: draft }, null, 2) + '\n');
        return;
    }

    const sigValue = await promptForSignature(opts.creator, rid, opts.sig);
    draft.sig.value = sigValue;

    const event = buildRevealEvent(draft);
    const results = await publishEvent(event, relays);
    const okCount = results.filter((r) => r.ok).length;

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    reveal_id: rid,
                    published: okCount,
                    total: results.length,
                    relays: results,
                    reveal: draft,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  reveal_id:  ${rid}\n`);
    w(`  poll:       ${poll.question}\n`);
    w(`  revealed:   ${draft.revealed_at}\n`);
    w(`  published:  ${okCount}/${results.length} relays\n`);
    for (const r of results) {
        w(`    ${r.ok ? '✓' : '✗'} ${r.relay}${r.reason ? ` (${r.reason})` : ''}\n`);
    }
    w(`\n  tally with: oc-vote tally ${opts.pollId}\n\n`);
}
