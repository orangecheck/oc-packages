import { describe, expect, it, vi } from 'vitest';

import { createOutcome, outcomeRequiresSignature, verifyOutcome } from './outcome.js';
import { PledgeError } from './pledge.js';
import {
    ENVELOPE_VERSION,
    type Bip322Signer,
    type OutcomeEnvelope,
} from './types.js';

function fakeSigner(address: string): Bip322Signer {
    return { address, signMessage: vi.fn(async () => 'AAAA') };
}

const deterministicInput = {
    pledge_id: 'a'.repeat(64),
    outcome: 'kept' as const,
    resolved_at: '2026-12-15T12:00:00Z',
    resolved_by: 'deterministic',
    evidence: { mechanism: 'chain_state' as const, result: 'true', witness: 'witness' },
    dispute_window_ends_at: '2026-12-22T12:00:00Z',
};

const counterpartyInput = {
    pledge_id: 'a'.repeat(64),
    outcome: 'kept' as const,
    resolved_at: '2026-06-02T10:00:00Z',
    resolved_by: 'bc1qcounter000',
    evidence: {
        mechanism: 'counterparty_signs' as const,
        result: 'kept',
        witness: 'counterparty_sig=AAAA',
    },
    dispute_window_ends_at: '2026-06-09T10:00:00Z',
};

describe('outcomeRequiresSignature', () => {
    it('returns false for resolved_by="deterministic"', () => {
        expect(outcomeRequiresSignature({ resolved_by: 'deterministic' })).toBe(false);
    });

    it('returns true for any non-deterministic resolved_by', () => {
        expect(outcomeRequiresSignature({ resolved_by: 'bc1qsomeone' })).toBe(true);
    });
});

describe('createOutcome', () => {
    it('builds a deterministic outcome with sig=null', async () => {
        const env = await createOutcome(deterministicInput);
        expect(env.kind).toBe('pledge-outcome');
        expect(env.v).toBe(ENVELOPE_VERSION);
        expect(env.sig).toBeNull();
        expect(env.id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('builds a counterparty-signed outcome with sig populated', async () => {
        const signer = fakeSigner('bc1qcounter000');
        const env = await createOutcome({ ...counterpartyInput, signer });
        expect(env.sig).not.toBeNull();
        if (env.sig) {
            expect(env.sig.pubkey).toBe('bc1qcounter000');
            expect(env.sig.alg).toBe('bip322');
        }
        expect(signer.signMessage).toHaveBeenCalledWith(env.id);
    });

    it('rejects when resolved_by is non-deterministic but no signer supplied', async () => {
        await expect(createOutcome(counterpartyInput)).rejects.toBeInstanceOf(PledgeError);
    });

    it('rejects when signer.address != resolved_by', async () => {
        await expect(
            createOutcome({
                ...counterpartyInput,
                signer: fakeSigner('bc1qstranger'),
            }),
        ).rejects.toBeInstanceOf(PledgeError);
    });
});

describe('verifyOutcome', () => {
    it('accepts a deterministic outcome (sig=null)', async () => {
        const env = await createOutcome(deterministicInput);
        const r = await verifyOutcome({ envelope: env });
        expect(r.ok).toBe(true);
    });

    it('accepts a counterparty-signed outcome with verifyBip322=true', async () => {
        const signer = fakeSigner('bc1qcounter000');
        const env = await createOutcome({ ...counterpartyInput, signer });
        const r = await verifyOutcome({
            envelope: env,
            verifyBip322: async () => true,
        });
        expect(r.ok).toBe(true);
    });

    it('detects E_OUTCOME_BAD_ID on tampered envelope', async () => {
        const env = await createOutcome(deterministicInput);
        const tampered: OutcomeEnvelope = { ...env, outcome: 'broken' };
        const r = await verifyOutcome({ envelope: tampered });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_OUTCOME_BAD_ID');
    });

    it('detects E_OUTCOME_MALFORMED when deterministic outcome has a sig', async () => {
        const env = await createOutcome(deterministicInput);
        const tampered: OutcomeEnvelope = {
            ...env,
            sig: { alg: 'bip322', pubkey: 'bc1qsomeone', value: 'AAAA' },
        };
        const r = await verifyOutcome({ envelope: tampered });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_OUTCOME_MALFORMED');
    });

    it('detects E_OUTCOME_BAD_SIG when counterparty outcome lacks sig', async () => {
        const signer = fakeSigner('bc1qcounter000');
        const env = await createOutcome({ ...counterpartyInput, signer });
        const tampered: OutcomeEnvelope = { ...env, sig: null };
        const r = await verifyOutcome({ envelope: tampered });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_OUTCOME_BAD_SIG');
    });
});
