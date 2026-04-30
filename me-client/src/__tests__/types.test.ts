import { describe, it, expect } from 'vitest';

import type { BillableEvent, EventClass, SessionPolicy } from '../types';

describe('@orangecheck/me-client types', () => {
    it('EventClass is exactly A | B | C', () => {
        const classes: EventClass[] = ['A', 'B', 'C'];
        expect(classes).toHaveLength(3);
    });

    it('BillableEvent shape matches Addendum 01 contract', () => {
        const sample: BillableEvent = {
            id: 'oc-me-7a3c9e2f',
            occurred_at: '2026-04-30T16:08:42Z',
            class: 'B',
            subtype: 'payment_authorization',
            site: { domain: 'breez.example', display_name: 'Breez' },
            gross_fee_sats: 1280,
            platform_fee_sats: 448,
            user_earned_sats: 832,
            verify_url: 'https://me.ochk.io/verify/oc-me-7a3c9e2f',
        };
        expect(sample.gross_fee_sats - sample.platform_fee_sats).toBe(sample.user_earned_sats);
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
