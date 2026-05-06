// Pure-function state machine — SPEC §4.4.
//
// Transition table (paraphrased):
//
//   abandonment present      → broken (always; no honorable exit, §5.4)
//   contradictory outcomes   → disputed (§4.5)
//   outcome present          → outcome.outcome   (after dispute window passes)
//   now >= expires_at        → expired_unresolved
//   now >= resolves_at       → resolvable
//   else                     → pending
//
// `resolves_at` normalization (§4.4):
//   - time-typed: use the wall-clock timestamp directly.
//   - block-typed: use the wall-clock time of that block. If chain.blockTimes
//     names it, use that. Else if chain.tip_height >= block, conservatively
//     use chain.tip_time (the block has been mined). Else +infinity (the
//     block hasn't been mined yet → still pending).

import type {
    ClassifyStateInput,
    OutcomeEnvelope,
    PledgeEnvelope,
    PledgeState,
} from './types.js';

export function classifyState(input: ClassifyStateInput): PledgeState {
    const { pledge, outcome, abandonment, now, contradictoryOutcomes } = input;
    const nowMs = parseUtc(now);

    // Abandonment trumps everything: SPEC §5.4 — no honorable-exit path.
    if (abandonment !== null) {
        // Trust the caller to have signature-verified the abandonment via
        // verifyAbandonment(); state classification is a pure function of
        // valid inputs.
        return 'broken';
    }

    // Contradictory outcome envelopes from authorized resolvers → disputed.
    if (outcome !== null && contradictoryOutcomes && contradictoryOutcomes.length > 0) {
        for (const other of contradictoryOutcomes) {
            if (other.pledge_id === outcome.pledge_id && other.outcome !== outcome.outcome) {
                return 'disputed';
            }
        }
    }

    if (outcome !== null) {
        // Note: outcome.outcome can be 'expired_unresolved' or 'disputed' too;
        // the state machine just returns whatever the resolver classified.
        // The dispute_window_ends_at gate is informational here — verifiers
        // wanting "provisional vs final" distinction should branch on it
        // themselves; we return the eventual classification.
        return outcome.outcome;
    }

    const expiresAtMs = parseUtc(pledge.expires_at);
    if (nowMs >= expiresAtMs) {
        return 'expired_unresolved';
    }

    const resolvesAtMs = normalizeResolvesAt(pledge, input.chain);
    if (resolvesAtMs !== null && nowMs >= resolvesAtMs) {
        return 'resolvable';
    }

    return 'pending';
}

function normalizeResolvesAt(
    pledge: PledgeEnvelope,
    chain?: ClassifyStateInput['chain'],
): number | null {
    const r = pledge.resolves_at;
    if ('time' in r) return parseUtc(r.time);
    if ('block' in r) {
        if (!chain) return null; // +infinity — pledge stays pending without chain context
        if (chain.blockTimes && chain.blockTimes[r.block]) {
            return parseUtc(chain.blockTimes[r.block]!);
        }
        if (chain.tip_height >= r.block) {
            // Block has been mined; we don't know its exact time but we know
            // it's been mined by `tip_time`. Conservative: use tip_time as an
            // upper bound on the resolves moment. Verifiers wanting a precise
            // wall-clock SHOULD inject blockTimes[r.block].
            return parseUtc(chain.tip_time);
        }
        return null; // not yet mined
    }
    return null;
}

/**
 * Parse a strict ISO 8601 UTC timestamp (YYYY-MM-DDTHH:MM:SSZ) into epoch ms.
 * No fractional seconds, no offsets other than `Z` — SPEC §0.
 */
function parseUtc(s: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(s);
    if (!m) throw new Error(`invalid ISO 8601 UTC string: ${s}`);
    const [, y, mo, d, h, mi, se] = m;
    return Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(h),
        Number(mi),
        Number(se),
    );
}

/**
 * Detect whether two outcome envelopes for the same pledge are contradictory.
 * Two outcomes contradict when they reference the same pledge_id AND classify
 * to different outcome values (kept vs broken etc).
 */
export function outcomesContradict(a: OutcomeEnvelope, b: OutcomeEnvelope): boolean {
    if (a.pledge_id !== b.pledge_id) return false;
    return a.outcome !== b.outcome;
}
