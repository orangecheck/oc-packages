// oc-vote create — build + sign + publish a poll.

import { hexEncode } from '@orangecheck/lock-crypto';
import { generateX25519KeyPair } from '@orangecheck/lock-crypto';
import { canonicalBytes, pollId } from '@orangecheck/vote-core';
import type { Poll, PollMode, Tiebreak, WeightMode } from '@orangecheck/vote-core';

import { buildPollEvent } from '../events.js';
import { DEFAULT_RELAYS, publishEvent } from '../nostr.js';
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

    const event = buildPollEvent(draft);
    const results = await publishEvent(event, opts.relays ?? DEFAULT_RELAYS);
    const okCount = results.filter((r) => r.ok).length;

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    poll_id: pid,
                    published: okCount,
                    total: results.length,
                    relays: results,
                    poll: draft,
                    ...(reveal_sk ? { reveal_sk, reveal_pk } : {}),
                    url: `https://vote.ochk.io/p/${pid}`,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  poll_id:    ${pid}\n`);
    w(`  published:  ${okCount}/${results.length} relays\n`);
    for (const r of results) {
        w(`    ${r.ok ? '✓' : '✗'} ${r.relay}${r.reason ? ` (${r.reason})` : ''}\n`);
    }
    w(`  url:        https://vote.ochk.io/p/${pid}\n`);
    if (reveal_sk) {
        w(`\n  SECRET MODE — save these or the poll is abandoned at deadline:\n`);
        w(`    reveal_pk:  ${reveal_pk}\n`);
        w(`    reveal_sk:  ${reveal_sk}\n`);
        w(`  to publish the reveal:\n`);
        w(`    oc-vote reveal --poll ${pid} --reveal-sk ${reveal_sk} --creator ${opts.creator}\n`);
    }
    w(`\n  canonical bytes:\n`);
    w(canonicalBytes({ ...draft, sig: { ...draft.sig, value: '' } }));
    w(`\n`);
}
