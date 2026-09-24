// oc-vote show <poll_id> — print the poll metadata + ballot count.


import { bip322Verify } from '../bip322.js';
import { DEFAULT_RELAYS, fetchBallotEvents, fetchPollEvents } from '../nostr.js';
import { findPoll, requireComplete } from '../select.js';

export interface ShowOptions {
    pollId: string;
    relays?: string[];
    json?: boolean;
}

export async function runShow(opts: ShowOptions): Promise<void> {
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
    const { poll, signatureValid } = selected;

    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                { poll, poll_signature_valid: signatureValid, ballot_count: ballotEvents.length },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const w = (s: string) => process.stdout.write(s);
    w(`\n  question:    ${poll.question}\n`);
    w(`  options:     ${poll.options.map((o) => `${o.id} (${o.label})`).join(', ')}\n`);
    w(`  creator:     ${poll.creator}${signatureValid ? '' : '  (SIGNATURE DOES NOT VERIFY)'}\n`);
    w(`  mode:        ${poll.mode}\n`);
    w(`  weight:      ${poll.weight_mode}${poll.weight_mode === 'sats_days' && poll.weight_params?.cap_days ? ` (cap ${poll.weight_params.cap_days}d)` : ''}\n`);
    w(`  threshold:   ${poll.min_sats} sat / ${poll.min_days} d\n`);
    w(`  tiebreak:    ${poll.tiebreak}\n`);
    w(`  deadline:    ${poll.deadline}\n`);
    w(`  snapshot:    ${poll.snapshot_block}\n`);
    w(`  ballots:     ${ballotEvents.length}\n`);
    if (poll.notes) w(`  notes:       ${poll.notes}\n`);
    w(`\n`);
}
