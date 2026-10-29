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
            now: '2026-10-01T00:00:00Z',
            contradictoryOutcomes: [outcome({ outcome: 'broken' })],
        });
        expect(r).toBe('disputed');
    });

    describe('a swearer counter-claim under counterparty_signs (§4.3, §4.5)', () => {
        const bilateral = pledge({
            resolution: { mechanism: 'counterparty_signs', query: 'q' },
            counterparty: 'bc1qbob',
        });
        const by = (resolved_by: string, o: Partial<OutcomeEnvelope>) =>
            outcome({ resolved_by, evidence: { mechanism: 'counterparty_signs', result: 'r', witness: 'w' }, ...o });
        const claim = (o: Partial<OutcomeEnvelope>) => by('bc1qalice', { id: 'c'.repeat(64), ...o });
        const counterparty = (o: Partial<OutcomeEnvelope>) => by('bc1qbob', o);
        const at = (now: string, outcomes: OutcomeEnvelope[]) =>
            classifyState({
                pledge: bilateral,
                outcome: outcomes[0] ?? null,
                abandonment: null,
                now,
                contradictoryOutcomes: outcomes.slice(1),
            });

        it('alone never settles the pledge, kept or broken', () => {
            for (const result of ['kept', 'broken'] as const) {
                expect(at('2026-10-01T00:00:00Z', [claim({ outcome: result })])).toBe('resolvable');
                expect(at('2027-01-01T00:00:00Z', [claim({ outcome: result })])).toBe('expired_unresolved');
            }
        });

        it("disputes the counterparty's outcome inside its window", () => {
            const broken = counterparty({ outcome: 'broken', resolved_at: '2026-09-02T00:00:00Z', dispute_window_ends_at: '2026-09-09T00:00:00Z' });
            // Dated before the counterparty's outcome, or inside its window.
            expect(at('2026-10-01T00:00:00Z', [claim({ outcome: 'kept', resolved_at: '2026-09-01T00:00:00Z' }), broken])).toBe('disputed');
            expect(at('2026-10-01T00:00:00Z', [broken, claim({ outcome: 'kept', resolved_at: '2026-09-05T00:00:00Z' })])).toBe('disputed');
        });

        it("comes too late after the counterparty's window, which then stands", () => {
            const broken = counterparty({ outcome: 'broken', resolved_at: '2026-09-02T00:00:00Z', dispute_window_ends_at: '2026-09-09T00:00:00Z' });
            expect(at('2026-10-01T00:00:00Z', [broken, claim({ outcome: 'kept', resolved_at: '2026-09-10T00:00:00Z' })])).toBe('broken');
        });

        it('agreeing with the counterparty changes nothing', () => {
            const kept = counterparty({ outcome: 'kept' });
            expect(at('2026-10-01T00:00:00Z', [claim({ outcome: 'kept' }), kept])).toBe('kept');
        });

        it("a stranger's envelope neither settles nor disputes", () => {
            const stranger = by('bc1qmallory', { id: 'd'.repeat(64), outcome: 'kept' });
            expect(at('2026-10-01T00:00:00Z', [stranger])).toBe('resolvable');
            expect(at('2026-10-01T00:00:00Z', [counterparty({ outcome: 'broken' }), stranger])).toBe('broken');
        });
    });

    describe('a dispute (§4.4, §4.5)', () => {
        // kept on 09-01 with its window to 09-08; the pledge expires 12-31.
        const kept = outcome({ outcome: 'kept' });
        const brokenIn = outcome({ id: 'b'.repeat(64), outcome: 'broken', resolved_at: '2026-09-05T00:00:00Z' });
        const brokenAfter = outcome({ id: 'c'.repeat(64), outcome: 'broken', resolved_at: '2026-09-10T00:00:00Z' });
        const at = (now: string, others: OutcomeEnvelope[], p = pledge()) =>
            classifyState({ pledge: p, outcome: kept, abandonment: null, now, contradictoryOutcomes: others });

        it('counts a contradiction dated inside the earliest outcome window', () => {
            expect(at('2026-10-01T00:00:00Z', [brokenIn])).toBe('disputed');
        });

        it('ignores one dated after that window: the earliest outcome is final', () => {
            expect(at('2026-10-01T00:00:00Z', [brokenAfter])).toBe('kept');
        });

        it('times out to expired_unresolved at expires_at when the pledge names no dispute mechanism', () => {
            expect(at('2026-12-30T23:59:59Z', [brokenIn])).toBe('disputed');
            expect(at('2026-12-31T00:00:00Z', [brokenIn])).toBe('expired_unresolved');
        });

        it('stays disputed after expires_at when a dispute mechanism is named', () => {
            const withVote = pledge({ dispute: { mechanism: 'vote_resolves', params: 'poll_id=p;option=kept;threshold=0.5' } });
            expect(at('2027-01-01T00:00:00Z', [brokenIn], withVote)).toBe('disputed');
        });

        it('reads the same whatever order the outcomes come in', () => {
            const r = classifyState({
                pledge: pledge(),
                outcome: brokenAfter,
                abandonment: null,
                now: '2026-10-01T00:00:00Z',
                contradictoryOutcomes: [kept],
            });
            expect(r).toBe('kept');
        });
    });

    it('an outcome dated after now does not classify the pledge yet', () => {
        // Published early, dated at resolves_at: before then it is not a resolution.
        const early = outcome({ outcome: 'broken', resolved_at: '2026-09-01T00:00:00Z' });
        const at = (now: string) =>
            classifyState({ pledge: pledge(), outcome: early, abandonment: null, now });
        expect(at('2026-08-01T00:00:00Z')).toBe('pending');
        expect(at('2026-09-02T00:00:00Z')).toBe('broken');
    });

    it('a future-dated contradicting outcome does not dispute one already in force', () => {
        const kept = outcome({ outcome: 'kept', resolved_at: '2026-09-01T00:00:00Z' });
        const later = outcome({
            id: 'd'.repeat(64),
            outcome: 'broken',
            resolved_at: '2026-11-01T00:00:00Z',
        });
        const r = classifyState({
            pledge: pledge(),
            outcome: kept,
            abandonment: null,
            now: '2026-10-01T00:00:00Z',
            contradictoryOutcomes: [later],
        });
        expect(r).toBe('kept');
    });

    it('a signed outcome dated at or after expires_at comes too late', () => {
        const late = outcome({
            outcome: 'broken',
            resolved_at: '2026-12-31T00:00:00Z',
            resolved_by: 'bc1qcounterparty',
            sig: { alg: 'bip322', pubkey: 'bc1qcounterparty', value: 'AAAA' },
        });
        const r = classifyState({
            pledge: pledge(),
            outcome: late,
            abandonment: null,
            now: '2027-01-01T00:00:00Z',
        });
        expect(r).toBe('expired_unresolved');
    });

    it('a deterministic outcome computed after expires_at still classifies', () => {
        const computedLate = outcome({ outcome: 'broken', resolved_at: '2027-01-01T00:00:00Z' });
        const r = classifyState({
            pledge: pledge(),
            outcome: computedLate,
            abandonment: null,
            now: '2027-01-02T00:00:00Z',
        });
        expect(r).toBe('broken');
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
