import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';

import { addressFromPrivateKey, signMessage, verifySignature } from '../src/index';
// The finalized BIP-322's own vectors: bitcoin/bips bip-0322/*.json at d77863fb9e9b.
import basic from './fixtures/bip322-official-basic.json';
import generated from './fixtures/bip322-official-generated.json';

interface SimpleVector {
    message: string;
    private_keys: string[];
    address: string;
    type: string;
    bip322_signatures: string[];
}
interface ErrorVector {
    description: string;
    message: string;
    address: string;
    signature: string;
}

const simple = [...basic.simple, ...generated.simple] as SimpleVector[];
const errors = [...basic.error, ...generated.error] as ErrorVector[];
const signable = simple.filter((v) => v.type === 'p2wpkh' || v.type === 'p2tr');
const unprefix = (s: string) => s.replace(/^smp/, '');
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('official BIP-322 vectors', () => {
    it('verifies every P2WPKH and P2TR simple signature, prefixed or not', () => {
        expect(signable.length).toBe(5); // 3 P2WPKH, 2 P2TR
        for (const v of signable) {
            for (const sig of v.bip322_signatures) {
                expect(verifySignature(v.address, v.message, sig), `${v.type} ${sig}`).toBe(true);
                expect(verifySignature(v.address, v.message, unprefix(sig))).toBe(true);
            }
        }
    });

    it('rejects every error vector', () => {
        for (const e of errors) expect(verifySignature(e.address, e.message, e.signature), e.description).toBe(false);
    });

    it('signs P2WPKH byte for byte (RFC 6979, as the generated vectors)', () => {
        const p2wpkh = signable.filter((v) => v.type === 'p2wpkh');
        expect(p2wpkh.length).toBe(3);
        for (const v of p2wpkh) {
            const sig = signMessage(v.address, v.message, v.private_keys[0]!, { prefixed: true });
            expect(v.bip322_signatures).toContain(sig);
        }
    });

    it('derives each vector address from its key, and signs P2TR signatures that verify', () => {
        for (const v of signable) {
            const key = v.private_keys[0]!;
            expect(addressFromPrivateKey(key, v.type as 'p2wpkh' | 'p2tr')).toBe(v.address);
            const sig = signMessage(v.address, v.message, key);
            expect(verifySignature(v.address, v.message, sig)).toBe(true);
            expect(verifySignature(v.address, v.message + '!', sig)).toBe(false);
        }
    });

    it('signs P2TR deterministically when given aux randomness', () => {
        const v = signable.find((x) => x.type === 'p2tr')!;
        const aux = new Uint8Array(32).fill(7);
        const a = signMessage(v.address, v.message, v.private_keys[0]!, { auxRand: aux });
        expect(signMessage(v.address, v.message, v.private_keys[0]!, { auxRand: aux })).toBe(a);
        expect(Buffer.from(a, 'base64').length).toBe(66); // one 64-byte item: SIGHASH_DEFAULT
    });
});

describe('signMessage', () => {
    it('round-trips random keys and messages through verifySignature', () => {
        for (let i = 0; i < 24; i++) {
            const key = secp256k1.utils.randomSecretKey();
            const type = i % 2 ? 'p2tr' : 'p2wpkh';
            const address = addressFromPrivateKey(key, type);
            const message = i % 3 ? `oc-stamp id ${i}` : '';
            const sig = signMessage(address, message, key, { prefixed: i % 4 === 0 });
            expect(verifySignature(address, message, sig)).toBe(true);
        }
    });

    it('takes the key as bytes, hex or WIF, and signs the same', () => {
        const wif = basic.simple[0]!.private_keys[0]!;
        const address = basic.simple[0]!.address;
        const fromWif = signMessage(address, 'x', wif);
        const bytes = new Uint8Array(32);
        // Recover the raw key by deriving through the hex path that matches the WIF's address.
        const raw = Buffer.from(fromWifToHex(wif), 'hex');
        bytes.set(raw);
        expect(signMessage(address, 'x', hex(bytes))).toBe(fromWif);
        expect(signMessage(address, 'x', bytes)).toBe(fromWif);
    });

    it("refuses another key's address, and its signature does not verify there", () => {
        const a = secp256k1.utils.randomSecretKey();
        const b = secp256k1.utils.randomSecretKey();
        for (const type of ['p2wpkh', 'p2tr'] as const) {
            const addrA = addressFromPrivateKey(a, type);
            expect(() => signMessage(addrA, 'm', b)).toThrow(/not the key of this address/);
            const sigB = signMessage(addressFromPrivateKey(b, type), 'm', b);
            expect(verifySignature(addrA, 'm', sigB)).toBe(false);
        }
    });

    it('refuses address types it cannot sign for, and bad keys', () => {
        const key = secp256k1.utils.randomSecretKey();
        expect(() => signMessage('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'm', key)).toThrow(/P2WPKH and P2TR/);
        expect(() => signMessage(addressFromPrivateKey(key, 'p2wpkh'), 'm', 'not-a-key')).toThrow(/private key/);
        expect(() => signMessage(addressFromPrivateKey(key, 'p2wpkh'), 'm', new Uint8Array(32))).toThrow(/invalid private key/);
    });
});

// A WIF's 32 key bytes, via base58check, for the bytes/hex equivalence test.
function fromWifToHex(wif: string): string {
    const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = 0n;
    for (const c of wif) n = n * 58n + BigInt(ALPHA.indexOf(c));
    const full = n.toString(16).padStart(76, '0'); // 1 + 32 + 1 + 4 bytes
    return full.slice(2, 66);
}
