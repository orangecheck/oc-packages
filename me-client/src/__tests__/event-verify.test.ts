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

describe('oc.event.verify · an agent event is priced by the agent override', () => {
    const PERCENT = { kind: 'percent_of_amount' as const, pct: 0.01 };
    const FIXED = { kind: 'fixed_sats' as const, sats: 2000 };
    const AT_PERCENT = { gross_fee_sats: 1000, platform_fee_sats: 200, user_earned_sats: 800 };
    const AT_FIXED = { gross_fee_sats: 2000, platform_fee_sats: 400, user_earned_sats: 1600 };
    const tip = (fees: typeof AT_FIXED, is_agent?: true) =>
        makeEnvelope({
            class: 'B',
            subtype: 'tip_sent',
            ...fees,
            site_rebate_sats: 0,
            ...(is_agent ? { is_agent } : {}),
        });
    const tipConfig = (cfg: Omit<IntegratorEventConfig, 'enabled' | 'user_share_pct'>) =>
        makeConfig({ tip_sent: { enabled: true, user_share_pct: 0.8, ...cfg } });

    it('passes both under a fixed person price and a percent agent price', () => {
        const cfg = tipConfig({ site_pays: FIXED, agent: { site_pays: PERCENT } });
        expect(event.verify(tip(AT_PERCENT, true), cfg, 100_000).issues).toEqual([]);
        expect(event.verify(tip(AT_FIXED), cfg, 100_000).issues).toEqual([]);
    });

    it('passes both under a percent person price and a fixed agent price', () => {
        const cfg = tipConfig({ site_pays: PERCENT, agent: { site_pays: FIXED } });
        // A fixed agent price needs no payment amount.
        const agent = event.verify(tip(AT_FIXED, true), cfg);
        expect([agent.ok, agent.issues]).toEqual([true, []]);
        expect(event.verify(tip(AT_PERCENT), cfg, 100_000).issues).toEqual([]);
    });

    it('flags an agent event under a subtype that refuses agents, and prices a person as before', () => {
        const cfg = tipConfig({ site_pays: FIXED, agent: { refuse: true } });
        const agent = event.verify(tip(AT_PERCENT, true), cfg, 100_000);
        expect([agent.ok, agent.issues.map((i) => i.field)]).toEqual([false, ['agent_refused']]);
        expect(event.verify(tip(AT_FIXED), cfg).issues).toEqual([]);
    });
});
