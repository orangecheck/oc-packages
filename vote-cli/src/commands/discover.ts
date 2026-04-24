// oc-vote discover — list recent polls across the default relay set.

import { pollId as computePollId } from '@orangecheck/vote-core';
import type { Poll } from '@orangecheck/vote-core';

import { DEFAULT_RELAYS, fetchRecentPolls } from '../nostr.js';

export interface DiscoverOptions {
    limit?: number;
    relays?: string[];
    json?: boolean;
    openOnly?: boolean;
}

export async function runDiscover(opts: DiscoverOptions): Promise<void> {
    const limit = opts.limit ?? 30;
    const events = await fetchRecentPolls(limit, opts.relays ?? DEFAULT_RELAYS);

    interface Item {
        poll_id: string;
        poll: Poll;
        nostr_created_at: number;
    }
    const seen = new Set<string>();
    const items: Item[] = [];
    for (const ev of events) {
        try {
            const poll = JSON.parse(ev.content) as Poll;
            if (poll.kind !== 'oc-vote/poll' || poll.v !== 0) continue;
            const pid = computePollId(poll);
            if (seen.has(pid)) continue;
            seen.add(pid);
            if (opts.openOnly && Date.parse(poll.deadline) < Date.now()) continue;
            items.push({ poll_id: pid, poll, nostr_created_at: ev.created_at });
        } catch {}
    }
    items.sort((a, b) => b.nostr_created_at - a.nostr_created_at);

    if (opts.json) {
        process.stdout.write(JSON.stringify(items, null, 2) + '\n');
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  discovered ${items.length} poll(s) across ${(opts.relays ?? DEFAULT_RELAYS).length} relays\n\n`);
    for (const { poll, poll_id, nostr_created_at } of items) {
        const isPast = Date.parse(poll.deadline) < Date.now();
        const age = Math.max(0, Math.floor((Date.now() / 1000 - nostr_created_at) / 60));
        const ageStr =
            age < 1
                ? 'just now'
                : age < 60
                ? `${age}m`
                : age < 60 * 24
                ? `${Math.floor(age / 60)}h`
                : `${Math.floor(age / (60 * 24))}d`;
        w(`  [${isPast ? 'closed' : ' open '}] [${poll.weight_mode.padEnd(15)}] ${ageStr.padStart(5)} · ${poll.question}\n`);
        w(`            https://vote.ochk.io/p/${poll_id}\n`);
    }
    if (items.length === 0) {
        w(`  No polls found. Try: oc-vote create\n`);
    }
    w(`\n`);
}
