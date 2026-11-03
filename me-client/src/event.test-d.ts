// Type-level: a rejected batch entry carries an optional code beside its reason,
// as me.ochk.io's batch route sends it (its batch-reject-codes.ts).
import { expectTypeOf, test } from 'vitest';

import type { BatchEventResult, BatchRejectCode, FireBatchResponse } from './index';

type Rejected = Extract<BatchEventResult, { status: 'rejected' }>;

test('a rejected entry may carry a code to switch on, beside its reason in words', () => {
    expectTypeOf<Rejected['code']>().toEqualTypeOf<BatchRejectCode | undefined>();
    expectTypeOf<Rejected['reason']>().toEqualTypeOf<string>();
    expectTypeOf<FireBatchResponse['results'][number]>().toEqualTypeOf<BatchEventResult>();
});

test('an entry from a server older than the codes, with a reason alone, is still a rejected entry', () => {
    const old = { index: 0, status: 'rejected' as const, reason: 'subtype required' };
    const coded = { ...old, code: 'subtype_required' as const };
    expectTypeOf(old).toMatchTypeOf<Rejected>();
    expectTypeOf(coded).toMatchTypeOf<Rejected>();
    expectTypeOf({ ...old, code: 'not_a_code' as const }).not.toMatchTypeOf<Rejected>();
});

test('only a rejected entry has a code', () => {
    expectTypeOf<Extract<BatchEventResult, { status: 'recorded' }>>().not.toHaveProperty('code');
    expectTypeOf<Extract<BatchEventResult, { status: 'duplicate' }>>().not.toHaveProperty('code');
    expectTypeOf<Extract<BatchEventResult, { status: 'not_paying' }>>().not.toHaveProperty('code');
});

test('the codes are the sixteen me.ochk.io sends', () => {
    expectTypeOf<BatchRejectCode>().toEqualTypeOf<
        | 'subtype_required'
        | 'invalid_note'
        | 'invalid_action_label'
        | 'event_not_enabled'
        | 'event_class_invalid'
        | 'payment_amount_sats_required'
        | 'agent_refused'
        | 'earning_below_one_sat'
        | 'site_cap_exceeded'
        | 'idempotency_key_too_long'
        | 'duplicate_idempotency_key'
        | 'idempotency_key_in_flight'
        | 'identity_cap_reached'
        | 'escrow_depleted'
        | 'write_failed'
        | 'outcome_unknown'
    >();
});
