// Weight modes per SPEC §5.
//
// Given a voter's qualifying UTXOs at a snapshot block height, compute their
// contribution weight for the tally. `qualifying` means `age_days ≥ min_days`;
// weight is zero if the sum of qualifying sats is below `min_sats`.

import type { Utxo, WeightMode, WeightParams } from './types.js';

/**
 * Age of a UTXO in days at snapshot block, per SPEC §7.3.
 *   age_days(u, H) = max(0, floor((H - u.confirmed_height) * 600 / 86400))
 */
export function ageDays(u: Utxo, snapshot: number): number {
    const blocks = snapshot - u.confirmed_height;
    if (blocks < 0) return 0;
    return Math.floor((blocks * 600) / 86400);
}

export function qualifyingUtxos(
    utxos: Utxo[],
    snapshot: number,
    minDays: number
): Utxo[] {
    return utxos.filter((u) => ageDays(u, snapshot) >= minDays);
}

export function totalQualifyingSats(
    utxos: Utxo[],
    snapshot: number,
    minDays: number
): number {
    return qualifyingUtxos(utxos, snapshot, minDays).reduce(
        (s, u) => s + u.value,
        0
    );
}

export interface VoterWeightInput {
    utxos: Utxo[];
    snapshot: number;
    minSats: number;
    minDays: number;
    mode: WeightMode;
    params: WeightParams | null;
}

/**
 * Voter weight per SPEC §5. Returns 0 if threshold not met or mode unsupported.
 * Unknown modes throw — callers should check support before tallying.
 */
export function voterWeight(input: VoterWeightInput): number {
    const { utxos, snapshot, minSats, minDays, mode, params } = input;
    const qualifying = qualifyingUtxos(utxos, snapshot, minDays);
    const totalSats = qualifying.reduce((s, u) => s + u.value, 0);
    if (totalSats < minSats) return 0;

    switch (mode) {
        case 'one_per_address':
            return 1;
        case 'sats':
            return totalSats;
        case 'sats_days': {
            const cap = params?.cap_days;
            if (typeof cap !== 'number' || cap <= 0) {
                throw new Error(
                    'sats_days weight mode requires weight_params.cap_days (positive integer)'
                );
            }
            return qualifying.reduce(
                (s, u) => s + u.value * Math.min(ageDays(u, snapshot), cap),
                0
            );
        }
        default:
            throw new Error(`unsupported weight_mode: ${mode}`);
    }
}

export function isSupportedMode(mode: WeightMode): boolean {
    return mode === 'one_per_address' || mode === 'sats' || mode === 'sats_days';
}
