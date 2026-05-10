import { describe, expect, it } from 'vitest';

import { ALL_EVENT_SUBTYPES, EVENT_SUBTYPES, subtypesForClass } from '../subtypes';
import type { EventSubtype } from '../types';

describe('EVENT_SUBTYPES catalog', () => {
    const expectedSubtypes: EventSubtype[] = [
        'account_creation',
        'account_recovery',
        'attest_bond_increased',
        'payment_method_connected',
        'agent_delegation_issued',
        'recovery_method_updated',
        'payment_authorization',
        'scoped_action_authorization',
        'attest_verification_at_gate',
        'stamp_signing',
        'pledge_resolution',
        'session_creation',
    ];

    it.each(expectedSubtypes)('has metadata for %s', (sub) => {
        const meta = EVENT_SUBTYPES[sub];
        expect(meta).toBeDefined();
        expect(meta.id).toBe(sub);
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.fires_when.length).toBeGreaterThan(0);
        expect(meta.example.length).toBeGreaterThan(0);
        expect(meta.common_use_cases.length).toBeGreaterThan(0);
        expect(meta.typical_price_hint.length).toBeGreaterThan(0);
    });

    it('each subtype id matches its key', () => {
        for (const [key, meta] of Object.entries(EVENT_SUBTYPES)) {
            expect(meta.id).toBe(key);
        }
    });

    it('all 12 subtypes present', () => {
        expect(Object.keys(EVENT_SUBTYPES).length).toBe(12);
    });
});

describe('subtypesForClass', () => {
    it('returns 6 class-A subtypes', () => {
        const a = subtypesForClass('A');
        expect(a.length).toBe(6);
        for (const m of a) expect(m.class).toBe('A');
    });

    it('returns 5 class-B subtypes', () => {
        const b = subtypesForClass('B');
        expect(b.length).toBe(5);
        for (const m of b) expect(m.class).toBe('B');
    });

    it('returns 1 class-C subtype', () => {
        const c = subtypesForClass('C');
        expect(c.length).toBe(1);
        expect(c[0]!.id).toBe('session_creation');
    });
});

describe('ALL_EVENT_SUBTYPES', () => {
    it('orders class A → B → C', () => {
        const classes = ALL_EVENT_SUBTYPES.map((m) => m.class);
        // First 6 are A, next 5 are B, last 1 is C.
        expect(classes.slice(0, 6).every((c) => c === 'A')).toBe(true);
        expect(classes.slice(6, 11).every((c) => c === 'B')).toBe(true);
        expect(classes[11]).toBe('C');
    });
});
