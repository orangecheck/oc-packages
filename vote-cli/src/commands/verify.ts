// oc-vote verify <poll_id> — fetch poll + ballots, verify every BIP-322 signature, report.

import { ballotCopiesFromEvents, ballotVerdicts } from '../ballots.js';
import { bip322Verify } from '../bip322.js';
import { DEFAULT_RELAYS, fetchBallotEvents, fetchPollEvents } from '../nostr.js';
import { findPoll, requireComplete } from '../select.js';

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

    const [pollFetch, ballotFetch] = await Promise.all([
        fetchPollEvents(pid, relays),
        fetchBallotEvents(pid, relays),
    ]);
    const selected = await findPoll(pollFetch, pid, bip322Verify);
    const ballotEvents = requireComplete(ballotFetch, 'ballot');

    const pollSigOk = selected.signatureValid;

    // One verdict per ballot, from every copy the relays hold: valid when any copy verifies.
    const ballotResults = ballotVerdicts(ballotCopiesFromEvents(ballotEvents, pid));
    const ballots = ballotResults;

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
