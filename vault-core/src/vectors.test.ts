import { readFileSync } from 'node:fs';

import { b64urlDecode, hexDecode, hexEncode } from '@orangecheck/lock-crypto';
import { describe, expect, it } from 'vitest';

import {
    SCRYPT_PARAMS,
    WrongPassphrase,
    assertAcceptableKdfParams,
    createEncryptedBackup,
    decryptFields,
    deviceFingerprint,
    encryptFields,
    generateRecoveryCode,
    normalizeRecoveryCode,
    openDeviceGrant,
    packEntryForCloud,
    parseExport,
    restoreEncryptedBackup,
    sealKeyToDevice,
    unpackEntryFromCloud,
    unwrapKeyUnderKey,
    unwrapVaultKey,
    wrapKeyUnderKey,
    wrapVaultKey,
} from './index';

// Blob format v1, written by oc-vault-web: the code that wrote every stored
// vault. Readers here must open each one, and writers must emit the same shapes.
const V = JSON.parse(
    readFileSync(new URL('../vectors/blob-v1.json', import.meta.url), 'utf8')
);
const KEY = hexDecode(V.vault_key_hex);
const SLOW = 60_000;

const keys = (o: object) => Object.keys(o).sort();

describe('blob format v1: reading what vault.ochk.io wrote', () => {
    it('unwraps the passphrase wrap, and refuses a wrong passphrase', () => {
        const { wrapped, passphrase } = V.passphrase_wrap;
        expect(hexEncode(unwrapVaultKey(wrapped, passphrase))).toBe(V.vault_key_hex);
        expect(() => unwrapVaultKey(wrapped, 'not it')).toThrow(WrongPassphrase);
    }, SLOW);

    it('normalizes recovery codes and unwraps the recovery wrap', () => {
        expect(normalizeRecoveryCode(V.recovery_wrap.code)).toBe(V.recovery_wrap.normalized);
        for (const [input, out] of V.recovery_normalize) {
            expect(normalizeRecoveryCode(input)).toBe(out);
        }
        expect(hexEncode(unwrapVaultKey(V.recovery_wrap.wrapped, V.recovery_wrap.normalized))).toBe(
            V.vault_key_hex
        );
    }, SLOW);

    it('unwraps a key wrapped under the vault key', () => {
        expect(hexEncode(unwrapKeyUnderKey(V.key_under_key.wrapped, KEY))).toBe(
            V.key_under_key.inner_key_hex
        );
    });

    it('decrypts entry fields and unpacks a cloud blob', () => {
        expect(decryptFields(V.entry_fields.entry, KEY)).toEqual(V.entry_fields.fields);
        expect(unpackEntryFromCloud(V.cloud_blob.payload, KEY)).toEqual(V.cloud_blob.entry);
    });

    it('opens a device grant on its device only, and fingerprints the device key', () => {
        const g = V.device_grant;
        expect(hexEncode(openDeviceGrant(g.grant, g.device_id, hexDecode(g.device_sk_hex)))).toBe(
            V.vault_key_hex
        );
        const sk = hexDecode(g.device_sk_hex);
        expect(() => openDeviceGrant(g.grant, 'f'.repeat(32), sk)).toThrow();
        expect(deviceFingerprint(g.device_pk_hex)).toBe(g.fingerprint);
    });

    it('restores the encrypted backup', () => {
        const r = restoreEncryptedBackup(V.backup.file, V.backup.passphrase);
        expect(hexEncode(r.vaultKey)).toBe(V.vault_key_hex);
        expect(r.entries).toEqual(V.backup.entries);
        expect(() => restoreEncryptedBackup(V.backup.file, 'wrong passphrase')).toThrow();
    }, SLOW);

    it('parses the portable export', () => {
        expect(parseExport(V.export.file).entries).toEqual(V.export.file.entries);
    });

    it('accepts exactly the work factors vault.ochk.io accepts', () => {
        for (const row of V.kdf_bounds) {
            let accepted = true;
            try {
                assertAcceptableKdfParams({ kdf_n: row.N, kdf_r: row.r, kdf_p: row.p });
            } catch {
                accepted = false;
            }
            expect([row.N, row.r, row.p, accepted]).toEqual([row.N, row.r, row.p, row.accepted]);
        }
    });
});

describe('blob format v1: writing the same shapes', () => {
    it('wraps a vault key as the passphrase wrap is stored', () => {
        const w = wrapVaultKey(KEY, 'another passphrase');
        expect(keys(w)).toEqual(keys(V.passphrase_wrap.wrapped));
        const { N, r, p } = SCRYPT_PARAMS;
        expect([w.kdf, w.kdf_n, w.kdf_r, w.kdf_p]).toEqual(['scrypt', N, r, p]);
        expect([w.kdf_n, w.kdf_r, w.kdf_p]).toEqual([
            V.passphrase_wrap.wrapped.kdf_n,
            V.passphrase_wrap.wrapped.kdf_r,
            V.passphrase_wrap.wrapped.kdf_p,
        ]);
        expect(b64urlDecode(w.kdf_salt)).toHaveLength(16);
        expect(b64urlDecode(w.wrap_nonce)).toHaveLength(12);
        expect(hexEncode(unwrapVaultKey(w, 'another passphrase'))).toBe(V.vault_key_hex);
        expect(() => wrapVaultKey(KEY.slice(1), 'x')).toThrow();
    }, SLOW);

    it('generates recovery codes in the stored form', () => {
        const code = generateRecoveryCode();
        expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
        expect(code).toMatch(/^.{4}-.{4}-.{4}-.{4}-.{4}-.{4}$/);
        expect(V.recovery_wrap.code).toMatch(/^.{4}-.{4}-.{4}-.{4}-.{4}-.{4}$/);
        const once = normalizeRecoveryCode(code);
        expect(normalizeRecoveryCode(once)).toBe(once);
        expect(generateRecoveryCode()).not.toBe(code);
    });

    it('wraps a key under a key, seals to a device, and packs entries in the stored shapes', () => {
        const team = hexDecode(V.key_under_key.inner_key_hex);
        const w = wrapKeyUnderKey(team, KEY);
        expect(keys(w)).toEqual(keys(V.key_under_key.wrapped));
        expect(unwrapKeyUnderKey(w, KEY)).toEqual(team);

        const g = V.device_grant;
        const grant = sealKeyToDevice(KEY, g.device_id, g.device_pk_hex);
        expect(keys(grant)).toEqual(keys(g.grant));
        expect(openDeviceGrant(grant, g.device_id, hexDecode(g.device_sk_hex))).toEqual(KEY);

        const sealed = encryptFields(V.entry_fields.fields, KEY);
        expect(decryptFields(sealed, KEY)).toEqual(V.entry_fields.fields);
        const blob = packEntryForCloud(V.cloud_blob.entry, KEY);
        expect(keys(JSON.parse(blob))).toEqual(keys(JSON.parse(V.cloud_blob.payload)));
        expect(unpackEntryFromCloud(blob, KEY)).toEqual(V.cloud_blob.entry);
    });

    it('writes a backup file in the stored shape', () => {
        const file = createEncryptedBackup(V.backup.entries, KEY, 'a backup passphrase');
        expect(keys(file)).toEqual(keys(V.backup.file));
        expect(file.scrypt).toEqual(V.backup.file.scrypt);
        const r = restoreEncryptedBackup(file, 'a backup passphrase');
        expect(r.vaultKey).toEqual(KEY);
        expect(r.entries).toEqual(V.backup.entries);
        expect(() => createEncryptedBackup([], KEY, 'short')).toThrow();
    }, SLOW);

    it('refuses a backup that names work factors outside the range', () => {
        const file = { ...V.backup.file, scrypt: { N: 1 << 24, r: 8, p: 1 } };
        expect(() => restoreEncryptedBackup(file, V.backup.passphrase)).toThrow(
            'unsupported key-derivation parameters'
        );
    });
});
