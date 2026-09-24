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
//   pledge:create(max_bond_sats<=<N>)
//   pledge:create(mechanism=<m>)
//   pledge:create(counterparty=<addr>)
//   pledge:create(max_bond_sats<=<N>,mechanism=<m>)
//   pledge:create(max_bond_sats<=<N>,mechanism=<m>,counterparty=<addr>)
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

const PLEDGE_CREATE_KEYS = new Set(['max_bond_sats', 'mechanism', 'counterparty']);
const CONSTRAINT_RE = /^([a-z][a-z0-9_]*)\s*(<=|=)\s*(.+)$/;

/**
 * Parse a single scope string. Returns the constraint map iff the scope's
 * product:verb is `pledge:create`; null for any other scope (caller skips
 * those) and for a malformed one, which is treated as non-matching rather
 * than surfacing a parse error.
 *
 * `max_bond_sats` is a ceiling. SPEC §7.3 writes it `max_bond_sats<=N` (OC
 * Agent's range operator); the earlier `max_bond_sats=N` form means the same
 * thing here and stays accepted so existing delegations keep verifying. Every
 * other key takes `=` only.
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
        const c = CONSTRAINT_RE.exec(pair.trim());
        if (!c) return null; // malformed or an unsupported operator
        const [, key, op, raw] = c as unknown as [string, string, string, string];
        if (op === '<=' && key !== 'max_bond_sats') return null;
        if (key in out) return null; // duplicate key
        out[key] = unquote(raw.trim());
    }
    return out;
}

function unquote(v: string): string {
    return v.length >= 2 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}

/**
 * Returns null if the pledge satisfies every constraint; otherwise a
 * human-readable reason naming the first failed constraint.
 */
function pledgeFailsConstraint(
    pledge: PledgeEnvelope,
    constraints: Record<string, string>,
): string | null {
    // A constraint this verifier does not understand cannot be shown to hold.
    for (const key of Object.keys(constraints)) {
        if (!PLEDGE_CREATE_KEYS.has(key)) {
            return `delegation constraint "${key}" is not a pledge:create constraint`;
        }
    }
    if ('max_bond_sats' in constraints) {
        const raw = constraints['max_bond_sats']!;
        const max = /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!Number.isSafeInteger(max)) {
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
        // REGISTRY.md: `counterparty=null` restricts the agent to pledges with none.
        const want = constraints['counterparty'] === 'null' ? null : constraints['counterparty'];
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
