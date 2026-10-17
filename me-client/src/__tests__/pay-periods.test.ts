import { afterEach, describe, expect, it, vi } from 'vitest';

import { event } from '../event';
import { oc } from '../index';
import { payingAt, type PayPeriod } from '../pay-periods';
import { computeFees, type BillableEvent, type IntegratorPriceConfig } from '../types';

/**
 * Paying users is optional: a project pays only inside its pay periods. The
 * SDK reads them the way me.ochk.io does, says when an event earned nothing,
 * and flags a receipt billed outside every period.
 */

const LAUNCH: PayPeriod = {
    id: 'pp_launch',
    name: 'Launch week',
    starts_at: '2026-10-20T00:00:00Z',
    ends_at: '2026-10-27T00:00:00Z',
};

describe('payingAt', () => {
    it('pays from a start inclusive to an end exclusive, and names the next period', () => {
        expect(payingAt([], new Date('2026-10-16T00:00:00Z'))).toEqual({
            paying: false,
            next: null,
        });
        expect(payingAt([LAUNCH], new Date('2026-10-19T23:59:59Z'))).toEqual({
            paying: false,
            next: LAUNCH,
        });
        expect(payingAt([LAUNCH], new Date('2026-10-20T00:00:00Z'))).toEqual({
            paying: true,
            period: LAUNCH,
        });
        expect(payingAt([LAUNCH], new Date('2026-10-27T00:00:00Z')).paying).toBe(false);
        const always = { ...LAUNCH, id: 'pp_on', name: '', ends_at: null };
        expect(payingAt([always], new Date('2030-01-01T00:00:00Z')).paying).toBe(true);
    });
});

describe('oc.event.verify with pay periods', () => {
    const CFG = {
        enabled: true,
        site_pays: { kind: 'fixed_sats', sats: 100 },
        user_share_pct: 0.65,
    } as const;
    const config: IntegratorPriceConfig = {
        project_key: 'pk_test_promo',
        display_name: 'Promo',
        domain: 'promo.example',
        updated_at: '2026-10-16T00:00:00Z',
        events: { session_creation: CFG },
    };
    const envelope = (occurred_at: string): BillableEvent => ({
        id: 'oc-me-evt-1',
        occurred_at,
        class: 'C',
        subtype: 'session_creation',
        site: { domain: 'promo.example', display_name: 'Promo' },
        ...computeFees(CFG),
        verify_url: 'https://me.ochk.io/verify/oc-me-evt-1',
    });

    it('passes an event billed inside a period', () => {
        const r = event.verify(envelope('2026-10-21T00:00:00Z'), config, undefined, {
            payPeriods: [LAUNCH],
        });
        expect(r).toMatchObject({ ok: true, issues: [] });
    });

    it('flags one billed outside every period, even beside other issues', () => {
        const r = event.verify(envelope('2026-10-28T00:00:00Z'), config, undefined, {
            payPeriods: [LAUNCH],
        });
        expect(r.ok).toBe(false);
        expect(r.issues.map((i) => i.field)).toEqual(['outside_pay_period']);
        const disabled = event.verify(
            envelope('2026-10-28T00:00:00Z'),
            { ...config, events: { session_creation: { ...CFG, enabled: false } } },
            undefined,
            { payPeriods: [LAUNCH] }
        );
        expect(disabled.issues.map((i) => i.field)).toEqual([
            'outside_pay_period',
            'subtype_disabled',
        ]);
    });

    it('checks nothing about periods when none are given', () => {
        expect(event.verify(envelope('2026-10-28T00:00:00Z'), config).ok).toBe(true);
    });
});

describe('oc.event.fire outside a pay period', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('says the event earned nothing, and when paying starts', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    ok: true,
                    earned: false,
                    reason: 'not_paying',
                    detail: 'Promo pays its users from 2026-10-20T00:00:00Z.',
                    next_pay_period: LAUNCH,
                })
            )
        );
        const res = await oc.event.fire({
            project_key: 'pk_test_promo',
            subtype: 'session_creation',
        });
        expect(res.earned).toBe(false);
        if (!res.earned) expect(res.next_pay_period).toEqual(LAUNCH);
    });
});
