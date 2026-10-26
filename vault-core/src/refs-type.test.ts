import { describe, expect, it } from 'vitest';

import { resolveSecretRef, SecretRefError } from './refs';
import type { DecryptedEntry } from './vault';

// entry.type comes from the decrypted blob, unchecked: a type with no primary
// field is a SecretRefError, never a TypeError.
function entry(type: string, fields: Record<string, unknown>): DecryptedEntry {
    return {
        entry: {
            id: '00112233445566778899aabbccddeeff',
            type: type as DecryptedEntry['entry']['type'],
            name: 'GitHub',
            nonce: '',
            ciphertext: '',
            created_at: '2026-10-26T00:00:00Z',
            updated_at: '2026-10-26T00:00:00Z',
        },
        fields: fields as DecryptedEntry['fields'],
    };
}

const REF = 'ocv://personal/GitHub';

describe('resolveSecretRef and the entry type', () => {
    it('reads a known type by its primary field', () => {
        expect(resolveSecretRef([entry('password', { password: 'hunter2' })], REF)).toBe('hunter2');
    });

    it('refuses a type it has no primary field for, inherited names included', () => {
        for (const type of ['constructor', 'toString', '__proto__', 'something-new']) {
            const entries = [entry(type, { password: 'x' })];
            expect(() => resolveSecretRef(entries, REF)).toThrow(SecretRefError);
        }
    });

    it('still reads a named field on such an entry', () => {
        const entries = [entry('constructor', { login: 'me' })];
        expect(resolveSecretRef(entries, `${REF}/login`)).toBe('me');
    });
});
