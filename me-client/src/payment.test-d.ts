// Type-level: a payment answer says it is a recorded intent, as me.ochk.io sends it.
import { expectTypeOf, test } from 'vitest';

import type { PaymentResult } from './index';

test('a payment answer names its stub mode and always says whether it settles', () => {
    expectTypeOf<PaymentResult['mode']>().toEqualTypeOf<'stub'>();
    expectTypeOf<PaymentResult['settles']>().toEqualTypeOf<boolean>();
    expectTypeOf<PaymentResult['is_stub']>().toEqualTypeOf<boolean>();
});
