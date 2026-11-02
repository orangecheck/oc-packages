// oc-vote create — build + sign + publish a poll, then ask each relay alone for
// it back. It is published only once min(2, asked) relays serve a valid copy
// (OC Vote SPEC §3.4, quorum.ts); below that it says so and exits 2, and
// `oc-vote republish` sends the same signed event again.

import { hexEncode } from '@orangecheck/lock-crypto';
import { generateX25519KeyPair } from '@orangecheck/lock-crypto';
import { canonicalBytes, pollId } from '@orangecheck/vote-core';
import type { Poll, PollMode, Tiebreak, WeightMode } from '@orangecheck/vote-core';

import { buildPollEvent } from '../events.js';
import { DEFAULT_RELAYS } from '../nostr.js';
import { castEvent, relaysServingPoll } from '../quorum.js';
import { report } from '../report.js';
import { promptForSignature } from '../sig.js';

export interface CreateOptions {
    creator: string;
    question: string;
    options: { id: string; label: string }[];
    deadline: string;
    snapshotBlock: number | 'deadline';
    weightMode: WeightMode;
    capDays?: number;
    minSats: number;
    minDays: number;
    tiebreak: Tiebreak;
    mode: PollMode;
    notes?: string;
    sig?: string;
    relays?: string[];
    dryRun?: boolean;
    json?: boolean;
}

export async function runCreate(opts: CreateOptions): Promise<void> {
    if (!/^(bc1|1|3)[0-9a-zA-Z]+$/.test(opts.creator)) {
        throw new Error(`creator does not look like a Bitcoin mainnet address: ${opts.creator}`);
    }
    if (opts.options.length < 2) throw new Error('need at least 2 options');
    if (new Set(opts.options.map((o) => o.id)).size !== opts.options.length) {
        throw new Error('option ids must be unique');
    }

    // Secret mode: generate an X25519 reveal keypair.
    let reveal_pk: string | null = null;
    let reveal_sk: string | null = null;
    if (opts.mode === 'secret') {
        const kp = generateX25519KeyPair();
        reveal_sk = hexEncode(kp.secret);
        reveal_pk = hexEncode(kp.public);
    }

    const draft: Poll = {
        v: 0,
        kind: 'oc-vote/poll',
        creator: opts.creator,
        question: opts.question,
        options: opts.options,
        deadline: opts.deadline,
        snapshot_block: opts.snapshotBlock,
        weight_mode: opts.weightMode,
        weight_params:
            opts.weightMode === 'sats_days' && opts.capDays
                ? { cap_days: opts.capDays }
                : null,
        min_sats: opts.minSats,
        min_days: opts.minDays,
        mode: opts.mode,
        reveal_pk,
        tiebreak: opts.tiebreak,
        notes: opts.notes ?? null,
        created_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        sig: { alg: 'bip322', pubkey: opts.creator, value: '' },
    };

    const pid = pollId(draft);

    if (opts.dryRun) {
        const out = {
            poll_id: pid,
            poll: draft,
            ...(reveal_sk ? { reveal_sk, reveal_pk } : {}),
        };
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
        return;
    }

    const sigValue = await promptForSignature(opts.creator, pid, opts.sig);
    draft.sig.value = sigValue;

    // Built once: `oc-vote republish` sends this same event, so a poll that isn't
    // published yet keeps its id, and ballots cast against it stay its own.
    const event = buildPollEvent(draft);
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const serving = await castEvent(event, [], () => relaysServingPoll(draft, { relays }), { relays });
    const url = `https://vote.ochk.io/p/${pid}`;

    const tail = [`  url:        ${url}`];
    if (reveal_sk) {
        tail.push(
            '',
            '  SECRET MODE — save these or the poll is abandoned at deadline:',
            `    reveal_pk:  ${reveal_pk}`,
            `    reveal_sk:  ${reveal_sk}`,
            '  to publish the reveal:',
            `    oc-vote reveal --poll ${pid} --reveal-sk ${reveal_sk} --creator ${opts.creator}`
        );
    }
    tail.push('', '  canonical bytes:', canonicalBytes({ ...draft, sig: { ...draft.sig, value: '' } }).trimEnd());

    report({
        id: ['poll_id', pid],
        main: { kind: 'poll', event, relays, serving },
        json: Boolean(opts.json),
        jsonExtra: { poll: draft, ...(reveal_sk ? { reveal_sk, reveal_pk } : {}), url },
        tail,
    });
}
