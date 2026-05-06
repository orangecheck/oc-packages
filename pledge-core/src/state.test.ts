import { describe, expect, it } from 'vitest';

import { classifyState, outcomesContradict } from './state.js';
import {
    ENVELOPE_VERSION,
    type AbandonmentEnvelope,
    type OutcomeEnvelope,
    type PledgeEnvelope,
} from './types.js';

function pledge(opts: Partial<PledgeEnvelope> = {}): PledgeEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id: 'a'.repeat(64),
        swearer: { address: 'bc1qalice', alg: 'bip322' },
        proposition: 'p',
        resolution: { mechanism: 'chain_state', query: 'q' },
        resolves_at: { time: '2026-09-01T00:00:00Z' },
        expires_at: '2026-12-31T00:00:00Z',
        bond: { attestation_id: '0'.repeat(64), min_sats: 0, min_days: 0 },
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded',
        sworn_at: '2026-04-24T18:30:00Z',
        nonce: '0'.repeat(32),
        sig: { alg: 'bip322', pubkey: 'bc1qalice', value: 'AAAA' },
        ...opts,
    };
}

function outcome(opts: Partial<OutcomeEnvelope> = {}): OutcomeEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-outcome',
        id: 'b'.repeat(64),
        pledge_id: 'a'.repeat(64),
        outcome: 'kept',
        resolved_at: '2026-09-01T00:00:00Z',
        resolved_by: 'deterministic',
        evidence: { mechanism: 'chain_state', result: 'true', witness: 'w' },
        dispute_window_ends_at: '2026-09-08T00:00:00Z',
        sig: null,
        ...opts,
    };
}

function abandonment(): AbandonmentEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-abandonment',
        id: 'c'.repeat(64),
        pledge_id: 'a'.repeat(64),
        abandoned_at: '2026-08-01T12:00:00Z',
        reason: 'r',
        sig: { alg: 'bip322', pubkey: 'bc1qalice', value: 'AAAA' },
    };
}

describe('classifyState', () => {
    it('pending — before resolves_at', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: null,
            abandonment: null,
            now: '2026-04-25T00:00:00Z',
        });
        expect(r).toBe('pending');
    });

    it('resolvable — past resolves_at, before expires_at, no outcome', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: null,
            abandonment: null,
            now: '2026-09-15T00:00:00Z',
        });
        expect(r).toBe('resolvable');
    });

    it('expired_unresolved — past expires_at, no outcome / abandonment', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: null,
            abandonment: null,
            now: '2027-01-01T00:00:00Z',
        });
        expect(r).toBe('expired_unresolved');
    });

    it('outcome.outcome is returned when no contradictory outcomes', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: outcome({ outcome: 'kept' }),
            abandonment: null,
            now: '2027-01-01T00:00:00Z',
        });
        expect(r).toBe('kept');
    });

    it('disputed — when contradictoryOutcomes contains a different verdict', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: outcome({ outcome: 'kept' }),
            abandonment: null,
            now: '2027-01-01T00:00:00Z',
            contradictoryOutcomes: [outcome({ outcome: 'broken' })],
        });
        expect(r).toBe('disputed');
    });

    it('abandonment trumps everything → broken (no honorable exit)', () => {
        const r = classifyState({
            pledge: pledge(),
            outcome: outcome({ outcome: 'kept' }),
            abandonment: abandonment(),
            now: '2027-01-01T00:00:00Z',
        });
        expect(r).toBe('broken');
    });

    it('block-typed resolves_at: pending until tip_height >= block', () => {
        const p = pledge({ resolves_at: { block: 920000 } });
        const stillPending = classifyState({
            pledge: p,
            outcome: null,
            abandonment: null,
            now: '2026-09-01T00:00:00Z',
            chain: { tip_height: 919000, tip_time: '2026-09-01T00:00:00Z' },
        });
        expect(stillPending).toBe('pending');

        const nowResolvable = classifyState({
            pledge: p,
            outcome: null,
            abandonment: null,
            now: '2026-12-30T23:00:00Z',
            chain: { tip_height: 920100, tip_time: '2026-12-30T23:00:00Z' },
        });
        expect(nowResolvable).toBe('resolvable');
    });

    it('block-typed without chain → stays pending until expires_at', () => {
        const p = pledge({ resolves_at: { block: 920000 } });
        expect(
            classifyState({
                pledge: p,
                outcome: null,
                abandonment: null,
                now: '2026-09-01T00:00:00Z',
            }),
        ).toBe('pending');
    });
});

describe('outcomesContradict', () => {
    it('returns false for matching pledge_id and same outcome', () => {
        const a = outcome({ outcome: 'kept' });
        const b = outcome({ outcome: 'kept' });
        expect(outcomesContradict(a, b)).toBe(false);
    });

    it('returns true for matching pledge_id but different outcomes', () => {
        const a = outcome({ outcome: 'kept' });
        const b = outcome({ outcome: 'broken' });
        expect(outcomesContradict(a, b)).toBe(true);
    });

    it('returns false when pledge_ids differ (different pledges entirely)', () => {
        const a = outcome({ pledge_id: 'a'.repeat(64), outcome: 'kept' });
        const b = outcome({ pledge_id: 'd'.repeat(64), outcome: 'broken' });
        expect(outcomesContradict(a, b)).toBe(false);
    });
});
