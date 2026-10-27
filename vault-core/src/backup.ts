/**
 * The encrypted backup file: the vault key and every entry, sealed under a
 * passphrase the person picks (scrypt, then AES-256-GCM). It restores on any
 * device with no server, which a plain export cannot: an export carries the
 * entries but not the key that opens them.
 */

import { scrypt } from '@noble/hashes/scrypt';

import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    b64urlDecode,
    b64urlEncode,
    randomBytesN,
    utf8Decode,
    utf8Encode,
} from '@orangecheck/lock-crypto';

import { assertAcceptableKdfParams, type VaultEntry } from './crypto';
import { SCRYPT_PARAMS } from './keys';

export const BACKUP_FORMAT = 'oc-vault-backup' as const;
export const BACKUP_VERSION = 1 as const;

const KEY_LEN = 32;
const SALT_LEN = 16;
const NONCE_LEN = 12;

export interface EncryptedBackup {
    format: typeof BACKUP_FORMAT;
    version: typeof BACKUP_VERSION;
    kdf: 'scrypt';
    scrypt: { N: number; r: number; p: number };
    /** b64url(16-byte salt) */
    salt: string;
    /** b64url(12-byte nonce) */
    nonce: string;
    /** b64url(AES-256-GCM(JSON({ vault_key, entries }))) */
    ciphertext: string;
    created_at: string;
    entry_count: number;
}

export interface RestoredBackup {
    vaultKey: Uint8Array;
    entries: VaultEntry[];
}

function deriveKey(passphrase: string, salt: Uint8Array, p: { N: number; r: number; p: number }) {
    return scrypt(utf8Encode(passphrase), salt, { N: p.N, r: p.r, p: p.p, dkLen: KEY_LEN });
}

/** Seal the vault key and `entries` under `passphrase` (at least 8 characters). */
export function createEncryptedBackup(
    entries: VaultEntry[],
    vaultKey: Uint8Array,
    passphrase: string
): EncryptedBackup {
    if (passphrase.length < 8) throw new Error('passphrase must be at least 8 characters');
    const salt = randomBytesN(SALT_LEN);
    const nonce = randomBytesN(NONCE_LEN);
    const params = { ...SCRYPT_PARAMS };
    const payload = { vault_key: b64urlEncode(vaultKey), entries };
    const key = deriveKey(passphrase, salt, params);
    const ct = aesGcmEncrypt(key, nonce, utf8Encode(JSON.stringify(payload)));
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        kdf: 'scrypt',
        scrypt: params,
        salt: b64urlEncode(salt),
        nonce: b64urlEncode(nonce),
        ciphertext: b64urlEncode(ct),
        created_at: new Date().toISOString(),
        entry_count: entries.length,
    };
}

/**
 * Open a backup. The file names its own work factors, so they are checked
 * before any memory is spent (`assertAcceptableKdfParams`). Throws on a wrong
 * passphrase or a damaged file.
 */
export function restoreEncryptedBackup(
    backup: EncryptedBackup,
    passphrase: string
): RestoredBackup {
    if (backup.format !== BACKUP_FORMAT) throw new Error('not an OC Vault encrypted backup');
    if (backup.version !== BACKUP_VERSION) {
        throw new Error(`unsupported backup version: ${String(backup.version)}`);
    }
    const params = backup.scrypt ?? SCRYPT_PARAMS;
    assertAcceptableKdfParams({ kdf_n: params.N, kdf_r: params.r, kdf_p: params.p });
    let plaintext: Uint8Array;
    try {
        plaintext = aesGcmDecrypt(
            deriveKey(passphrase, b64urlDecode(backup.salt), params),
            b64urlDecode(backup.nonce),
            b64urlDecode(backup.ciphertext)
        );
    } catch {
        throw new Error('wrong passphrase, or the backup file is corrupt');
    }
    const payload = JSON.parse(utf8Decode(plaintext)) as { vault_key: string; entries?: unknown };
    return {
        vaultKey: b64urlDecode(payload.vault_key),
        entries: Array.isArray(payload.entries) ? (payload.entries as VaultEntry[]) : [],
    };
}

/** A parsed JSON value that is a backup file, not a plain export. */
export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { format?: unknown }).format === BACKUP_FORMAT
    );
}
