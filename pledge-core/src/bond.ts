// Bond verification — SPEC §8.
//
// The SDK ships the algorithm; the chain accessor is injected by the caller.
// This is the same shape as @orangecheck/stamp-core's verifyOtsAnchor: the
// SDK can't bundle a Bitcoin RPC client without imposing an opinion on every
// consumer (browser vs Node vs CLI vs mobile).

import type {
    PledgeEnvelope,
    VerifyBondInput,
    VerifyBondResult,
} from './types.js';

/**
 * Run §8 verifyBond against a caller-supplied attestation lookup.
 *
 * Returns:
 *   { ok: true, sats_bonded, days_unspent } when the bond clears all gates.
 *
 *   { ok: false, code, message } with one of:
 *     - E_BOND_NOT_FOUND          attestation lookup returned null
 *     - E_BOND_ADDRESS_MISMATCH   attestation.address != pledge.swearer
 *     - E_BOND_SPENT              utxo spent at or before `now`
 *     - E_BOND_INSUFFICIENT_SATS  sats_bonded < pledge.bond.min_sats
 *     - E_BOND_INSUFFICIENT_DAYS  days_unspent < pledge.bond.min_days
 *
 * Note that bond verification is a *live* check — the result depends on
 * chain state at `now`, not at the moment the pledge was sworn. SPEC §8
 * mandates this for any consequential decision.
 */
export async function verifyBond(input: VerifyBondInput): Promise<VerifyBondResult> {
    const { pledge, now, lookup } = input;

    const attestation = await lookup(pledge.bond.attestation_id, now);
    if (attestation === null) {
        return {
            ok: false,
            code: 'E_BOND_NOT_FOUND',
            message: `attestation ${pledge.bond.attestation_id} not found`,
        };
    }

    if (attestation.address !== pledge.swearer.address) {
        return {
            ok: false,
            code: 'E_BOND_ADDRESS_MISMATCH',
            message: `attestation.address (${attestation.address}) != pledge.swearer.address (${pledge.swearer.address})`,
        };
    }

    if (attestation.utxo_spent_at_or_before_now) {
        return {
            ok: false,
            code: 'E_BOND_SPENT',
            message: 'bonded UTXO spent at or before verifier now',
        };
    }

    if (attestation.sats_bonded < pledge.bond.min_sats) {
        return {
            ok: false,
            code: 'E_BOND_INSUFFICIENT_SATS',
            message: `sats_bonded (${attestation.sats_bonded}) < min_sats (${pledge.bond.min_sats})`,
        };
    }

    if (attestation.days_unspent < pledge.bond.min_days) {
        return {
            ok: false,
            code: 'E_BOND_INSUFFICIENT_DAYS',
            message: `days_unspent (${attestation.days_unspent}) < min_days (${pledge.bond.min_days})`,
        };
    }

    return {
        ok: true,
        sats_bonded: attestation.sats_bonded,
        days_unspent: attestation.days_unspent,
    };
}

/**
 * Convenience: pull the bond constraints out of a pledge envelope as a flat
 * { min_sats, min_days, attestation_id } record. Equivalent to reading
 * `pledge.bond` directly; exported for callers that want the explicit shape.
 */
export function bondConstraints(pledge: PledgeEnvelope): {
    attestation_id: string;
    min_sats: number;
    min_days: number;
} {
    return {
        attestation_id: pledge.bond.attestation_id,
        min_sats: pledge.bond.min_sats,
        min_days: pledge.bond.min_days,
    };
}
