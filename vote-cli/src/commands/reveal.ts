// oc-vote reveal — publish the reveal event for a secret-mode poll, then ask
// each relay alone for it back. It is published only once min(2, asked) relays
// serve a copy a count accepts (OC Vote SPEC §3.4, quorum.ts); below that it
// says so and exits 2, and `oc-vote republish` sends the same signed event
// again. A reveal already on the relays is sent again as it is, not re-signed.

import {
    ANCHOR_FINAL_CONFIRMATIONS,
    anchoredTallyIsFinal,
    isAnchoredPoll,
    lastAnchorHeight,
    mempoolBlockTimeSource,
    resolveCloseBlock,
    revealId,
} from '@orangecheck/vote-core';
import type { Poll, Reveal } from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';

import { buildRevealEvent } from '../events.js';
import { DEFAULT_RELAYS, fetchPollEvents, fetchRevealEvents } from '../nostr.js';
import { castEvent, relaysServingReveal, type RevealChain } from '../quorum.js';
import { report } from '../report.js';
import { findPoll, findReveal } from '../select.js';
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

/**
 * For an anchored poll, the chain a count checks a reveal against (vote-core
 * `verifyReveal`); undefined for a clock-dated poll.
 */
export async function revealChainFor(poll: Poll): Promise<RevealChain | undefined> {
    if (!isAnchoredPoll(poll)) return undefined;
    const close = await resolveCloseBlock(poll.deadline, mempoolBlockTimeSource());
    if (!close.ok) throw new Error(`the block at the deadline could not be read: ${close.reason}`);
    return { tipHeight: close.tip, closeHeight: close.height };
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
    // SPEC §10.3: an anchored poll's reveal counts only once the tip reaches
    // H_close + G + 6; a clock-dated poll's once the deadline has passed.
    const chain = await revealChainFor(poll);
    if (chain) {
        if (!anchoredTallyIsFinal(chain.closeHeight, chain.tipHeight) && !opts.force) {
            throw new Error(
                chain.closeHeight === null
                    ? 'no block at the deadline yet: talliers would not accept a reveal now (pass --force to publish anyway)'
                    : `talliers accept the reveal from block ${lastAnchorHeight(chain.closeHeight) + ANCHOR_FINAL_CONFIRMATIONS}; the tip is ${chain.tipHeight} (pass --force to publish anyway)`
            );
        }
    } else if (Date.parse(poll.deadline) > Date.now() && !opts.force) {
        throw new Error(
            `poll deadline is ${poll.deadline} — pass --force to publish before deadline`
        );
    }

    // A reveal that verifies against the poll is already signed: send that same
    // event to the relays that don't serve it, rather than ask for a new
    // signature. --force signs a new one instead.
    const existing = await findReveal((await fetchRevealEvents(opts.pollId, relays)).events, poll, bip322Verify, chain);
    if (existing && !opts.force) {
        const readBack = () => relaysServingReveal(existing.reveal, poll, { relays, chain });
        const serving = await castEvent(existing.event, await readBack(), readBack, { relays });
        report({
            id: ['reveal_id', revealId(existing.reveal)],
            heading: [
                ['poll', poll.question],
                ['revealed', existing.reveal.revealed_at],
            ],
            main: { kind: 'reveal', event: existing.event, relays, serving },
            json: Boolean(opts.json),
            jsonExtra: { reveal: existing.reveal, signed_earlier: true },
            tail: [
                '  note:       this reveal was signed earlier and found on the relays; it was sent as it is',
                '',
                `  tally with: oc-vote tally ${opts.pollId}`,
            ],
        });
        return;
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

    // Built once: `oc-vote republish` sends this same event.
    const event = buildRevealEvent(draft);
    const serving = await castEvent(event, [], () => relaysServingReveal(draft, poll, { relays, chain }), { relays });
    report({
        id: ['reveal_id', rid],
        heading: [
            ['poll', poll.question],
            ['revealed', draft.revealed_at],
        ],
        main: { kind: 'reveal', event, relays, serving },
        json: Boolean(opts.json),
        jsonExtra: { reveal: draft },
        tail: ['', `  tally with: oc-vote tally ${opts.pollId}`],
    });
}
