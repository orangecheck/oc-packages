import { describe, expect, it, vi } from 'vitest';

// Counts every scrypt call, so a refused blob can be shown to cost nothing.
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('@noble/hashes/scrypt', async (importOriginal) => {
    const real = await importOriginal<typeof import('@noble/hashes/scrypt')>();
    return {
        ...real,
        scrypt: (...args: Parameters<typeof real.scrypt>) => {
            calls.n++;
            return real.scrypt(...args);
        },
    };
});

import { createEncryptedBackup, restoreEncryptedBackup, unwrapVaultKey, wrapVaultKey } from './index';

const KEY = new Uint8Array(32).fill(7);

// Each is cheap if scrypt ever ran it, so a check moved after the KDF fails
// here by count, not by a 17 GiB allocation.
const REFUSED: Array<[string, { N: number; r: number; p: number }]> = [
    ['N below 2^14', { N: 1 << 13, r: 8, p: 1 }],
    ['N not a power of two', { N: (1 << 14) + 1, r: 8, p: 1 }],
    ['r above 16', { N: 1 << 14, r: 17, p: 1 }],
    ['p above 4', { N: 1 << 14, r: 8, p: 5 }],
    ['r zero', { N: 1 << 14, r: 0, p: 1 }],
];

describe('work factors are refused before scrypt runs', () => {
    it('counts scrypt calls (the spy is live)', () => {
        calls.n = 0;
        const w = wrapVaultKey(KEY, 'a passphrase');
        expect(calls.n).toBe(1);
        expect(unwrapVaultKey(w, 'a passphrase')).toEqual(KEY);
        expect(calls.n).toBe(2);
    }, 60_000);

    for (const [why, f] of REFUSED) {
        it(`unwrapVaultKey: ${why}`, () => {
            const w = { ...wrapVaultKey(KEY, 'x'), kdf_n: f.N, kdf_r: f.r, kdf_p: f.p };
            calls.n = 0;
            expect(() => unwrapVaultKey(w, 'x')).toThrow('unsupported key-derivation parameters');
            expect(calls.n).toBe(0);
        }, 60_000);

        it(`restoreEncryptedBackup: ${why}`, () => {
            const file = { ...createEncryptedBackup([], KEY, 'a backup passphrase'), scrypt: f };
            calls.n = 0;
            expect(() => restoreEncryptedBackup(file, 'a backup passphrase')).toThrow(
                'unsupported key-derivation parameters'
            );
            expect(calls.n).toBe(0);
        }, 60_000);
    }
});
