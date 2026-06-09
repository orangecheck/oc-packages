import { describe, it, expect } from 'vitest';

import {
    MIN_INTEGRATOR_PRICE_SATS,
    PLATFORM_FEE_POLICY,
    computeFees,
    validateIntegratorConfig,
} from '../types';
import type {
    BillableEvent,
    EventClass,
    IntegratorEventConfig,
    SessionPolicy,
} from '../types';

describe('@orangecheck/me-client · types', () => {
    it('EventClass is exactly A | B | C', () => {
        const classes: EventClass[] = ['A', 'B', 'C'];
        expect(classes).toHaveLength(3);
    });

    it('BillableEvent shape includes site_rebate_sats', () => {
        const sample: BillableEvent = {
            id: 'oc-me-7a3c9e2f',
            occurred_at: '2026-04-30T16:08:42Z',
            class: 'B',
            subtype: 'payment_authorization',
            site: { domain: 'breez.example', display_name: 'Breez' },
            gross_fee_sats: 1280,
            platform_fee_sats: 256,
            user_earned_sats: 832,
            site_rebate_sats: 192,
            verify_url: 'https://me.ochk.io/verify/oc-me-7a3c9e2f',
        };
        expect(
            sample.platform_fee_sats + sample.user_earned_sats + sample.site_rebate_sats
        ).toBe(sample.gross_fee_sats);
    });

    it('SessionPolicy refresh modes are constrained', () => {
        const banking: SessionPolicy = {
            duration_seconds: 60 * 15,
            refresh: 'sliding',
            sensitive_actions: 're-auth',
        };
        const saas: SessionPolicy = { duration_seconds: 7 * 86_400, refresh: 'sliding' };
        const mobile: SessionPolicy = { duration_seconds: 90 * 86_400, refresh: 'rolling' };
        expect([banking, saas, mobile]).toHaveLength(3);
    });
});

describe('@orangecheck/me-client · computeFees invariants', () => {
    const cases: { name: string; cfg: IntegratorEventConfig; amt?: number }[] = [
        {
            name: 'fixed price typical',
            cfg: {
                enabled: true,
                site_pays: { kind: 'fixed_sats', sats: 1300 },
                user_share_pct: 0.65,
            },
        },
        {
            name: 'fixed price clamped to floor',
            cfg: {
                enabled: true,
                site_pays: { kind: 'fixed_sats', sats: 1 },
                user_share_pct: 0.65,
            },
        },
        {
            name: 'percent on real payment',
            cfg: {
                enabled: true,
                site_pays: { kind: 'percent_of_amount', pct: 0.0075 },
                user_share_pct: 0.65,
            },
            amt: 240_000,
        },
        {
            name: 'user_share = 0 → site keeps full rebate',
            cfg: {
                enabled: true,
                site_pays: { kind: 'fixed_sats', sats: 1000 },
                user_share_pct: 0,
            },
        },
        {
            name: 'user_share = 0.8 → no rebate',
            cfg: {
                enabled: true,
                site_pays: { kind: 'fixed_sats', sats: 1000 },
                user_share_pct: 0.8,
            },
        },
    ];

    for (const c of cases) {
        it(`${c.name} — gross == platform + user + rebate`, () => {
            const f = computeFees(c.cfg, c.amt);
            expect(f.platform_fee_sats + f.user_earned_sats + f.site_rebate_sats).toBe(
                f.gross_fee_sats
            );
            expect(f.gross_fee_sats).toBeGreaterThanOrEqual(MIN_INTEGRATOR_PRICE_SATS);
            expect(f.platform_fee_sats).toBeGreaterThanOrEqual(
                PLATFORM_FEE_POLICY.min_floor_sats
            );
            expect(f.user_earned_sats).toBeGreaterThanOrEqual(0);
            expect(f.site_rebate_sats).toBeGreaterThanOrEqual(0);
        });
    }

    it('user_share > 0.8 is clamped, no negative rebate', () => {
        const f = computeFees({
            enabled: true,
            site_pays: { kind: 'fixed_sats', sats: 1000 },
            user_share_pct: 0.95,
        });
        expect(f.user_earned_sats).toBe(800);
        expect(f.site_rebate_sats).toBe(0);
    });

    it('percent_of_amount throws when amount missing', () => {
        expect(() =>
            computeFees({
                enabled: true,
                site_pays: { kind: 'percent_of_amount', pct: 0.005 },
                user_share_pct: 0.5,
            })
        ).toThrow();
    });
});

describe('@orangecheck/me-client · validateIntegratorConfig', () => {
    it('rejects sats below MIN_INTEGRATOR_PRICE_SATS for an enabled event', () => {
        // Floor is the 1-sat atomic unit (a prior SDK release drifted
        // to 5 while the platform ratified 1) — 0 is below, 1 passes.
        const r = validateIntegratorConfig({
            project_key: 'pk',
            display_name: 'X',
            domain: 'x.example',
            updated_at: '',
            events: {
                account_creation: {
                    enabled: true,
                    site_pays: { kind: 'fixed_sats', sats: 0 },
                    user_share_pct: 0.5,
                },
            },
        });
        expect(r.ok).toBe(false);
        expect(r.errors.some((e) => e.subtype === 'account_creation')).toBe(true);
    });

    it('accepts a 1-sat price — the canonical floor', () => {
        const r = validateIntegratorConfig({
            project_key: 'pk',
            display_name: 'X',
            domain: 'x.example',
            updated_at: '',
            events: {
                account_creation: {
                    enabled: true,
                    site_pays: { kind: 'fixed_sats', sats: 1 },
                    user_share_pct: 0.5,
                },
            },
        });
        expect(r.ok).toBe(true);
    });

    it('rejects user_share_pct > 0.8', () => {
        const r = validateIntegratorConfig({
            project_key: 'pk',
            display_name: 'X',
            domain: 'x.example',
            updated_at: '',
            events: {
                session_creation: {
                    enabled: true,
                    site_pays: { kind: 'fixed_sats', sats: 100 },
                    user_share_pct: 0.95,
                },
            },
        });
        expect(r.ok).toBe(false);
    });

    it('accepts a fully-formed config', () => {
        const r = validateIntegratorConfig({
            project_key: 'pk_live_yourcompany',
            display_name: 'YourCompany',
            domain: 'yourcompany.example',
            updated_at: '2026-04-30T00:00:00Z',
            events: {
                account_creation: {
                    enabled: true,
                    site_pays: { kind: 'fixed_sats', sats: 1300 },
                    user_share_pct: 0.65,
                },
                payment_authorization: {
                    enabled: true,
                    site_pays: { kind: 'percent_of_amount', pct: 0.0075 },
                    user_share_pct: 0.65,
                },
                session_creation: {
                    enabled: true,
                    site_pays: { kind: 'fixed_sats', sats: 55 },
                    user_share_pct: 0.65,
                },
            },
        });
        expect(r.errors).toEqual([]);
        expect(r.ok).toBe(true);
    });
});
