// Deterministic tally per SPEC §8.
//
// tally(poll, ballots[], utxosAt, revealSk?) -> { state, snapshot_block, turnout, tallies }
//
// Pure function. Same inputs → byte-identical output across implementations.
// Signature verification is delegated to the caller (pass `verifySig: false` to skip,
// e.g. in test-vector conformance where signatures are fakes).

import { commit as computeCommit } from './commit.js';
import { ballotId, pollId } from './ids.js';
import type {
    Ballot,
    Poll,
    TallyResult,
    Tiebreak,
    UtxoLookup,
    Utxo,
} from './types.js';
import { isSupportedMode, voterWeight } from './weight.js';

export interface TallyOptions {
    poll: Poll;
    ballots: Ballot[];
    utxosAt: UtxoLookup;
    /**
     * When `poll.snapshot_block === 'deadline'`, the caller must pre-resolve
     * the deadline to a concrete chain block height and pass it here.
     *
     * Important: do NOT mutate `poll.snapshot_block` to inject the resolved
     * height. The poll's canonical bytes (and therefore `pollId(poll)`)
     * include `snapshot_block` verbatim — overwriting `"deadline"` with a
     * number changes the canonical form, changes the computed pollId, and
     * causes the structural filter below (`b.poll_id !== pid`) to drop
     * every ballot. Use this field instead.
     */
    snapshotBlock?: number;
    /** Optional: map of voter→plaintext option id, populated from unsealed secret ballots. */
    revealedOptions?: Record<string, string>;
    /** Async BIP-322 verifier. If omitted, signature verification is skipped. */
    /**
     * POSITIONAL, and this package's order is `(address, message, signature)`.
     *
     * BE CAREFUL. Every other package in the family — agent-core, lock-core,
     * stamp-core, pledge-core, stamp-cli — declares this callback as
     * `(msg, signatureB64, address)`. vote-core is the lone outlier, and
     * TypeScript cannot help you: both are
     * `(string, string, string) => Promise<boolean>`, so passing a verifier
     * written for a sibling package compiles cleanly and then verifies the
     * wrong things. That is not hypothetical — it shipped in oc-vote-web,
     * where every signature check silently passed garbage and the live tally
     * counted forged ballots.
     *
     * Prefer `verify` below, which takes a named-argument object and therefore
     * cannot be got wrong. This positional form is kept because changing its
     * order would be a SILENTLY breaking change for existing callers: they
     * would keep compiling and start verifying incorrectly, which is the worst
     * possible way to break an API.
     */
    verifyBip322?: (
        address: string,
        message: string,
        signatureB64: string
    ) => Promise<boolean> | boolean;
    /**
     * Named-argument verifier. Preferred over `verifyBip322` — an object
     * literal cannot silently swap its fields the way three positional strings
     * can. Takes precedence when both are supplied.
     */
    verify?: (args: {
        address: string;
        message: string;
        signature: string;
    }) => Promise<boolean> | boolean;
    /**
     * Skip BIP-322 checks entirely. Required to be EXPLICIT: tally throws when
     * neither this nor a verifier is supplied, rather than quietly tallying
     * unverified ballots. Intended for the spec-conformance harness, whose
     * fixtures carry deliberately fake signatures.
     */
    skipSignatures?: boolean;
}

export async function tally(opts: TallyOptions): Promise<TallyResult> {
    const { poll, ballots, utxosAt } = opts;
    // Fail CLOSED on a missing verifier.
    //
    // This used to read `if (!opts.skipSignatures && opts.verifyBip322)`, so a
    // caller who supplied NEITHER got a tally over completely unverified
    // ballots and no indication anything was wrong. agent-core's equivalent
    // has always returned E_BAD_SIG ("no BIP-322 verifier supplied") in the
    // same situation — vote-core was the outlier, and the consequence shipped:
    // oc-vote-web's live poll page tallied forged ballots.
    //
    // Skipping signatures is now an explicit decision the caller has to state.
    if (!opts.skipSignatures && !opts.verify && !opts.verifyBip322) {
        throw new Error(
            'tally requires a signature verifier: pass `verify` (preferred, named arguments) ' +
                'or `verifyBip322`, or set `skipSignatures: true` to state deliberately that ' +
                'signatures are not being checked'
        );
    }
    if (!isSupportedMode(poll.weight_mode)) {
        throw new Error(
            `weight_mode "${poll.weight_mode}" not supported by this client`
        );
    }

    // 1. Filter to ballots that structurally belong to this poll and are in time.
    const deadlineMs = Date.parse(poll.deadline);
    const pid = pollId(poll);
    const filtered: Ballot[] = [];
    for (const b of ballots) {
        if (b.poll_id !== pid) continue;
        if (Date.parse(b.created_at) > deadlineMs) continue;

        if (poll.mode === 'secret') {
            if (b.secret == null) continue;
        } else {
            if (b.option == null) continue;
            if (
                b.option !== 'withdraw' &&
                !poll.options.some((o) => o.id === b.option)
            ) {
                continue;
            }
        }

        if (!opts.skipSignatures) {
            const id = ballotId(b);
            const ok = opts.verify
                ? await opts.verify({ address: b.voter, message: id, signature: b.sig.value })
                : await opts.verifyBip322!(b.voter, id, b.sig.value);
            if (!ok) continue;
        }

        filtered.push(b);
    }

    // 2. De-duplicate per voter using poll.tiebreak.
    const perVoter = new Map<string, Ballot>();
    for (const b of filtered) {
        const existing = perVoter.get(b.voter);
        if (!existing) {
            perVoter.set(b.voter, b);
        } else {
            perVoter.set(b.voter, chooseByTiebreak(existing, b, poll.tiebreak));
        }
    }

    // 3. Reveal: if secret mode, substitute plaintext option from revealedOptions,
    //    verifying the commit binding per SPEC §4.4.
    if (poll.mode === 'secret') {
        if (!opts.revealedOptions) return { state: 'awaiting_reveal' };
        for (const [voter, b] of Array.from(perVoter.entries())) {
            const option = opts.revealedOptions[voter];
            if (option == null || !b.secret) {
                perVoter.delete(voter);
                continue;
            }
            const expected = computeCommit(b.poll_id, voter, option);
            if (expected !== b.secret.commit) {
                perVoter.delete(voter); // E_COMMIT_MISMATCH
                continue;
            }
            // non-destructively substitute the option
            perVoter.set(voter, { ...b, option });
        }
    }

    // 4. Resolve snapshot block. The caller MUST pass `opts.snapshotBlock`
    //    when poll.snapshot_block === 'deadline' — see the option doc for
    //    why mutating poll.snapshot_block is unsafe (changes pollId).
    let H: number;
    if (typeof poll.snapshot_block === 'number') {
        H = poll.snapshot_block;
    } else if (typeof opts.snapshotBlock === 'number') {
        H = opts.snapshotBlock;
    } else {
        throw new Error(
            'tally: poll.snapshot_block === "deadline" but opts.snapshotBlock was not provided. ' +
                'Pass the resolved block height via opts.snapshotBlock — do NOT mutate poll.snapshot_block.'
        );
    }

    // 5. Sum weights per option. Deterministic iteration order by voter (sorted).
    const tallies: Record<string, number> = {};
    for (const o of poll.options) tallies[o.id] = 0;
    let turnoutVoters = 0;
    let turnoutWeight = 0;
    const voters = Array.from(perVoter.keys()).sort();
    for (const voter of voters) {
        const b = perVoter.get(voter);
        if (!b) continue;
        if (b.option === 'withdraw' || b.option == null) continue;
        if (!(b.option in tallies)) continue;
        const utxos: Utxo[] = await Promise.resolve(utxosAt(voter, H));
        const w = voterWeight({
            utxos,
            snapshot: H,
            minSats: poll.min_sats,
            minDays: poll.min_days,
            mode: poll.weight_mode,
            params: poll.weight_params,
        });
        if (w === 0) continue;
        tallies[b.option] = (tallies[b.option] ?? 0) + w;
        turnoutVoters++;
        turnoutWeight += w;
    }

    return {
        state: 'tallied',
        snapshot_block: H,
        turnout: { voters: turnoutVoters, weight: turnoutWeight },
        tallies,
    };
}

function chooseByTiebreak(a: Ballot, b: Ballot, t: Tiebreak): Ballot {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (t === 'latest') {
        if (tb > ta) return b;
        if (ta > tb) return a;
        // tie on created_at: pick greater ballot_id lexicographically
        return ballotId(b) > ballotId(a) ? b : a;
    }
    // tiebreak === 'first'
    if (tb < ta) return b;
    if (ta < tb) return a;
    return ballotId(b) < ballotId(a) ? b : a;
}

// Re-export so callers can `import { pollId, ballotId } from '@orangecheck/vote-core/tally'`
export { ballotId, pollId } from './ids.js';
export { commit, buildCommitMessage } from './commit.js';
export { canonicalBytes, canonicalize } from './canonical.js';
