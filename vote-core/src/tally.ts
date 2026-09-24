// Deterministic tally per SPEC §8.
//
// tally(poll, ballots[], utxosAt, revealSk?) -> { state, snapshot_block, turnout, tallies }
//
// Pure function. Same inputs → byte-identical output across implementations.
// The caller SUPPLIES the BIP-322 verifier, but supplying one is not optional:
// tally throws unless it is given `verify` / `verifyBip322`, or told explicitly
// to skip with `skipSignatures: true` (the test-vector harness, whose fixtures
// carry deliberately fake signatures).

import { commit as computeCommit } from './commit.js';
import { ballotId, pollId } from './ids.js';
import { BALLOT_VERSION, POLL_VERSION } from './types.js';
import type {
    Ballot,
    Poll,
    TallyResult,
    Tiebreak,
    UtxoLookup,
    Utxo,
} from './types.js';
import { isBlockHeight, isMainnetAddress, VoteError } from './verify.js';
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
    /**
     * Secret mode: recover the plaintext option id from a ballot's
     * `secret.envelope` (SPEC §6.4 step 2). Called once per voter, and only on
     * the ballot that survived signature checks and the tiebreak, so a relay
     * cannot substitute another ballot's envelope for a voter. Return null or
     * throw when the envelope does not open; the voter is then dropped.
     */
    unseal?: (ballot: Ballot) => Promise<string | null> | string | null;
    /**
     * @deprecated Use `unseal`. A voter-keyed map cannot say WHICH of a
     * voter's ballots it was unsealed from, so a caller that fills it from
     * every relay ballot lets an unsigned ballot's envelope stand in for the
     * voter's signed one. Ignored when `unseal` is supplied.
     */
    revealedOptions?: Record<string, string>;
    /**
     * Current chain tip height. When supplied, `tally` throws `VoteError`
     * `E_REORG` unless the snapshot block has at least 6 confirmations
     * (SPEC §10.5), which also refuses a snapshot that has not been mined.
     */
    tipHeight?: number;
    /** Async BIP-322 verifier. Omitting every verifier throws — see `skipSignatures`. */
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
    // SPEC §12: "Clients MUST reject polls and ballots whose `v` they do not
    // support." The `v: 0` in types.ts is a TYPE, and types are erased — a poll
    // parsed from a relay event carries whatever integer the publisher wrote,
    // so nothing checked this at runtime. A future v1 that redefines weighting
    // or the canonical form would otherwise be tallied silently under v0 rules.
    // Throws like the weight_mode gate above: an unsupported poll is not a
    // partial tally, it is not a tally.
    if (poll.v !== POLL_VERSION) {
        throw new Error(
            `poll v=${poll.v} not supported by this client (expects ${POLL_VERSION})`
        );
    }

    // SPEC §10.1: a poll whose signature fails against `creator` MUST be rejected.
    const pid = pollId(poll);
    if (!opts.skipSignatures) {
        const ok =
            isMainnetAddress(poll.creator) &&
            typeof poll.sig?.value === 'string' &&
            poll.sig.value !== '' &&
            (opts.verify
                ? await opts.verify({ address: poll.creator, message: pid, signature: poll.sig.value })
                : await opts.verifyBip322!(poll.creator, pid, poll.sig.value));
        if (!ok) throw new VoteError('E_BAD_SIG', 'poll signature does not verify against creator');
    }

    // 1. Filter to ballots that structurally belong to this poll and are in time.
    const deadlineMs = Date.parse(poll.deadline);
    const filtered: Ballot[] = [];
    for (const b of ballots) {
        // Per-ballot version, dropped rather than thrown: one publisher on a
        // format we do not speak must not void everyone else's tally, which is
        // how every other structural mismatch in this loop behaves.
        if (b.v !== BALLOT_VERSION) continue;
        if (b.poll_id !== pid) continue;
        // SPEC §4.3: voter MUST be a mainnet address. A UTXO lookup on another
        // network's address answers for a different chain, or not at all.
        if (!isMainnetAddress(b.voter)) continue;
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

    // 3. Reveal: if secret mode, unseal each voter's surviving ballot and
    //    verify the commit binding per SPEC §4.4.
    if (poll.mode === 'secret') {
        const { unseal, revealedOptions } = opts;
        if (!unseal && !revealedOptions) return { state: 'awaiting_reveal' };
        for (const [voter, b] of Array.from(perVoter.entries())) {
            let option: string | null = null;
            if (unseal) {
                try {
                    option = await unseal(b);
                } catch {
                    option = null;
                }
            } else if (revealedOptions && hasOwn(revealedOptions, voter)) {
                option = revealedOptions[voter] ?? null;
            }
            // E_UNKNOWN_OPTION: the plaintext must name one of the poll's options.
            if (
                typeof option !== 'string' ||
                !b.secret ||
                (option !== 'withdraw' && !poll.options.some((o) => o.id === option))
            ) {
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
    } else if (poll.snapshot_block === 'deadline' && typeof opts.snapshotBlock === 'number') {
        H = opts.snapshotBlock;
    } else {
        throw new Error(
            'tally: poll.snapshot_block === "deadline" but opts.snapshotBlock was not provided. ' +
                'Pass the resolved block height via opts.snapshotBlock — do NOT mutate poll.snapshot_block.'
        );
    }
    if (!isBlockHeight(H)) {
        throw new VoteError('E_WRONG_POLL', `snapshot block ${String(H)} is not a positive integer`);
    }
    if (opts.tipHeight !== undefined) {
        if (!isBlockHeight(opts.tipHeight)) throw new Error('tally: tipHeight must be a positive integer');
        if (opts.tipHeight - H + 1 < 6) {
            throw new VoteError(
                'E_REORG',
                `snapshot block ${H} has ${Math.max(0, opts.tipHeight - H + 1)} confirmations; 6 required`
            );
        }
    }

    // 5. Sum weights per option. Deterministic iteration order by voter (sorted).
    // fromEntries defines own properties, so an option id such as "__proto__"
    // is a key like any other; membership is tested with hasOwn, never `in`.
    const tallies: Record<string, number> = Object.fromEntries(
        poll.options.map((o) => [o.id, 0])
    );
    let turnoutVoters = 0;
    let turnoutWeight = 0;
    const voters = Array.from(perVoter.keys()).sort();
    for (const voter of voters) {
        const b = perVoter.get(voter);
        if (!b) continue;
        if (b.option === 'withdraw' || b.option == null) continue;
        if (!hasOwn(tallies, b.option)) continue;
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

function hasOwn(obj: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
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
