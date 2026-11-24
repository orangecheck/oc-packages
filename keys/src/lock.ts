// The lock (README §3). Every unlock method opens the same pair {I, W}: a
// passkey's PRF output opens a copy of both, and the recovery phrase is W's
// own words plus a copy of I locked under a key derived from W. Nothing is
// derived from a passkey; it only locks random secrets.
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

import { concat, equal, fromB64url, toB64url, utf8 } from './bytes';
import { deriveIdentity, mnemonicToSecret } from './derive';
import { isDidOc } from './records';

/** The one PRF eval input every lock passkey is asked for: SHA-256("oc-keys/v1 prf"). */
export const PRF_SALT: Uint8Array = sha256(utf8('oc-keys/v1 prf'));

const LOCK_HEADER = 'oc-keys:lock:v1';
const PASSKEY_INFO = utf8('oc-keys/v1 passkey kek');
const PHRASE_INFO = utf8('oc-keys/v1 phrase kek');

export type LockMethod = 'passkey' | 'phrase';

/** A locked copy as ochk.io stores it. It cannot open it. */
export interface LockedCopy {
    v: 1;
    method: LockMethod;
    did_oc: string;
    /** The passkey's credential id, unpadded base64url. Passkey copies only. */
    credential_id?: string;
    /** The identity address the secrets inside derive. */
    address: string;
    /** 12 bytes, unpadded base64url. */
    nonce: string;
    /** AES-256-GCM ciphertext and tag, unpadded base64url. */
    ciphertext: string;
}

export type OpenFailure =
    | 'malformed' // not a locked copy of this version and method
    | 'lock_open_failed' // wrong key, or the copy or its fields were changed
    | 'bundle_address_mismatch' // it opened, but I does not derive the copy's address
    | 'phrase_invalid'; // not 24 valid English words

/** HKDF-SHA256 of the PRF output; the key that locks the passkey copy. */
export function passkeyKek(prfOutput: Uint8Array): Uint8Array {
    if (!(prfOutput instanceof Uint8Array) || prfOutput.length !== 32) {
        throw new TypeError('PRF output must be 32 bytes');
    }
    return hkdf(sha256, prfOutput, new Uint8Array(0), PASSKEY_INFO, 32);
}

/** HKDF-SHA256 of W; the key that locks the copy of I the phrase opens. */
export function phraseKek(walletSecret: Uint8Array): Uint8Array {
    return hkdf(sha256, walletSecret, new Uint8Array(0), PHRASE_INFO, 32);
}

/** The additional data a copy is sealed under, rebuilt from the copy's own fields. */
export function lockAad(copy: Pick<LockedCopy, 'method' | 'did_oc' | 'credential_id' | 'address'>): Uint8Array {
    const lines = [LOCK_HEADER, `method: ${copy.method}`, `did_oc: ${copy.did_oc}`];
    if (copy.method === 'passkey') lines.push(`credential_id: ${copy.credential_id}`);
    lines.push(`address: ${copy.address}`);
    return utf8(lines.join('\n') + '\n');
}

function newNonce(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12));
}

function check32(s: Uint8Array, what: string): void {
    if (!(s instanceof Uint8Array) || s.length !== 32) throw new TypeError(`${what} must be 32 bytes`);
}

function checkContext(didOc: string, identitySecret: Uint8Array, walletSecret: Uint8Array): string {
    if (!isDidOc(didOc)) throw new TypeError('did_oc must be did:oc: and 32 lowercase hex digits');
    check32(identitySecret, 'identity secret');
    check32(walletSecret, 'wallet secret');
    // Two draws, never one: W under I's bytes would put money on a key orangecheck may have held.
    if (equal(identitySecret, walletSecret)) throw new TypeError('the wallet secret must not be the identity secret');
    return deriveIdentity(identitySecret).address;
}

/** Lock {I, W} under one passkey. Every passkey of the account locks the same pair. */
export function lockWithPasskey(args: {
    identitySecret: Uint8Array;
    walletSecret: Uint8Array;
    prfOutput: Uint8Array;
    credentialId: Uint8Array;
    didOc: string;
    /** Only for reproducible vectors; leave it out. */
    nonce?: Uint8Array;
}): LockedCopy {
    const address = checkContext(args.didOc, args.identitySecret, args.walletSecret);
    if (!(args.credentialId instanceof Uint8Array) || args.credentialId.length === 0) {
        throw new TypeError('credential id must be bytes');
    }
    const nonce = args.nonce ?? newNonce();
    const head = {
        method: 'passkey' as const,
        did_oc: args.didOc,
        credential_id: toB64url(args.credentialId),
        address,
    };
    const ct = gcm(passkeyKek(args.prfOutput), nonce, lockAad(head)).encrypt(
        concat(args.identitySecret, args.walletSecret)
    );
    return { v: 1, ...head, nonce: toB64url(nonce), ciphertext: toB64url(ct) };
}

/** Lock a copy of I under W, for the recovery phrase to open. */
export function lockWithPhrase(args: {
    identitySecret: Uint8Array;
    walletSecret: Uint8Array;
    didOc: string;
    /** Only for reproducible vectors; leave it out. */
    nonce?: Uint8Array;
}): LockedCopy {
    const address = checkContext(args.didOc, args.identitySecret, args.walletSecret);
    const nonce = args.nonce ?? newNonce();
    const head = { method: 'phrase' as const, did_oc: args.didOc, address };
    const ct = gcm(phraseKek(args.walletSecret), nonce, lockAad(head)).encrypt(args.identitySecret);
    return { v: 1, ...head, nonce: toB64url(nonce), ciphertext: toB64url(ct) };
}

const ADDRESS = /^bc1q[02-9ac-hj-np-z]{38}$/;
const COPY_KEYS: Record<LockMethod, string[]> = {
    passkey: ['address', 'ciphertext', 'credential_id', 'did_oc', 'method', 'nonce', 'v'],
    phrase: ['address', 'ciphertext', 'did_oc', 'method', 'nonce', 'v'],
};

type Opened = { ok: true; identitySecret: Uint8Array; walletSecret: Uint8Array } | { ok: false; reason: OpenFailure };

function readCopy(copy: unknown, method: LockMethod): { nonce: Uint8Array; ct: Uint8Array; c: LockedCopy } | null {
    if (!copy || typeof copy !== 'object') return null;
    const c = copy as LockedCopy;
    const keys = Object.keys(c).sort();
    if (keys.join() !== COPY_KEYS[method].join()) return null;
    if (c.v !== 1 || c.method !== method || !isDidOc(c.did_oc) || typeof c.address !== 'string' || !ADDRESS.test(c.address)) {
        return null;
    }
    if (method === 'passkey') {
        const id = fromB64url(c.credential_id as string);
        if (!id || id.length === 0) return null;
    }
    const nonce = fromB64url(c.nonce);
    const ct = fromB64url(c.ciphertext);
    if (!nonce || nonce.length !== 12 || !ct) return null;
    return { nonce, ct, c };
}

function decrypt(key: Uint8Array, nonce: Uint8Array, aad: Uint8Array, ct: Uint8Array): Uint8Array | null {
    try {
        return gcm(key, nonce, aad).decrypt(ct);
    } catch {
        return null;
    }
}

/** Open a passkey copy with that passkey's PRF output. Never throws on a bad copy. */
export function openWithPasskey(copy: unknown, prfOutput: Uint8Array): Opened {
    const read = readCopy(copy, 'passkey');
    if (!read || !(prfOutput instanceof Uint8Array) || prfOutput.length !== 32) return { ok: false, reason: 'malformed' };
    const plain = decrypt(passkeyKek(prfOutput), read.nonce, lockAad(read.c), read.ct);
    if (!plain || plain.length !== 64) return { ok: false, reason: 'lock_open_failed' };
    const identitySecret = plain.slice(0, 32);
    if (deriveIdentity(identitySecret).address !== read.c.address) return { ok: false, reason: 'bundle_address_mismatch' };
    return { ok: true, identitySecret, walletSecret: plain.slice(32) };
}

/** Open the phrase copy with the 24 words, which are W. Never throws on a bad copy or phrase. */
export function openWithPhrase(copy: unknown, mnemonic: string): Opened {
    const read = readCopy(copy, 'phrase');
    if (!read) return { ok: false, reason: 'malformed' };
    const walletSecret = mnemonicToSecret(mnemonic);
    if (!walletSecret) return { ok: false, reason: 'phrase_invalid' };
    const plain = decrypt(phraseKek(walletSecret), read.nonce, lockAad(read.c), read.ct);
    if (!plain || plain.length !== 32) return { ok: false, reason: 'lock_open_failed' };
    if (deriveIdentity(plain).address !== read.c.address) return { ok: false, reason: 'bundle_address_mismatch' };
    return { ok: true, identitySecret: plain, walletSecret };
}
