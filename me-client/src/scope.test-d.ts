// Type-level: Scope is the exported id list, and every map of scope values is keyed by it.
import { expectTypeOf, test } from 'vitest';

import type { GrantedResult, Scope, WebhookPayload } from './index';
import { SCOPE_IDS } from './index';

test('Scope is exactly the ids SCOPE_IDS lists', () => {
    expectTypeOf<Scope>().toEqualTypeOf<(typeof SCOPE_IDS)[number]>();
    expectTypeOf<'trust_attestations_bundle'>().toMatchTypeOf<Scope>();
    expectTypeOf<'cross_integrator_oldest_event_at'>().toMatchTypeOf<Scope>();
    expectTypeOf<'wallet_keys'>().not.toMatchTypeOf<Scope>();
});

test('a webhook and a granted read carry values for the same scopes', () => {
    expectTypeOf<keyof NonNullable<WebhookPayload['scopes']>>().toEqualTypeOf<Scope>();
    expectTypeOf<keyof GrantedResult['scopes']>().toEqualTypeOf<Scope>();
});
