import { randomBytesN } from '@orangecheck/lock-crypto';
import { describe, expect, it } from 'vitest';

import {
    OcVault,
    assertAcceptableKdfParams,
    buildExport,
    encryptFields,
    fieldValue,
    isSecretRef,
    packEntryForCloud,
    parseExport,
    parseSecretRef,
    totp,
    unpackEntryFromCloud,
    type VaultEntry,
} from './index';

function passwordEntry(key: Uint8Array, name: string, fields: Record<string, unknown>): VaultEntry {
    const { nonce, ciphertext } = encryptFields(fields, key);
    return {
        id: randomBytesN(16).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
        type: 'password',
        name,
        nonce,
        ciphertext,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

function envEntry(key: Uint8Array, name: string, vars: Record<string, string>): VaultEntry {
    const { nonce, ciphertext } = encryptFields({ vars }, key);
    return {
        id: randomBytesN(16).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
        type: 'env',
        name,
        nonce,
        ciphertext,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
    };
}

describe('crypto round-trip', () => {
    it('packs and unpacks a cloud blob', () => {
        const key = randomBytesN(32);
        const entry = passwordEntry(key, 'Example', { username: 'me', password: 's3cret' });
        const back = unpackEntryFromCloud(packEntryForCloud(entry, key), key);
        expect(back.id).toBe(entry.id);
        expect(back.name).toBe('Example');
    });

    it('rejects a foreign key', () => {
        const key = randomBytesN(32);
        const entry = passwordEntry(key, 'Example', { password: 'x' });
        expect(() => unpackEntryFromCloud(packEntryForCloud(entry, key), randomBytesN(32))).toThrow();
    });
});

describe('secret references', () => {
    it('parses ocv:// references', () => {
        expect(parseSecretRef('ocv://personal/GitHub/password')).toMatchObject({
            vault: 'personal',
            item: 'GitHub',
            field: 'password',
        });
        expect(parseSecretRef('ocv://personal/GitHub')).toMatchObject({
            vault: 'personal',
            item: 'GitHub',
            field: undefined,
        });
        expect(parseSecretRef('ocv://personal/GitHub/login?attr=otp').attr).toBe('otp');
    });

    it('rejects malformed references', () => {
        expect(isSecretRef('https://example.com')).toBe(false);
        expect(() => parseSecretRef('ocv://only-one')).toThrow();
        expect(() => parseSecretRef('ocv://a/b/c/d')).toThrow();
    });
});

describe('OcVault.fromEntries + resolve', () => {
    const key = randomBytesN(32);
    const vault = OcVault.fromEntries(
        [
            passwordEntry(key, 'Example', {
                username: 'me',
                password: 's3cret',
                url: 'https://example.com',
                custom: [{ id: '1', label: 'API region', value: 'us-east' }],
            }),
        ],
        key
    );

    it('resolves the primary field by default', () => {
        expect(vault.resolve('ocv://personal/Example')).toBe('s3cret');
    });

    it('resolves a named field and a custom field', () => {
        expect(vault.resolve('ocv://personal/Example/username')).toBe('me');
        expect(vault.resolve('ocv://personal/Example/API region')).toBe('us-east');
    });

    it('lists metadata without secrets', () => {
        const list = vault.list();
        expect(list[0]!.name).toBe('Example');
        expect(JSON.stringify(list)).not.toContain('s3cret');
    });

    it('throws on an unknown entry or field', () => {
        expect(() => vault.resolve('ocv://personal/Nope')).toThrow();
        expect(() => vault.resolve('ocv://personal/Example/nope')).toThrow();
    });

    it('refuses non-personal vaults in v1', () => {
        expect(() => vault.resolve('ocv://team-x/Example')).toThrow(/personal vault only/);
    });
});

describe('env entry resolution', () => {
    const key = randomBytesN(32);
    const vault = OcVault.fromEntries(
        [
            envEntry(key, 'prod', {
                DATABASE_URL: 'postgres://prod',
                STRIPE_KEY: 'sk_live_xyz',
            }),
        ],
        key
    );

    it('resolves one var of an env bundle by name', () => {
        expect(vault.resolve('ocv://personal/prod/DATABASE_URL')).toBe('postgres://prod');
        expect(vault.resolve('ocv://personal/prod/stripe_key')).toBe('sk_live_xyz'); // case-insensitive
    });

    it('emits the whole bundle as KEY=value lines when no field is given', () => {
        const text = vault.resolve('ocv://personal/prod');
        expect(text).toContain('DATABASE_URL=postgres://prod');
        expect(text).toContain('STRIPE_KEY=sk_live_xyz');
        expect(text.split('\n')).toHaveLength(2);
    });

    it('throws for an unknown env var', () => {
        expect(() => vault.resolve('ocv://personal/prod/MISSING')).toThrow(/no var/);
    });
});

describe('fieldValue', () => {
    it('finds direct and custom fields case-insensitively', () => {
        const fields = { password: 'p', custom: [{ id: '1', label: 'Token', value: 't' }] };
        expect(fieldValue(fields, 'PASSWORD')).toBe('p');
        expect(fieldValue(fields, 'token')).toBe('t');
        expect(fieldValue(fields, 'missing')).toBeUndefined();
    });
});

describe('totp', () => {
    it('matches the RFC 6238 SHA-1 test vector', () => {
        // secret = base32("12345678901234567890"), T = 59s, 8 digits
        const code = totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', {
            digits: 8,
            period: 30,
            now: 59_000,
        });
        expect(code).toBe('94287082');
    });
});

describe('portable export', () => {
    it('builds and parses an export', () => {
        const key = randomBytesN(32);
        const exp = buildExport([passwordEntry(key, 'Example', { password: 'x' })], 'bc1qtest');
        const parsed = parseExport(JSON.stringify(exp));
        expect(parsed.entries).toHaveLength(1);
        expect(parsed.identity).toBe('bc1qtest');
    });

    it('rejects a wrong format', () => {
        expect(() => parseExport('{"format":"nope","version":1,"entries":[]}')).toThrow();
    });
});

/**
 * `unwrapVaultKey` takes N, r and p from the blob it is handed, and that blob
 * comes from a server or a file. scrypt's memory cost is 128 · N · r bytes, so
 * a blob declaring N = 2^24 with r = 8 asks for 17 GiB and kills the tab —
 * before the passphrase is tested, so there is nothing for the user to act on.
 * Only the salt and the ciphertext were ever checked.
 */
describe('scrypt work factors are bounded before any memory is spent', () => {
    const shipped = { kdf_n: 1 << 17, kdf_r: 8, kdf_p: 1 };

    it('accepts what this library writes', () => {
        expect(() => assertAcceptableKdfParams(shipped)).not.toThrow();
    });

    it('rejects a tab-killing memory ask', () => {
        expect(() => assertAcceptableKdfParams({ ...shipped, kdf_n: 1 << 24 })).toThrow(
            /key-derivation/
        );
    });

    it('rejects a huge r, which multiplies memory just as N does', () => {
        expect(() => assertAcceptableKdfParams({ ...shipped, kdf_r: 4096 })).toThrow();
    });

    it('rejects a huge p, which multiplies CPU time', () => {
        expect(() => assertAcceptableKdfParams({ ...shipped, kdf_p: 9999 })).toThrow();
    });

    it('rejects a downgraded factor', () => {
        expect(() => assertAcceptableKdfParams({ ...shipped, kdf_n: 2 })).toThrow();
    });

    it('rejects a non-power-of-two N, which fails inside scrypt otherwise', () => {
        expect(() => assertAcceptableKdfParams({ ...shipped, kdf_n: (1 << 17) + 1 })).toThrow();
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects N = %s',
        (kdf_n: number) => {
            expect(() => assertAcceptableKdfParams({ ...shipped, kdf_n })).toThrow();
        }
    );

    it('rejects a string arriving from parsed JSON', () => {
        expect(() =>
            assertAcceptableKdfParams({ ...shipped, kdf_n: '131072' } as unknown as typeof shipped)
        ).toThrow();
    });
});
