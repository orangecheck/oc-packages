/**
 * Handing the vault key from one device to another: an X25519 sealed box to the
 * receiving device's key, as oc-vault-web stores it in `vault_device_grants`.
 *
 *   ephemeral X25519 keypair
 *     → x25519Shared(eph_sk, device_pk)                       ECDH
 *     → hkdf-sha256(shared, salt=device_pk, info)             KEK
 *     → AES-256-GCM(vault key, KEK, aad=device_id)            sealed
 */

import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    b64urlDecode,
    b64urlEncode,
    hexDecode,
    hexEncode,
    hkdfSha256,
    randomBytesN,
    sha256Bytes,
    utf8Encode,
    x25519PublicFromSecret,
    x25519Shared,
} from '@orangecheck/lock-crypto';

const GRANT_INFO = utf8Encode('oc-vault/device-key-grant/v1');
const NONCE_LEN = 12;

/** A vault key sealed to one device. Opaque to anyone without that device's secret key. */
export interface DeviceGrant {
    /** hex(32-byte ephemeral X25519 public key) */
    eph_pk: string;
    /** b64url(12-byte nonce) */
    nonce: string;
    /** b64url(AES-256-GCM(vault key)) */
    ciphertext: string;
}

/** Seal `key` to the device `deviceId` whose X25519 public key is `devicePkHex`. */
export function sealKeyToDevice(
    key: Uint8Array,
    deviceId: string,
    devicePkHex: string
): DeviceGrant {
    const devicePk = hexDecode(devicePkHex);
    const ephSk = randomBytesN(32);
    const shared = x25519Shared(ephSk, devicePk);
    const kek = hkdfSha256(shared, devicePk, GRANT_INFO, 32);
    const nonce = randomBytesN(NONCE_LEN);
    return {
        eph_pk: hexEncode(x25519PublicFromSecret(ephSk)),
        nonce: b64urlEncode(nonce),
        ciphertext: b64urlEncode(aesGcmEncrypt(kek, nonce, key, utf8Encode(deviceId))),
    };
}

/** Open a grant with this device's id and X25519 secret key. Throws if it was sealed elsewhere. */
export function openDeviceGrant(
    grant: DeviceGrant,
    deviceId: string,
    deviceSk: Uint8Array
): Uint8Array {
    const myPk = x25519PublicFromSecret(deviceSk);
    const shared = x25519Shared(deviceSk, hexDecode(grant.eph_pk));
    const kek = hkdfSha256(shared, myPk, GRANT_INFO, 32);
    return aesGcmDecrypt(
        kek,
        b64urlDecode(grant.nonce),
        b64urlDecode(grant.ciphertext),
        utf8Encode(deviceId)
    );
}

/** A short fingerprint of a device public key for people to compare: `ABCD-1234`. */
export function deviceFingerprint(devicePkHex: string): string {
    const fp = hexEncode(sha256Bytes(hexDecode(devicePkHex)).slice(0, 4));
    return fp.replace(/(.{4})(.{4})/, '$1-$2').toUpperCase();
}
