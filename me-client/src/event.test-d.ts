// Type-level: a rejected batch entry carries an optional code beside its reason,
// as me.ochk.io's batch route sends it (its batch-reject-codes.ts).
import { expectTypeOf, test } from 'vitest';

import type {
    BatchEventResult,
    BatchRejectCode,
    BillableEvent,
    FireBatchResponse,
    FireEventResult,
} from './index';

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

type NotBilled = Extract<FireEventResult, { reason: 'not_billed' }>;
type NotPaying = Extract<FireEventResult, { reason: 'not_paying' }>;
const event = {} as BillableEvent;

test('an event recorded and charged nothing answers earned false, with its record', () => {
    expectTypeOf<NotBilled['earned']>().toEqualTypeOf<false>();
    expectTypeOf<NotBilled['event']>().toEqualTypeOf<BillableEvent>();
    expectTypeOf<NotBilled['detail']>().toEqualTypeOf<string>();
    expectTypeOf<NotBilled>().not.toHaveProperty('next_pay_period');
    expectTypeOf<NotPaying>().not.toHaveProperty('event');
    expectTypeOf<Extract<FireEventResult, { earned: false }>['reason']>().toEqualTypeOf<
        'not_billed' | 'not_paying'
    >();
});

test('the answers me.ochk.io sends are FireEventResults', () => {
    const replay = {
        ok: true as const,
        earned: true as const,
        event,
        webhooks_queued: 0,
        webhooks_fired: 0,
        idempotent_replay: true,
    };
    const notBilled = {
        ok: true as const,
        earned: false as const,
        reason: 'not_billed' as const,
        detail: 'The event was recorded and charged nothing, so it paid nobody.',
        event,
        webhooks_queued: 1,
        webhooks_fired: 1,
        escrow_mode: 'live' as const,
    };
    expectTypeOf(replay).toMatchTypeOf<FireEventResult>();
    expectTypeOf(notBilled).toMatchTypeOf<FireEventResult>();
    const { event: _dropped, ...withoutRecord } = notBilled;
    expectTypeOf(withoutRecord).not.toMatchTypeOf<FireEventResult>();
});
