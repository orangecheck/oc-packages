import { describe, expect, it } from 'vitest';

import { bondRefusal } from './bond';
import { humanSigninError } from './signin';

// A reason code the auth host sends is read from the tables' own keys: an
// inherited name gets the general sentence.
const WALLET = "That didn't work. Try again.";
const EMAIL = "That didn't work. Try again, or send a new code.";

describe('refusal words', () => {
    it('a sign-in refusal named after an inherited key reads as the general sentence', () => {
        for (const code of ['constructor', '__proto__']) {
            expect(humanSigninError(code, 'wallet')).toBe(WALLET);
            expect(humanSigninError(code, 'wallet', 'submit')).toBe(WALLET);
            expect(humanSigninError(code, 'email')).toBe(EMAIL);
        }
    });

    it('a backing refusal named after an inherited key reads as the general sentence', () => {
        for (const code of ['constructor', 'toString', '__proto__', 'valueOf']) {
            expect(bondRefusal(code)).toBe(bondRefusal(undefined));
        }
    });
});
