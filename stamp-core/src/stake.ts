// SPEC §8.1 step 7. `stake` is outside the canonical message, so anyone who relays an
// envelope can strip, add or swap it. The check uses the attestation as resolved now,
// and only counts it if the signer's own address signed it.

import type { StampEnvelope } from './types.js';

/** An attestation resolved against current chain state, e.g. attest.ochk.io `/api/check?id=` JSON. */
export interface ResolvedAttestation {
    attestation_id: string;
    /** The address that signed the attestation. */
    address: string;
    /** Sats bonded now. */
    sats: number;
    /** Days the bond has been unspent now. */
    days: number;
}

export interface StakePolicy {
    minSats: number;
    minDays: number;
}

export type StakeCheck = { ok: true } | { ok: false; code: 'E_STAKE_UNMET'; message: string };

const unmet = (message: string): StakeCheck => ({ ok: false, code: 'E_STAKE_UNMET', message });

// bech32 addresses are case-insensitive; base58 ones are not.
const normAddress = (a: string) => (/^bc1/i.test(a) ? a.toLowerCase() : a);

/**
 * Check an envelope's stake against a policy. Pass the attestation as resolved now,
 * or null if it did not resolve. The declared `sats_bonded` / `days_unspent` are ignored.
 */
export function checkStake(
    envelope: StampEnvelope,
    attestation: ResolvedAttestation | null | undefined,
    policy: StakePolicy
): StakeCheck {
    const stake = envelope.stake;
    if (!stake) return unmet('the stamp declares no stake');
    if (!attestation) return unmet(`attestation ${stake.attestation_id} did not resolve`);
    if (attestation.attestation_id !== stake.attestation_id) {
        return unmet(`resolved attestation ${attestation.attestation_id}, not ${stake.attestation_id}`);
    }
    if (typeof attestation.address !== 'string' || normAddress(attestation.address) !== normAddress(envelope.signer.address)) {
        return unmet(`attestation belongs to ${attestation.address}, not the signer ${envelope.signer.address}`);
    }
    if (!(attestation.sats >= policy.minSats)) {
        return unmet(`${attestation.sats} sats bonded, policy needs ${policy.minSats}`);
    }
    if (!(attestation.days >= policy.minDays)) {
        return unmet(`${attestation.days} days unspent, policy needs ${policy.minDays}`);
    }
    return { ok: true };
}
