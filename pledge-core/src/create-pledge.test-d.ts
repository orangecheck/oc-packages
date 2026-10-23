// Type-level: a direct pledge needs the swearer's signer; an agent pledge needs only the agent's.
import { expectTypeOf, test } from 'vitest';

import type {
    Bip322Signer,
    CreateDelegatedPledgeInput,
    CreateDirectPledgeInput,
    CreatePledgeInput,
} from './types.js';

declare const terms: Omit<CreateDirectPledgeInput, 'swearerSigner' | 'viaDelegation'>;
declare const signer: Bip322Signer;

test('an agent pledge needs no signer from the principal', () => {
    const input: CreatePledgeInput = {
        ...terms,
        viaDelegation: { delegation_id: 'd'.repeat(64), agent_signer: signer },
    };
    expectTypeOf(input).toMatchTypeOf<CreatePledgeInput>();
    expectTypeOf<CreateDelegatedPledgeInput['viaDelegation']>().not.toBeUndefined();
});

test('a direct pledge cannot leave out the swearer signer', () => {
    // @ts-expect-error swearerSigner is required when there is no viaDelegation
    const input: CreatePledgeInput = { ...terms };
    void input;
    expectTypeOf<CreateDirectPledgeInput['swearerSigner']>().toEqualTypeOf<Bip322Signer>();
});
