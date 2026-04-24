// oc-vote verify <poll_id> — fetch poll + ballots, verify every BIP-322 signature, report.

import {
    ballotId as computeBallotId,
    pollId as computePollId,
    type Ballot,
    type Poll,
} from '@orangecheck/vote-core';

import { DEFAULT_RELAYS, fetchBallotEvents, fetchPollEvent } from '../nostr.js';

export interface VerifyOptions {
    pollId: string;
    relays?: string[];
    json?: boolean;
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
    const pid = opts.pollId;
    if (!/^[0-9a-f]{64}$/.test(pid)) {
        throw new Error('poll id must be 64 hex chars');
    }
    const relays = opts.relays ?? DEFAULT_RELAYS;

    const [pollEvent, ballotEvents] = await Promise.all([
        fetchPollEvent(pid, relays),
        fetchBallotEvents(pid, relays),
    ]);
    if (!pollEvent) throw new Error('poll not found');
    const poll = JSON.parse(pollEvent.content) as Poll;
    if (computePollId(poll) !== pid) throw new Error('poll content mismatch');

    const mod = (await import('bip322-js')) as unknown as {
        Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
        default?: {
            Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
        };
    };
    const Verifier = mod.Verifier ?? mod.default?.Verifier;
    if (!Verifier) throw new Error('bip322 verifier unavailable');

    const pollSigOk = Verifier.verifySignature(poll.creator, pid, poll.sig.value);

    const ballots: Ballot[] = [];
    const seen = new Set<string>();
    const ballotResults: Array<{ voter: string; ballot_id: string; ok: boolean }> = [];
    for (const ev of ballotEvents) {
        try {
            const b = JSON.parse(ev.content) as Ballot;
            if (b.poll_id !== pid) continue;
            const bid = computeBallotId(b);
            if (seen.has(bid)) continue;
            seen.add(bid);
            ballots.push(b);
            const ok = Verifier.verifySignature(b.voter, bid, b.sig.value);
            ballotResults.push({ voter: b.voter, ballot_id: bid, ok });
        } catch {
            // skip
        }
    }

    const okCount = ballotResults.filter((r) => r.ok).length;

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                {
                    poll_id: pid,
                    poll_signature_valid: pollSigOk,
                    ballot_count: ballots.length,
                    ballots_valid: okCount,
                    ballots_invalid: ballots.length - okCount,
                    ballot_details: ballotResults,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  poll_id:                ${pid}\n`);
    w(`  poll signature:         ${pollSigOk ? 'VALID ✓' : 'INVALID ✗'}\n`);
    w(`  ballots observed:       ${ballots.length}\n`);
    w(`  ballots valid:          ${okCount}\n`);
    w(`  ballots invalid:        ${ballots.length - okCount}\n\n`);
    if (ballots.length - okCount > 0) {
        w(`  invalid ballots:\n`);
        for (const r of ballotResults.filter((x) => !x.ok)) {
            w(`    - ${r.voter} · ${r.ballot_id}\n`);
        }
        w(`\n`);
    }
}
