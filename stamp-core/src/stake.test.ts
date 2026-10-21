import { describe, expect, it } from 'vitest';

import { checkStake } from './stake.js';
import type { StampEnvelope } from './types.js';

const SIGNER = 'bc1qcreator00000000000000000000000000000000';
const ATT = '9e3f4a2b1c0d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f';
const policy = { minSats: 100_000, minDays: 30 };

function envelope(stake: StampEnvelope['stake']): StampEnvelope {
    return { signer: { address: SIGNER, alg: 'bip322' }, stake } as StampEnvelope;
}
const own = { attestation_id: ATT, address: SIGNER, sats: 250_000, days: 95 };
const declared = { attestation_id: ATT, sats_bonded: 500_000, days_unspent: 180 };

describe('checkStake (SPEC §8.1 step 7)', () => {
    it("accepts the signer's own attestation that meets the policy now", () => {
        expect(checkStake(envelope(declared), own, policy)).toEqual({ ok: true });
    });

    it('rejects an attestation signed by another address, whatever its bond', () => {
        const r = checkStake(envelope(declared), { ...own, address: 'bc1qsomeoneelse000000000000000000000000000', sats: 9e9 }, policy);
        expect(r).toMatchObject({ ok: false, code: 'E_STAKE_UNMET' });
        if (!r.ok) expect(r.message).toMatch(/not the signer/);
    });

    it('judges the resolved values, not the declared ones', () => {
        expect(checkStake(envelope({ ...declared, sats_bonded: 9e9 }), { ...own, sats: 50_000 }, policy).ok).toBe(false);
        expect(checkStake(envelope(declared), { ...own, days: 29 }, policy).ok).toBe(false);
    });

    it('rejects a stripped stake, an unresolved one, and a different attestation', () => {
        expect(checkStake(envelope(null), own, policy).ok).toBe(false);
        expect(checkStake(envelope(declared), null, policy).ok).toBe(false);
        expect(checkStake(envelope(declared), { ...own, attestation_id: 'ab'.repeat(32) }, policy).ok).toBe(false);
    });

    it('compares bech32 addresses without case', () => {
        expect(checkStake(envelope(declared), { ...own, address: SIGNER.toUpperCase() }, policy)).toEqual({ ok: true });
    });
});
