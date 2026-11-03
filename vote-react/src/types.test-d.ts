// Type-level: TallyResponse names every state vote.ochk.io's /api/tally sends.
// A 200 is tallied, provisional (an anchored poll's count before it is
// final) or awaiting_reveal; a 409 is deferred. Checked by `tsc --noEmit`.
import { expectTypeOf, test } from 'vitest';

import type { TallyResponse } from './types.js';

test('the tally states are the ones the endpoint sends', () => {
    expectTypeOf<TallyResponse['state']>().toEqualTypeOf<'tallied' | 'provisional' | 'awaiting_reveal' | 'deferred'>();
});
