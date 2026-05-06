import { describe, expect, it } from 'vitest';

import { verifyBond } from './bond.js';
import {
    ENVELOPE_VERSION,
    type AttestationLookup,
    type AttestationLookupResult,
    type PledgeEnvelope,
} from './types.js';

function pledge(opts: {
    swearer?: string;
    attestation_id?: string;
    min_sats?: number;
    min_days?: number;
} = {}): PledgeEnvelope {
    const swearer = opts.swearer ?? 'bc1qalice';
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id: 'a'.repeat(64),
        swearer: { address: swearer, alg: 'bip322' },
        proposition: 'p',
        resolution: { mechanism: 'chain_state', query: 'q' },
        resolves_at: { block: 1 },
        expires_at: '2099-01-01T00:00:00Z',
        bond: {
            attestation_id: opts.attestation_id ?? '0'.repeat(64),
            min_sats: opts.min_sats ?? 100000,
            min_days: opts.min_days ?? 30,
        },
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded',
        sworn_at: '2026-04-24T18:30:00Z',
        nonce: '0'.repeat(32),
        sig: { alg: 'bip322', pubkey: swearer, value: 'AAAA' },
    };
}

function lookup(result: AttestationLookupResult | null): AttestationLookup {
    return async () => result;
}

describe('verifyBond', () => {
    it('OK — sats >= min_sats AND days >= min_days AND not spent', async () => {
        const r = await verifyBond({
            pledge: pledge({ min_sats: 100, min_days: 10 }),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qalice',
                sats_bonded: 200,
                days_unspent: 30,
                utxo_spent_at_or_before_now: false,
            }),
        });
        expect(r.ok).toBe(true);
    });

    it('E_BOND_NOT_FOUND when lookup returns null', async () => {
        const r = await verifyBond({
            pledge: pledge(),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup(null),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_NOT_FOUND');
    });

    it('E_BOND_ADDRESS_MISMATCH when attestation.address != swearer.address', async () => {
        const r = await verifyBond({
            pledge: pledge({ swearer: 'bc1qalice' }),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qbob',
                sats_bonded: 200,
                days_unspent: 30,
                utxo_spent_at_or_before_now: false,
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_ADDRESS_MISMATCH');
    });

    it('E_BOND_SPENT when utxo spent', async () => {
        const r = await verifyBond({
            pledge: pledge(),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qalice',
                sats_bonded: 0,
                days_unspent: 0,
                utxo_spent_at_or_before_now: true,
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_SPENT');
    });

    it('E_BOND_INSUFFICIENT_SATS when sats_bonded < min_sats', async () => {
        const r = await verifyBond({
            pledge: pledge({ min_sats: 1000, min_days: 10 }),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qalice',
                sats_bonded: 500,
                days_unspent: 30,
                utxo_spent_at_or_before_now: false,
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_INSUFFICIENT_SATS');
    });

    it('E_BOND_INSUFFICIENT_DAYS when days_unspent < min_days', async () => {
        const r = await verifyBond({
            pledge: pledge({ min_sats: 100, min_days: 100 }),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qalice',
                sats_bonded: 1000,
                days_unspent: 50,
                utxo_spent_at_or_before_now: false,
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_INSUFFICIENT_DAYS');
    });

    it('SPENT check fires before INSUFFICIENT_* (priority order from §8)', async () => {
        const r = await verifyBond({
            pledge: pledge({ min_sats: 1000000, min_days: 1000 }),
            now: '2026-12-31T00:00:00Z',
            lookup: lookup({
                address: 'bc1qalice',
                sats_bonded: 0,
                days_unspent: 0,
                utxo_spent_at_or_before_now: true,
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BOND_SPENT');
    });
});
