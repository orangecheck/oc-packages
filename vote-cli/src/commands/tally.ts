// oc-vote tally <poll_id>

import { hexDecode, utf8Decode } from '@orangecheck/lock-crypto';
import { unseal } from '@orangecheck/lock-core';
import {
    ANCHOR_FINAL_CONFIRMATIONS,
    ballotId,
    lastAnchorHeight,
    mempoolBlockTimeSource,
    resolvePollSnapshot,
    tally,
    type Ballot,
    type Poll,
    type Reveal,
    type SignatureVerifier,
    type TallyResult,
    type UtxoLookup,
} from '@orangecheck/vote-core';

import { anchoredChain, type AnchoredChain } from '../anchors.js';
import { ballotCopiesFromEvents } from '../ballots.js';
import { bip322Verify } from '../bip322.js';
import {
    DEFAULT_RELAYS,
    fetchBallotEvents,
    fetchPollEvents,
    fetchRevealEvents,
} from '../nostr.js';
import { findPoll, requireComplete, selectReveal } from '../select.js';
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
    /** A clock-dated poll's snapshot height; an anchored poll's "deadline" snapshot is H_close. */
    snapshotBlock?: number;
    /** An anchored poll's tip, H_close and anchor heights (SPEC §4.6). */
    chain?: AnchoredChain | null;
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
        ...(input.snapshotBlock !== undefined ? { snapshotBlock: input.snapshotBlock } : {}),
        ...(input.chain
            ? {
                  tipHeight: input.chain.tipHeight,
                  closeHeight: input.chain.closeHeight,
                  anchorHeight: input.chain.anchorHeight,
              }
            : {}),
        ...(input.verify ? { verify: input.verify } : { skipSignatures: true }),
        ...(poll.mode === 'secret' && reveal
            ? { unseal: (b: Ballot) => unsealOption(b, reveal.reveal_sk) }
            : {}),
    });
}

/**
 * The snapshot height, resolved by vote-core per SPEC §3 (greatest
 * median_time_past ≤ deadline, ≥ 6 confirmations) — the same code the web
 * tallier runs. `--snapshot` overrides a deadline poll explicitly.
 */
export async function resolveSnapshot(
    poll: Poll,
    opts: Pick<TallyOptions, 'mempoolBase' | 'snapshotBlock'>,
    fetchImpl?: typeof fetch
): Promise<number> {
    if (poll.snapshot_block === 'deadline' && opts.snapshotBlock !== undefined) {
        return opts.snapshotBlock;
    }
    const r = await resolvePollSnapshot(
        poll,
        mempoolBlockTimeSource({
            ...(opts.mempoolBase ? { base: opts.mempoolBase } : {}),
            ...(fetchImpl ? { fetch: fetchImpl } : {}),
        })
    );
    if (!r.ok) throw new Error(`snapshot not tallyable yet (${r.code}): ${r.reason}`);
    return r.height;
}

/** What a tally run did not check, so its output can say so. */
export function skippedChecks(
    poll: Pick<Poll, 'snapshot_block'>,
    opts: Pick<TallyOptions, 'verify' | 'snapshotBlock'>
): string[] {
    const skipped: string[] = [];
    if (opts.verify === false) skipped.push('signatures (--no-verify)');
    if (poll.snapshot_block === 'deadline' && opts.snapshotBlock !== undefined) {
        skipped.push('snapshot resolution and confirmations (--snapshot)');
    }
    return skipped;
}

export async function runTally(opts: TallyOptions): Promise<void> {
    const { pollId: pid } = opts;
    if (!/^[0-9a-f]{64}$/.test(pid)) {
        throw new Error('poll id must be 64 hex chars');
    }
    const relays = opts.relays ?? DEFAULT_RELAYS;

    const verify = opts.verify !== false ? bip322Verify : null;
    const [pollFetch, ballotFetch, revealFetch] = await Promise.all([
        fetchPollEvents(pid, relays),
        fetchBallotEvents(pid, relays),
        fetchRevealEvents(pid, relays),
    ]);

    const selected = await findPoll(pollFetch, pid, verify ?? bip322Verify);
    if (verify && !selected.signatureValid) {
        throw new Error('poll signature does not verify against its creator (SPEC §10.1)');
    }
    const poll = selected.poll;

    // Every copy: the tally verifies each before it picks one ballot per voter.
    const ballots = ballotCopiesFromEvents(requireComplete(ballotFetch, 'ballot'), pid);

    // An anchored poll is counted against the chain (SPEC §4.6): the tip,
    // H_close, and each ballot's anchor from every stamp the relays hold.
    const chain = await anchoredChain(poll, ballots.map(ballotId), {
        ballotRelays: ballotFetch.relays,
        relays,
        ...(opts.mempoolBase ? { mempoolBase: opts.mempoolBase } : {}),
    });

    // Only a reveal signed by the creator, once the poll has closed, opens ballots.
    const reveal: Reveal | null =
        poll.mode === 'secret'
            ? await selectReveal(revealFetch.events, poll, bip322Verify, chain ?? undefined)
            : null;
    // No reveal found is only "awaiting reveal" if a relay finished answering.
    if (poll.mode === 'secret' && !reveal) requireComplete(revealFetch, 'reveal');

    const source = mempoolSource(opts.mempoolBase);
    const utxosAt = buildLookup(source);
    // An anchored poll's tally checks its own snapshot against the tip.
    const snapshot = chain ? undefined : await resolveSnapshot(poll, opts);

    // Pass `snapshotBlock` rather than mutating poll.snapshot_block: the
    // poll's canonical bytes (and therefore pollId) include snapshot_block
    // verbatim, and mutating it would invalidate every ballot's poll_id.
    const result = await computeTally({
        poll,
        ballots,
        reveal,
        utxosAt,
        ...(snapshot !== undefined ? { snapshotBlock: snapshot } : {}),
        chain,
        verify,
    });

    const skipped = skippedChecks(poll, opts);
    const output = {
        poll_id: pid,
        question: poll.question,
        creator: poll.creator,
        mode: poll.mode,
        weight_mode: poll.weight_mode,
        deadline: poll.deadline,
        ballot_count: new Set(ballots.map((b) => ballotId(b))).size,
        reveal_present: reveal != null,
        skipped,
        ...(chain?.finalBlocked ? { not_final_because: chain.finalBlocked } : {}),
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
    if (snapshot !== undefined) w(`  snapshot:   ${snapshot}\n`);
    if (chain) {
        const close = chain.closeHeight;
        w(`  timing:     anchored in Bitcoin blocks (SPEC §4.6); tip ${chain.chainTip}\n`);
        if (chain.finalBlocked) w(`  ! not final: ${chain.finalBlocked}\n`);
        w(
            close === null
                ? `  close:      no block at the deadline yet\n`
                : `  close:      H_close ${close}; anchors count up to ${lastAnchorHeight(close)}; final at ${lastAnchorHeight(close) + ANCHOR_FINAL_CONFIRMATIONS}\n`
        );
    } else {
        w(`  timing:     dated by each voter's own clock (deadline before 2026-11-15)\n`);
    }
    w(`  ballots:    ${new Set(ballots.map((b) => ballotId(b))).size}\n`);
    for (const what of skipped) w(`  ! not checked: ${what}\n`);
    w(`\n`);

    if (result.state === 'awaiting_reveal') {
        w(`  STATE:      awaiting reveal — secret-mode poll, no reveal accepted yet\n\n`);
        return;
    }
    if (result.state === 'deferred') {
        w(`  STATE:      deferred (${result.code}) — the snapshot block is not known yet or has fewer than 6 confirmations\n\n`);
        return;
    }

    w(
        result.state === 'provisional'
            ? `  STATE:      provisional — not final; ${result.unanchored ?? 0} counted ballot(s) not anchored in time yet\n`
            : `  STATE:      tallied\n`
    );
    w(`  counted:    ${result.counted.length} ballot(s)\n`);
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
