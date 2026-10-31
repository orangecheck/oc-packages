/**
 * The generator that wrote vectors/blob-v1.json.
 *
 * It runs inside oc-vault-web at 2aa297a, the last commit whose own code wrote
 * every stored vault (before vault-web moved onto this package), so the
 * vectors are what production wrote, not what this package writes:
 *
 *   cp scripts/gen-blob-v1.vault-web.ts <oc-vault-web>/src/zz-gen-vectors.test.ts
 *   cd <oc-vault-web> && OUT=/tmp/blob-v1.json npx vitest run src/zz-gen-vectors.test.ts
 *
 * Fixed inputs: the passphrases, the entry fields and metadata, the
 * timestamps, the recovery-code normalization inputs and the work-factor grid.
 * Random inputs, drawn fresh on every run: the vault key, the team key, the
 * device key and id, the entry id, the recovery code, and every salt, nonce
 * and ephemeral key. A rerun therefore writes a different file that tests the
 * same format. The committed file is the pin; the tests read it, and do not
 * expect a rerun to match it byte for byte.
 */
import { writeFileSync } from 'node:fs';

import { it } from 'vitest';

import { hexEncode, randomBytesN, x25519PublicFromSecret } from '@orangecheck/lock-crypto';

import { createEncryptedBackup } from '@/lib/backup';
import { wrapVaultKey as sealToDevice } from '@/lib/devicesync';
import { deviceFingerprint } from '@/lib/fingerprint';
import { buildExport } from '@/lib/export';
import { assertAcceptableScryptParams } from '@/lib/kdf-params';
import { packEntryForCloud } from '@/lib/sync';
import { encryptFields, type VaultEntry } from '@/lib/vault';
import {
    generateRecoveryCode,
    normalizeRecoveryCode,
    wrapKey,
    wrapKeyUnderKey,
} from '@/lib/vault-key';

it('writes vectors', () => {
    const key = randomBytesN(32);
    const passphrase = 'correct horse battery staple vault';
    const recoveryCode = generateRecoveryCode();
    const teamKey = randomBytesN(32);
    const fields = {
        username: 'satoshi@example.com',
        password: 'p4ss-wörd ✓ "quoted"',
        url: 'https://example.com/login',
        notes: 'line one\nline two',
    };
    const sealed = encryptFields(fields, key);
    const entry: VaultEntry = {
        id: hexEncode(randomBytesN(16)),
        type: 'password',
        name: 'Example login',
        nonce: sealed.nonce,
        ciphertext: sealed.ciphertext,
        created_at: '2026-10-27T12:00:00.000Z',
        updated_at: '2026-10-27T12:30:00.000Z',
        favorite: true,
        tags: ['work'],
        folder: 'Logins',
    };
    const deviceSk = randomBytesN(32);
    const devicePk = hexEncode(x25519PublicFromSecret(deviceSk));
    const deviceId = hexEncode(randomBytesN(16));
    const backupPassphrase = 'a backup passphrase';
    const grid: Array<{ N: number; r: number; p: number; accepted: boolean }> = [];
    for (const N of [0, 2, 3, 1 << 13, 1 << 14, (1 << 17) | 1, 1 << 17, 1 << 20, 1 << 21]) {
        for (const r of [0, 1, 8, 16, 17, 32]) {
            for (const p of [0, 1, 4, 5, 16]) {
                let accepted = true;
                try {
                    assertAcceptableScryptParams({ N, r, p });
                } catch {
                    accepted = false;
                }
                grid.push({ N, r, p, accepted });
            }
        }
    }
    const out = {
        format: 'oc-vault-blob-vectors',
        version: 1,
        note: 'Written by oc-vault-web 2aa297a, the code that wrote every production blob. Readers must open each one; writers must produce the same shapes.',
        vault_key_hex: hexEncode(key),
        passphrase_wrap: { passphrase, wrapped: wrapKey(key, passphrase) },
        recovery_wrap: {
            code: recoveryCode,
            normalized: normalizeRecoveryCode(recoveryCode),
            wrapped: wrapKey(key, normalizeRecoveryCode(recoveryCode)),
        },
        recovery_normalize: [
            [recoveryCode.toLowerCase(), normalizeRecoveryCode(recoveryCode)],
            ['abcd-efgh-o0il-1234', normalizeRecoveryCode('abcd-efgh-o0il-1234')],
            [' 0123 4567 89AB ', normalizeRecoveryCode(' 0123 4567 89AB ')],
        ],
        key_under_key: { inner_key_hex: hexEncode(teamKey), wrapped: wrapKeyUnderKey(teamKey, key) },
        entry_fields: { entry, fields },
        cloud_blob: { payload: packEntryForCloud(entry, key), entry },
        device_grant: {
            device_id: deviceId,
            device_sk_hex: hexEncode(deviceSk),
            device_pk_hex: devicePk,
            fingerprint: deviceFingerprint(devicePk),
            grant: sealToDevice(key, deviceId, devicePk),
        },
        backup: {
            passphrase: backupPassphrase,
            file: createEncryptedBackup([entry], key, backupPassphrase),
            entries: [entry],
        },
        export: { file: buildExport([entry], 'did:oc:example') },
        kdf_bounds: grid,
    };
    writeFileSync(process.env.OUT ?? 'blob-v1.json', JSON.stringify(out, null, 4) + '\n');
}, 120_000);
