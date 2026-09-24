// oc-vote tally <poll_id>

import { hexDecode, utf8Decode } from '@orangecheck/lock-crypto';
import { unseal } from '@orangecheck/lock-core';
import {
    ballotId,
    tally,
    type Ballot,
    type Poll,
    type Reveal,
    type SignatureVerifier,
    type TallyResult,
    type UtxoLookup,
} from '@orangecheck/vote-core';

import { bip322Verify } from '../bip322.js';
import {
    DEFAULT_RELAYS,
    fetchBallotEvents,
    fetchPollEvents,
    fetchRevealEvents,
} from '../nostr.js';
import { selectPoll, selectReveal } from '../select.js';
import { buildLookup, mempoolSource } from '../utxos.js';

export interface TallyOptions {
    pollId: string;
    relays?: string[];
    mempoolBase?: string;
    json?: boolean;
    verify?: boolean;
    snapshotBlock?: number;
}

/** Open a secret ballot's envelope with the revealed key (SPEC §6.4 step 2). */
export async function unsealOption(ballot: Ballot, revealSk: string): Promise<string | null> {
    if (!ballot.secret) return null;
    const result = await unseal({
        envelope: ballot.secret.envelope as unknown as Parameters<typeof unseal>[0]['envelope'],
        device: { device_id: 'reveal', secretKey: hexDecode(revealSk) },
        skipSenderVerification: true,
    });
    return utf8Decode(result.payload);
}

export interface ComputeTallyInput {
    poll: Poll;
    ballots: Ballot[];
    /** A reveal that already passed verifyReveal; null when none exists. */
    reveal: Reveal | null;
    utxosAt: UtxoLookup;
    snapshotBlock: number;
    tipHeight?: number;
    /** null skips every signature check (--no-verify). */
    verify: SignatureVerifier | null;
}

/**
 * vote-core's tally with this CLI's unsealer. vote-core calls `unseal` on each
 * voter's verified, tiebroken ballot only, so a ballot that fails its
 * signature never supplies a voter's option.
 */
export function computeTally(input: ComputeTallyInput): Promise<TallyResult> {
    const { poll, reveal } = input;
    return tally({
        poll,
        ballots: input.ballots,
        utxosAt: input.utxosAt,
        snapshotBlock: input.snapshotBlock,
        ...(input.tipHeight !== undefined ? { tipHeight: input.tipHeight } : {}),
        ...(input.verify ? { verify: input.verify } : { skipSignatures: true }),
        ...(poll.mode === 'secret' && reveal
            ? { unseal: (b: Ballot) => unsealOption(b, reveal.reveal_sk) }
            : {}),
    });
}

export async function runTally(opts: TallyOptions): Promise<void> {
    const { pollId: pid } = opts;
    if (!/^[0-9a-f]{64}$/.test(pid)) {
        throw new Error('poll id must be 64 hex chars');
    }
    const relays = opts.relays ?? DEFAULT_RELAYS;

    const verify = opts.verify !== false ? bip322Verify : null;
    const [pollEvents, ballotEvents, revealEvents] = await Promise.all([
        fetchPollEvents(pid, relays),
        fetchBallotEvents(pid, relays),
        fetchRevealEvents(pid, relays),
    ]);

    const selected = await selectPoll(pollEvents, pid, verify ?? bip322Verify);
    if (!selected) throw new Error('poll not found on any relay');
    if (verify && !selected.signatureValid) {
        throw new Error('poll signature does not verify against its creator (SPEC §10.1)');
    }
    const poll = selected.poll;

    const ballots: Ballot[] = [];
    const seen = new Set<string>();
    for (const ev of ballotEvents) {
        try {
            const b = JSON.parse(ev.content) as Ballot;
            if (b.poll_id !== pid) continue;
            const id = ballotId(b);
            if (seen.has(id)) continue;
            seen.add(id);
            ballots.push(b);
        } catch {
            // skip malformed
        }
    }

    // Only a reveal signed by the creator, after the deadline, opens ballots.
    const reveal: Reveal | null =
        poll.mode === 'secret' ? await selectReveal(revealEvents, poll, bip322Verify) : null;

    // Resolve snapshot
    const source = mempoolSource(opts.mempoolBase);
    const utxosAt = buildLookup(source);
    let snapshot = poll.snapshot_block;
    if (typeof snapshot !== 'number') {
        snapshot = opts.snapshotBlock ?? (await source.fetchTipHeight());
    }

    // Pass `snapshotBlock` rather than mutating poll.snapshot_block: the
    // poll's canonical bytes (and therefore pollId) include snapshot_block
    // verbatim, and mutating it would invalidate every ballot's poll_id.
    // A snapshot fixed by the poll must have 6 confirmations (SPEC §10.5).
    const result = await computeTally({
        poll,
        ballots,
        reveal,
        utxosAt,
        snapshotBlock: snapshot,
        ...(typeof poll.snapshot_block === 'number'
            ? { tipHeight: await source.fetchTipHeight() }
            : {}),
        verify,
    });

    const output = {
        poll_id: pid,
        question: poll.question,
        creator: poll.creator,
        mode: poll.mode,
        weight_mode: poll.weight_mode,
        deadline: poll.deadline,
        ballot_count: ballots.length,
        reveal_present: reveal != null,
        ...result,
    };

    if (opts.json) {
        process.stdout.write(JSON.stringify(output, null, 2) + '\n');
        return;
    }

    // Human-readable
    const w = (s: string) => process.stdout.write(s);
    w(`\n  poll:       ${poll.question}\n`);
    w(`  poll_id:    ${pid}\n`);
    w(`  creator:    ${poll.creator}\n`);
    w(`  mode:       ${poll.mode}${poll.mode === 'secret' ? (reveal ? ' (revealed)' : ' (awaiting reveal)') : ''}\n`);
    w(`  weight:     ${poll.weight_mode}\n`);
    w(`  threshold:  ${poll.min_sats} sat / ${poll.min_days} d\n`);
    w(`  deadline:   ${poll.deadline}\n`);
    w(`  snapshot:   ${snapshot}\n`);
    w(`  ballots:    ${ballots.length}\n`);
    w(`\n`);

    if (result.state === 'awaiting_reveal') {
        w(`  STATE:      awaiting reveal — secret-mode poll, creator has not yet published reveal_sk\n\n`);
        return;
    }

    w(`  STATE:      tallied\n`);
    w(`  turnout:    ${result.turnout.voters} voters, weight ${result.turnout.weight.toLocaleString()}\n\n`);

    // Sort options by poll.options order
    const total = result.turnout.weight;
    const maxLabel = Math.max(...poll.options.map((o) => o.label.length));
    for (const opt of poll.options) {
        const wgt = result.tallies[opt.id] ?? 0;
        const pct = total > 0 ? (wgt / total) * 100 : 0;
        const barLen = total > 0 ? Math.round((wgt / total) * 30) : 0;
        const bar = '█'.repeat(barLen) + '·'.repeat(30 - barLen);
        w(`  ${opt.label.padEnd(maxLabel)}  ${bar}  ${wgt.toLocaleString().padStart(12)}  ${pct.toFixed(1).padStart(5)}%\n`);
    }
    w(`\n`);
}
