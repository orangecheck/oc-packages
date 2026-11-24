import { describe, expect, it } from 'vitest';

import { fromB64url, toB64url } from '../src/bytes';
import { deriveIdentity, secretToMnemonic } from '../src/derive';
import { lockAad, lockWithPasskey, lockWithPhrase, openWithPasskey, openWithPhrase, PRF_SALT } from '../src/lock';

const I = new Uint8Array(32).fill(1);
const W = new Uint8Array(32).fill(2);
const PRF = new Uint8Array(32).fill(3);
const CRED = new Uint8Array([9, 8, 7, 6]);
const DID = 'did:oc:0123456789abcdef0123456789abcdef';

describe('the passkey lock', () => {
    const copy = lockWithPasskey({ identitySecret: I, walletSecret: W, prfOutput: PRF, credentialId: CRED, didOc: DID });

    it('stores the context in the clear and nothing secret', () => {
        expect(copy).toMatchObject({ v: 1, method: 'passkey', did_oc: DID, address: deriveIdentity(I).address });
        expect(fromB64url(copy.credential_id!)).toEqual(CRED);
        expect(fromB64url(copy.nonce)!.length).toBe(12);
        expect(fromB64url(copy.ciphertext)!.length).toBe(64 + 16);
    });

    it('opens with its PRF output, and with nothing else', () => {
        const r = openWithPasskey(copy, PRF);
        expect(r.ok && r.identitySecret).toEqual(I);
        expect(r.ok && r.walletSecret).toEqual(W);
        expect(openWithPasskey(copy, new Uint8Array(32).fill(4))).toEqual({ ok: false, reason: 'lock_open_failed' });
    });

    it('draws a fresh nonce each time', () => {
        const again = lockWithPasskey({ identitySecret: I, walletSecret: W, prfOutput: PRF, credentialId: CRED, didOc: DID });
        expect(again.nonce).not.toBe(copy.nonce);
        expect(again.ciphertext).not.toBe(copy.ciphertext);
    });

    it('binds version, method, did:oc, credential id and address in that order', () => {
        expect(new TextDecoder().decode(lockAad(copy))).toBe(
            `oc-keys:lock:v1\nmethod: passkey\ndid_oc: ${DID}\ncredential_id: ${toB64url(CRED)}\naddress: ${copy.address}\n`
        );
    });

    it('refuses a malformed copy without throwing', () => {
        for (const bad of [
            null,
            'x',
            [],
            { ...copy, v: 2 },
            { ...copy, method: 'phrase' },
            { ...copy, extra: 1 },
            { ...copy, nonce: toB64url(new Uint8Array(11)) },
            { ...copy, nonce: `${copy.nonce}=` },
            { ...copy, credential_id: '' },
            { ...copy, did_oc: DID.toUpperCase() },
            { ...copy, address: copy.address.toUpperCase() },
        ]) {
            expect(openWithPasskey(bad, PRF)).toEqual({ ok: false, reason: 'malformed' });
        }
        expect(openWithPasskey(copy, new Uint8Array(31))).toEqual({ ok: false, reason: 'malformed' });
    });

    it('refuses to lock bad inputs', () => {
        const base = { identitySecret: I, walletSecret: W, prfOutput: PRF, credentialId: CRED, didOc: DID };
        expect(() => lockWithPasskey({ ...base, walletSecret: I })).toThrow(/must not be the identity secret/);
        expect(() => lockWithPasskey({ ...base, didOc: 'did:oc:xyz' })).toThrow(TypeError);
        expect(() => lockWithPasskey({ ...base, prfOutput: new Uint8Array(16) })).toThrow(TypeError);
        expect(() => lockWithPasskey({ ...base, credentialId: new Uint8Array(0) })).toThrow(TypeError);
        expect(() => lockWithPasskey({ ...base, identitySecret: new Uint8Array(31) })).toThrow(TypeError);
    });

    it('asks every passkey for one fixed PRF input', () => {
        expect(PRF_SALT.length).toBe(32);
    });
});

describe('the phrase lock', () => {
    const copy = lockWithPhrase({ identitySecret: I, walletSecret: W, didOc: DID });
    const phrase = secretToMnemonic(W);

    it('locks only I; the phrase itself is W', () => {
        expect(copy.method).toBe('phrase');
        expect('credential_id' in copy).toBe(false);
        expect(fromB64url(copy.ciphertext)!.length).toBe(32 + 16);
        const r = openWithPhrase(copy, phrase);
        expect(r.ok && r.identitySecret).toEqual(I);
        expect(r.ok && r.walletSecret).toEqual(W);
    });

    it('refuses other words, bad words and a passkey copy', () => {
        expect(openWithPhrase(copy, secretToMnemonic(new Uint8Array(32).fill(5)))).toEqual({
            ok: false,
            reason: 'lock_open_failed',
        });
        expect(openWithPhrase(copy, 'not a phrase')).toEqual({ ok: false, reason: 'phrase_invalid' });
        const passkeyCopy = lockWithPasskey({ identitySecret: I, walletSecret: W, prfOutput: PRF, credentialId: CRED, didOc: DID });
        expect(openWithPhrase(passkeyCopy, phrase)).toEqual({ ok: false, reason: 'malformed' });
        expect(openWithPasskey(copy, PRF)).toEqual({ ok: false, reason: 'malformed' });
    });
});
