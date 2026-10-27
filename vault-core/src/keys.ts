/**
 * Writing vault keys: the passphrase and recovery-code wraps, and a key wrapped
 * under another key (team keys under the personal vault key).
 *
 * These are the shapes oc-vault-web escrows at /api/vault-key and in its team
 * key escrow, pinned to blob format v1 by `vectors/blob-v1.json`.
 */

import { scrypt } from '@noble/hashes/scrypt';

import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    b64urlDecode,
    b64urlEncode,
    randomBytesN,
    utf8Encode,
} from '@orangecheck/lock-crypto';

import type { WrappedKey } from './crypto';

const KEY_LEN = 32;
const SALT_LEN = 16;
const NONCE_LEN = 12;

/** The scrypt work factors every wrap is written with. Inside `assertAcceptableKdfParams`. */
export const SCRYPT_PARAMS = { N: 1 << 17, r: 8, p: 1 } as const;

/**
 * Wrap a 32-byte vault key under a secret (the passphrase, or a normalized
 * recovery code): scrypt with `SCRYPT_PARAMS`, then AES-256-GCM. The inverse
 * is `unwrapVaultKey`.
 */
export function wrapVaultKey(rawKey: Uint8Array, secret: string): WrappedKey {
    if (rawKey.length !== KEY_LEN) throw new Error('vault key must be 32 bytes');
    const salt = randomBytesN(SALT_LEN);
    const nonce = randomBytesN(NONCE_LEN);
    const { N, r, p } = SCRYPT_PARAMS;
    const wrapKey = scrypt(utf8Encode(secret), salt, { N, r, p, dkLen: KEY_LEN });
    return {
        wrapped_key: b64urlEncode(aesGcmEncrypt(wrapKey, nonce, rawKey)),
        wrap_nonce: b64urlEncode(nonce),
        kdf: 'scrypt',
        kdf_salt: b64urlEncode(salt),
        kdf_n: N,
        kdf_r: r,
        kdf_p: p,
    };
}

// Crockford base32: no I, L, O or U, so a hand-copied code has no ambiguous characters.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A recovery code: 120 random bits as 24 Crockford base32 characters, `XXXX-XXXX-…`. */
export function generateRecoveryCode(): string {
    let bits = 0;
    let acc = 0;
    let out = '';
    for (const b of randomBytesN(15)) {
        acc = (acc << 8) | b;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += CROCKFORD[(acc >> bits) & 0x1f];
        }
    }
    return (out.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * The form of a recovery code that is wrapped and unwrapped under: uppercase,
 * separators dropped, and O folded to 0 and I or L to 1, so a typo still opens.
 */
export function normalizeRecoveryCode(code: string): string {
    return code
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
}

/** A key wrapped under another raw key (a team key under the vault key). */
export interface KeyWrappedUnderKey {
    /** b64url(AES-256-GCM(innerKey, outerKey)) */
    wrapped_key: string;
    /** b64url(12-byte nonce) */
    wrap_nonce: string;
}

export function wrapKeyUnderKey(innerKey: Uint8Array, outerKey: Uint8Array): KeyWrappedUnderKey {
    const nonce = randomBytesN(NONCE_LEN);
    return {
        wrapped_key: b64urlEncode(aesGcmEncrypt(outerKey, nonce, innerKey)),
        wrap_nonce: b64urlEncode(nonce),
    };
}

/** The inverse of `wrapKeyUnderKey`. Throws when `outerKey` is wrong. */
export function unwrapKeyUnderKey(w: KeyWrappedUnderKey, outerKey: Uint8Array): Uint8Array {
    return aesGcmDecrypt(outerKey, b64urlDecode(w.wrap_nonce), b64urlDecode(w.wrapped_key));
}
