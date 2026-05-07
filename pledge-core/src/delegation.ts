// OC Agent §7.3 delegation checks for agent-delegated pledges.
//
// pledge-core's verifyPledge calls into this module when via_delegation is
// present in an envelope AND the caller supplied a DelegationLookup. The
// adapter (@orangecheck/agent-core or any equivalent) does the
// fetch + signature-verify side; this module does the pledge-specific
// scope-matching against the resolved delegation.
//
// The pledge:create scope grammar is documented in SPEC §7.3:
//
//   pledge:create
//   pledge:create(max_bond_sats=<N>)
//   pledge:create(mechanism=<m>)
//   pledge:create(counterparty=<addr>)
//   pledge:create(max_bond_sats=<N>,mechanism=<m>)
//   pledge:create(max_bond_sats=<N>,mechanism=<m>,counterparty=<addr>)
//
// Multiple constraints are AND-joined by comma. A pledge passes scope
// check iff every named constraint is satisfied.

import type {
    DelegationLookupResult,
    PledgeEnvelope,
    PledgeErrorCode,
} from './types.js';

export interface ScopeCheckOk {
    ok: true;
    matched_scope: string;
}

export interface ScopeCheckErr {
    ok: false;
    code: Extract<
        PledgeErrorCode,
        'E_DELEGATION_SCOPE_VIOLATED' | 'E_DELEGATION_NOT_FOUND'
    >;
    reason: string;
}

export type ScopeCheckResult = ScopeCheckOk | ScopeCheckErr;

/**
 * Find the first `pledge:create(...)` scope in the delegation and verify the
 * pledge satisfies all its constraints. SPEC §7.3.
 *
 * Returns ok with the matched raw scope string, or err with
 * E_DELEGATION_SCOPE_VIOLATED naming the failed constraint.
 */
export function checkPledgeCreateScope(
    pledge: PledgeEnvelope,
    delegation: DelegationLookupResult,
): ScopeCheckResult {
    let matched: string | null = null;
    let lastFailReason = '';
    for (const raw of delegation.scopes) {
        const parsed = parsePledgeCreateScope(raw);
        if (!parsed) continue;
        const violation = pledgeFailsConstraint(pledge, parsed);
        if (violation === null) {
            matched = raw;
            break;
        }
        lastFailReason = violation;
    }
    if (matched !== null) {
        return { ok: true, matched_scope: matched };
    }
    if (lastFailReason !== '') {
        return {
            ok: false,
            code: 'E_DELEGATION_SCOPE_VIOLATED',
            reason: lastFailReason,
        };
    }
    return {
        ok: false,
        code: 'E_DELEGATION_SCOPE_VIOLATED',
        reason: 'delegation does not authorize pledge:create',
    };
}

/**
 * Parse a single scope string. Returns the constraint map iff the scope's
 * product:verb is `pledge:create`; null for any other scope (caller skips
 * those). Tolerates whitespace inside parens; rejects malformed syntax by
 * returning null (the scope is treated as non-matching rather than
 * surfacing a parse error — matches OC Agent's permissive scope mode).
 */
export function parsePledgeCreateScope(scope: string): Record<string, string> | null {
    const trimmed = scope.trim();
    // Bare scope: just `pledge:create` with no constraints.
    if (trimmed === 'pledge:create') return {};
    const m = /^pledge:create\(([^)]*)\)$/.exec(trimmed);
    if (!m) return null;
    const inside = m[1]!.trim();
    if (inside === '') return {};
    const out: Record<string, string> = {};
    for (const pair of inside.split(',')) {
        const eq = pair.indexOf('=');
        if (eq === -1) return null; // malformed
        const key = pair.slice(0, eq).trim();
        const val = pair.slice(eq + 1).trim();
        if (!key) return null;
        out[key] = val;
    }
    return out;
}

/**
 * Returns null if the pledge satisfies every constraint; otherwise a
 * human-readable reason naming the first failed constraint.
 */
function pledgeFailsConstraint(
    pledge: PledgeEnvelope,
    constraints: Record<string, string>,
): string | null {
    if ('max_bond_sats' in constraints) {
        const max = Number.parseInt(constraints['max_bond_sats']!, 10);
        if (!Number.isFinite(max)) {
            return `delegation max_bond_sats="${constraints['max_bond_sats']}" is not a valid integer`;
        }
        // Pledge's bond.min_sats is the floor it commits to; the delegation
        // permits up to max_bond_sats. A pledge with min_sats > max_bond_sats
        // exceeds the delegation's authorisation.
        if (pledge.bond.min_sats > max) {
            return `pledge.bond.min_sats (${pledge.bond.min_sats}) exceeds delegation's max_bond_sats (${max})`;
        }
    }
    if ('mechanism' in constraints) {
        if (pledge.resolution.mechanism !== constraints['mechanism']) {
            return `pledge.resolution.mechanism="${pledge.resolution.mechanism}" does not match delegation's mechanism="${constraints['mechanism']}"`;
        }
    }
    if ('counterparty' in constraints) {
        const want = constraints['counterparty'];
        if (pledge.counterparty !== want) {
            return `pledge.counterparty=${pledge.counterparty === null ? 'null' : `"${pledge.counterparty}"`} does not match delegation's counterparty="${want}"`;
        }
    }
    return null;
}

/**
 * Compare two strict ISO 8601 UTC timestamps (YYYY-MM-DDTHH:MM:SSZ).
 * Returns true iff `a` is strictly later than `b`. Lexicographic compare
 * works because the format is fixed-width.
 */
export function isoUtcGreaterThan(a: string, b: string): boolean {
    return a > b;
}
