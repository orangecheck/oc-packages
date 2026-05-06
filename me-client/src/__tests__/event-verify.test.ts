import { describe, expect, it } from 'vitest';

import { event } from '../event';
import type {
    BillableEvent,
    IntegratorEventConfig,
    IntegratorPriceConfig,
} from '../types';
import { computeFees } from '../types';

function makeConfig(events: IntegratorPriceConfig['events']): IntegratorPriceConfig {
    return {
        project_key: 'pk_test_co',
        display_name: 'Test Co',
        domain: 'test.co',
        updated_at: '2026-05-04T00:00:00Z',
        events,
    };
}

function makeEnvelope(overrides: Partial<BillableEvent> = {}): BillableEvent {
    return {
        id: 'oc-me-evt-1',
        occurred_at: '2026-05-04T12:00:00Z',
        class: 'C',
        subtype: 'session_creation',
        site: { domain: 'test.co', display_name: 'Test Co' },
        gross_fee_sats: 100,
        platform_fee_sats: 20,
        user_earned_sats: 65,
        site_rebate_sats: 15,
        verify_url: 'https://me.ochk.io/verify/oc-me-evt-1',
        ...overrides,
    };
}

const SESSION_CFG: IntegratorEventConfig = {
    enabled: true,
    site_pays: { kind: 'fixed_sats', sats: 100 },
    user_share_pct: 0.65,
};

describe('oc.event.verify', () => {
    it('passes when the envelope matches computeFees() exactly', () => {
        const cfg = makeConfig({ session_creation: SESSION_CFG });
        const expected = computeFees(SESSION_CFG);
        const env = makeEnvelope(expected);
        const result = event.verify(env, cfg);
        expect(result.ok).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.expected).toEqual(expected);
    });

    it('flags every diverging field', () => {
        const cfg = makeConfig({ session_creation: SESSION_CFG });
        const env = makeEnvelope({
            gross_fee_sats: 99,
            platform_fee_sats: 19,
            user_earned_sats: 64,
            site_rebate_sats: 16,
        });
        const result = event.verify(env, cfg);
        expect(result.ok).toBe(false);
        const fields = result.issues.map((i) => i.field).sort();
        expect(fields).toEqual([
            'gross_fee_sats',
            'platform_fee_sats',
            'site_rebate_sats',
            'user_earned_sats',
        ]);
    });

    it('returns subtype_unconfigured when the integrator has no config for the subtype', () => {
        const cfg = makeConfig({});
        const env = makeEnvelope();
        const result = event.verify(env, cfg);
        expect(result.ok).toBe(false);
        expect(result.issues[0]!.field).toBe('subtype_unconfigured');
    });

    it('returns subtype_disabled when the integrator has explicitly disabled the subtype', () => {
        const cfg = makeConfig({
            session_creation: { ...SESSION_CFG, enabled: false },
        });
        const env = makeEnvelope();
        const result = event.verify(env, cfg);
        expect(result.ok).toBe(false);
        expect(result.issues[0]!.field).toBe('subtype_disabled');
    });

    it('requires payment_amount_sats for percent_of_amount-priced subtypes', () => {
        const cfg = makeConfig({
            payment_authorization: {
                enabled: true,
                site_pays: { kind: 'percent_of_amount', pct: 0.01 },
                user_share_pct: 0.5,
            },
        });
        const env = makeEnvelope({
            id: 'oc-me-evt-2',
            class: 'B',
            subtype: 'payment_authorization',
        });
        const result = event.verify(env, cfg);
        expect(result.ok).toBe(false);
        expect(result.issues[0]!.field).toBe('percent_amount_missing');
    });

    it('verifies percent_of_amount events when the underlying amount is supplied', () => {
        const cfg = makeConfig({
            payment_authorization: {
                enabled: true,
                site_pays: { kind: 'percent_of_amount', pct: 0.01 },
                user_share_pct: 0.5,
            },
        });
        const expected = computeFees(cfg.events.payment_authorization!, 100_000);
        const env = makeEnvelope({
            id: 'oc-me-evt-3',
            class: 'B',
            subtype: 'payment_authorization',
            ...expected,
        });
        const result = event.verify(env, cfg, 100_000);
        expect(result.ok).toBe(true);
        expect(result.expected).toEqual(expected);
    });
});
