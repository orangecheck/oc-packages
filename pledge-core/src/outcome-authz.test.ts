// SPEC §1 (Resolver) + SECURITY §6: only the party the pledge names may
// resolve it. Before this gate, verifyOutcome checked that `sig.pubkey ===
// resolved_by` — self-consistency, which a forger satisfies by naming their own
// address and signing with their own key — and never compared the resolver to
// the pledge. Both shapes below were proven to verify clean against the
// published core and classify a stranger's pledge as `broken`.
import { describe, expect, it } from 'vitest';

import { computeOutcomeId, computePledgeId } from './canonical.js';
import { verifyOutcome } from './outcome.js';
import type { OutcomeEnvelope, PledgeCanonicalInput } from './types.js';

const COUNTERPARTY = 'bc1qcounter0000000000000000000000000000000';
const MALLORY = 'bc1qmallory0000000000000000000000000000000';

const bilateral: PledgeCanonicalInput = {
    swearer: 'bc1qcarol000000000000000000000000000000000',
    proposition: 'I will deliver 99.9 percent uptime.',
    resolution: {
        mechanism: 'counterparty_signs',
        query: `counterparty(${COUNTERPARTY}) signs outcome over pledge_id`,
    },
    resolves_at: { time: '2026-06-01T00:00:00Z' },
    expires_at: '2026-06-15T00:00:00Z',
    bond: { attestation_id: '3'.repeat(64), min_sats: 2_500_000, min_days: 365 },
    counterparty: COUNTERPARTY,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-04-20T09:00:00Z',
    nonce: 'fedcba9876543210fedcba9876543210',
} as unknown as PledgeCanonicalInput;

const deterministic: PledgeCanonicalInput = {
    ...bilateral,
    counterparty: null,
    resolution: { mechanism: 'chain_state', query: 'block(900000).exists' },
} as unknown as PledgeCanonicalInput;

function outcome(
    pledge: PledgeCanonicalInput,
    resolved_by: string,
    sig: OutcomeEnvelope['sig'],
): OutcomeEnvelope {
    const inputs = {
        pledge_id: computePledgeId(pledge),
        outcome: 'broken' as const,
        resolved_at: '2026-06-02T00:00:00Z',
        resolved_by,
        evidence: {
            mechanism: pledge.resolution.mechanism,
            result: 'broken',
            witness: 'asserted',
        },
        dispute_window_ends_at: '2026-06-09T00:00:00Z',
    };
    return {
        v: 1,
        kind: 'pledge-outcome',
        ...inputs,
        id: computeOutcomeId(inputs),
        sig,
    } as unknown as OutcomeEnvelope;
}

describe('verifyOutcome refuses a resolver the pledge did not name', () => {
    it('rejects a stranger who names themselves and self-signs', async () => {
        const env = outcome(bilateral, MALLORY, {
            alg: 'bip322',
            pubkey: MALLORY,
            value: 'AkcwRAIg',
        } as OutcomeEnvelope['sig']);
        const r = await verifyOutcome({
            envelope: env,
            pledge: bilateral,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_RESOLVER_UNAUTHORIZED');
    });

    // The worse shape: no signature is required at all, so before the gate this
    // needed no key material of any kind.
    it('rejects an UNSIGNED "deterministic" outcome on a counterparty_signs pledge', async () => {
        const env = outcome(bilateral, 'deterministic', null);
        const r = await verifyOutcome({
            envelope: env,
            pledge: bilateral,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_RESOLVER_UNAUTHORIZED');
    });

    it('rejects an address-signed outcome on a deterministic pledge', async () => {
        const env = outcome(deterministic, MALLORY, {
            alg: 'bip322',
            pubkey: MALLORY,
            value: 'AkcwRAIg',
        } as OutcomeEnvelope['sig']);
        const r = await verifyOutcome({
            envelope: env,
            pledge: deterministic,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_RESOLVER_UNAUTHORIZED');
    });

    // Binding #2: the outcome must name THIS pledge. Recomputed, not trusted.
    it('rejects an outcome whose pledge_id is for a different pledge', async () => {
        const env = outcome(deterministic, 'deterministic', null);
        const r = await verifyOutcome({
            envelope: env,
            pledge: bilateral,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_RESOLVER_UNAUTHORIZED');
    });

    it('still ACCEPTS the counterparty the pledge actually named', async () => {
        const env = outcome(bilateral, COUNTERPARTY, {
            alg: 'bip322',
            pubkey: COUNTERPARTY,
            value: 'AkcwRAIg',
        } as OutcomeEnvelope['sig']);
        const r = await verifyOutcome({
            envelope: env,
            pledge: bilateral,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(true);
    });

    it('still ACCEPTS a deterministic outcome on a deterministic pledge', async () => {
        const env = outcome(deterministic, 'deterministic', null);
        const r = await verifyOutcome({
            envelope: env,
            pledge: deterministic,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(true);
    });
});

describe('verifyOutcome fails closed on a missing pledge', () => {
    // The guard that matters most. A caller who supplies neither the pledge nor
    // an explicit skip previously got a verified-looking result over an
    // envelope whose authority had never been checked — which is how the
    // forgeries above passed. Skipping has to be stated.
    it('refuses when given neither a pledge nor an explicit skip', async () => {
        const env = outcome(bilateral, COUNTERPARTY, {
            alg: 'bip322',
            pubkey: COUNTERPARTY,
            value: 'AkcwRAIg',
        } as OutcomeEnvelope['sig']);
        const r = await verifyOutcome({ envelope: env, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_RESOLVER_UNAUTHORIZED');
        expect(r.ok === false && r.message).toMatch(/requires the pledge/i);
    });

    it('allows the isolation case ONLY when stated explicitly', async () => {
        const env = outcome(bilateral, COUNTERPARTY, {
            alg: 'bip322',
            pubkey: COUNTERPARTY,
            value: 'AkcwRAIg',
        } as OutcomeEnvelope['sig']);
        const r = await verifyOutcome({
            envelope: env,
            skipSignatureVerification: true,
            skipResolverAuthorization: true,
        });
        expect(r.ok).toBe(true);
    });
});
