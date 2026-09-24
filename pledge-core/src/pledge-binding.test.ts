// SPEC §5.3, §4.3, §4.4, §11.4: abandonments and outcomes count only for the
// pledge they name, from the party that pledge authorises, at a time the pledge
// allows.
import { describe, expect, it } from 'vitest';

import { verifyAbandonment } from './abandonment.js';
import { computeAbandonmentId, computeOutcomeId, computePledgeId } from './canonical.js';
import { verifyOutcome } from './outcome.js';
import { classifyState } from './state.js';
import {
    ENVELOPE_VERSION,
    type AbandonmentEnvelope,
    type OutcomeEnvelope,
    type PledgeCanonicalInput,
    type PledgeEnvelope,
} from './types.js';

const SWEARER = 'bc1qswearer00000000000000000000000000000000';
const OTHER = 'bc1qother0000000000000000000000000000000000';
const COUNTERPARTY = 'bc1qcounter0000000000000000000000000000000';

const base: PledgeCanonicalInput = {
    swearer: SWEARER,
    proposition: 'Block 900000 will be mined.',
    resolution: { mechanism: 'chain_state', query: 'block(900000).exists' },
    resolves_at: { time: '2026-06-01T00:00:00Z' },
    expires_at: '2026-06-15T00:00:00Z',
    bond: { attestation_id: '3'.repeat(64), min_sats: 1_000, min_days: 1 },
    counterparty: null,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-04-20T09:00:00Z',
    nonce: 'fedcba9876543210fedcba9876543210',
} as unknown as PledgeCanonicalInput;

const bilateral: PledgeCanonicalInput = {
    ...base,
    counterparty: COUNTERPARTY,
    resolution: {
        mechanism: 'counterparty_signs',
        query: `counterparty(${COUNTERPARTY}) signs outcome over pledge_id`,
    },
} as unknown as PledgeCanonicalInput;

function abandonment(
    pledge: PledgeCanonicalInput,
    opts: { pubkey?: string; abandoned_at?: string; pledge_id?: string } = {},
): AbandonmentEnvelope {
    const canon = {
        pledge_id: opts.pledge_id ?? computePledgeId(pledge),
        abandoned_at: opts.abandoned_at ?? '2026-05-01T00:00:00Z',
        reason: 'cannot deliver',
    };
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-abandonment',
        id: computeAbandonmentId(canon),
        ...canon,
        sig: { alg: 'bip322', pubkey: opts.pubkey ?? pledge.swearer, value: 'AAAA' },
    };
}

function outcome(
    pledge: PledgeCanonicalInput,
    opts: {
        outcome?: OutcomeEnvelope['outcome'];
        resolved_at?: string;
        resolved_by?: string;
        mechanism?: string;
        pledge_id?: string;
    } = {},
): OutcomeEnvelope {
    const resolved_by = opts.resolved_by ?? 'deterministic';
    const canon = {
        pledge_id: opts.pledge_id ?? computePledgeId(pledge),
        outcome: opts.outcome ?? 'kept',
        resolved_at: opts.resolved_at ?? '2026-06-02T00:00:00Z',
        resolved_by,
        evidence: {
            mechanism: opts.mechanism ?? pledge.resolution.mechanism,
            result: 'true',
            witness: 'chain_height=900000 chain_hash=' + '0'.repeat(64),
        },
        dispute_window_ends_at: '2026-06-20T00:00:00Z',
    };
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-outcome',
        id: computeOutcomeId(canon as Parameters<typeof computeOutcomeId>[0]),
        ...canon,
        sig:
            resolved_by === 'deterministic'
                ? null
                : { alg: 'bip322', pubkey: resolved_by, value: 'AAAA' },
    } as OutcomeEnvelope;
}

function envelopeOf(pledge: PledgeCanonicalInput): PledgeEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id: computePledgeId(pledge),
        swearer: { address: pledge.swearer, alg: 'bip322' },
        proposition: pledge.proposition,
        resolution: pledge.resolution,
        resolves_at: pledge.resolves_at,
        expires_at: pledge.expires_at,
        bond: pledge.bond,
        counterparty: pledge.counterparty,
        dispute: pledge.dispute,
        remediation: pledge.remediation,
        sworn_at: pledge.sworn_at,
        nonce: pledge.nonce,
        sig: { alg: 'bip322', pubkey: pledge.swearer, value: 'AAAA' },
    };
}

describe('verifyAbandonment binds to the pledge (SPEC §5.3)', () => {
    it('requires the pledge or an explicit skipPledgeBinding', async () => {
        const r = await verifyAbandonment({
            envelope: abandonment(base),
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_ABANDONMENT_BAD_SIG');
    });

    it('accepts the swearer abandoning their own pledge', async () => {
        const r = await verifyAbandonment({
            envelope: abandonment(base),
            pledge: base,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(true);
    });

    it('rejects an abandonment signed by an address other than the swearer', async () => {
        const r = await verifyAbandonment({
            envelope: abandonment(base, { pubkey: OTHER }),
            pledge: base,
            verifyBip322: async () => true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_ABANDONMENT_BAD_SIG');
    });

    it('rejects an abandonment that names a different pledge', async () => {
        const r = await verifyAbandonment({
            envelope: abandonment(base, { pledge_id: 'e'.repeat(64) }),
            pledge: base,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_ABANDONMENT_MALFORMED');
    });

    it('rejects abandoned_at earlier than sworn_at', async () => {
        const r = await verifyAbandonment({
            envelope: abandonment(base, { abandoned_at: '2026-04-20T08:59:59Z' }),
            pledge: base,
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_ABANDONMENT_MALFORMED');
    });

    it('verifies the signature under the swearer address', async () => {
        const seen: string[] = [];
        const r = await verifyAbandonment({
            envelope: abandonment(base),
            pledge: base,
            verifyBip322: async (_m, _s, addr) => {
                seen.push(addr);
                return true;
            },
        });
        expect(r.ok).toBe(true);
        expect(seen).toEqual([SWEARER]);
    });
});

describe('verifyOutcome: deterministic outcomes are bound claims (SPEC §4.3, §11.4)', () => {
    it('accepts a well-formed deterministic outcome and marks it for recomputation', async () => {
        const r = await verifyOutcome({ envelope: outcome(base), pledge: base });
        expect(r.ok).toBe(true);
        expect(r.ok && r.recomputeRequired).toBe(true);
    });

    it('rejects evidence for a mechanism the pledge does not use', async () => {
        const r = await verifyOutcome({
            envelope: outcome(base, { mechanism: 'dns_record' }),
            pledge: base,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_EVIDENCE_MISMATCH');
    });

    it('rejects a deterministic outcome dated before resolves_at', async () => {
        const r = await verifyOutcome({
            envelope: outcome(base, { resolved_at: '2026-05-31T23:59:59Z' }),
            pledge: base,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_MALFORMED');
    });

    it('rejects expired_unresolved dated before expires_at', async () => {
        const r = await verifyOutcome({
            envelope: outcome(base, {
                outcome: 'expired_unresolved',
                resolved_at: '2026-06-10T00:00:00Z',
            }),
            pledge: base,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_OUTCOME_MALFORMED');
    });

    it('a counterparty-signed outcome does not require recomputation', async () => {
        const r = await verifyOutcome({
            envelope: outcome(bilateral, { resolved_by: COUNTERPARTY }),
            pledge: bilateral,
            verifyBip322: async () => true,
        });
        expect(r.ok).toBe(true);
        expect(r.ok && r.recomputeRequired).toBe(false);
    });
});

describe('classifyState counts only envelopes about this pledge (SPEC §4.4, §5.3)', () => {
    const pledge = envelopeOf(base);
    const now = '2026-06-05T00:00:00Z';

    it('ignores an outcome that names a different pledge', () => {
        const s = classifyState({
            pledge,
            outcome: outcome(base, { outcome: 'broken', pledge_id: 'e'.repeat(64) }),
            abandonment: null,
            now,
        });
        expect(s).toBe('resolvable');
    });

    it('ignores an abandonment that names a different pledge', () => {
        const s = classifyState({
            pledge,
            outcome: null,
            abandonment: abandonment(base, { pledge_id: 'e'.repeat(64) }),
            now,
        });
        expect(s).toBe('resolvable');
    });

    it('ignores an abandonment not signed by the swearer', () => {
        const s = classifyState({
            pledge,
            outcome: null,
            abandonment: abandonment(base, { pubkey: OTHER }),
            now,
        });
        expect(s).toBe('resolvable');
    });

    it('ignores a contradictory outcome about a different pledge', () => {
        const s = classifyState({
            pledge,
            outcome: outcome(base, { outcome: 'kept' }),
            abandonment: null,
            now,
            contradictoryOutcomes: [
                outcome(base, { outcome: 'broken', pledge_id: 'e'.repeat(64) }),
            ],
        });
        expect(s).toBe('kept');
    });

    it('still classifies the swearer abandoning this pledge as broken', () => {
        const s = classifyState({ pledge, outcome: null, abandonment: abandonment(base), now });
        expect(s).toBe('broken');
    });
});
