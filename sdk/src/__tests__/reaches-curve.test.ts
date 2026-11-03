/**
 * reachesCurve says whether checking a signature gets as far as curve math in
 * bip322's verifySignature: check() charges its signature budget only for
 * those. Every real signature must reach it (a real one is never free, nor is
 * a forgery shaped like one), and bytes the verifier turns away up front must
 * not, so a flood of junk costs a lookup nothing.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { reachesCurve } from '../utils/signature';
import generated from './fixtures/bip322-official-generated.json';

const key = secp256k1.utils.randomSecretKey();
const P2WPKH = addressFromPrivateKey(key, 'p2wpkh');
const P2TR = addressFromPrivateKey(key, 'p2tr');
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

function bip137(message: string, flagBase: number): string {
    const msg = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode('\u0018Bitcoin Signed Message:\n');
    const hash = sha256(sha256(Uint8Array.from([...prefix, msg.length, ...msg])));
    const rec = secp256k1.sign(hash, key, { prehash: false, format: 'recovered' });
    return b64(Uint8Array.from([flagBase + rec[0]!, ...rec.subarray(1)]));
}

describe('reachesCurve', () => {
    it('is true for every real signature: the official simple vectors, with and without smp', () => {
        const simple = generated.simple.filter((s) => s.type === 'p2wpkh' || s.type === 'p2tr');
        expect(simple.length).toBeGreaterThan(0);
        for (const v of simple) {
            for (const sig of v.bip322_signatures) {
                expect(reachesCurve(v.address, sig), `${v.type} ${sig.slice(0, 12)}`).toBe(true);
                expect(reachesCurve(v.address, sig.replace(/^smp/, ''))).toBe(true);
            }
        }
    });

    it('is true for signatures made here: p2wpkh and p2tr simple, BIP-137 under every header', () => {
        for (const addr of [P2WPKH, P2TR]) {
            for (const prefixed of [false, true]) {
                expect(reachesCurve(addr, signMessage(addr, 'hello', key, { prefixed }))).toBe(true);
            }
        }
        for (const header of [27, 31, 35, 39]) expect(reachesCurve(P2WPKH, bip137('hello', header))).toBe(true);
    });

    it('is true for a forgery shaped like a signature, over another message or none', () => {
        expect(reachesCurve(P2WPKH, signMessage(P2WPKH, 'not the message', key))).toBe(true);
        expect(reachesCurve(P2TR, b64(Uint8Array.from([1, 64, ...new Uint8Array(64).fill(7)])))).toBe(true);
    });

    it.each([
        ['zero bytes', 'A'.repeat(88)],
        ['nothing', ''],
        ['no base64', '!!!!'],
        ['a full signature', 'ful' + 'A'.repeat(40)],
        ['a proof of funds', 'pof' + 'A'.repeat(40)],
        ['a witness of one item for a p2wpkh address', b64(Uint8Array.from([1, 64, ...new Uint8Array(64).fill(7)]))],
        ['a BIP-137 header out of range', b64(Uint8Array.from([60, ...new Uint8Array(64).fill(7)]))],
        [
            'a signature-shaped witness with bytes after it',
            b64(Uint8Array.from([2, 10, 0x30, ...new Uint8Array(8).fill(5), 1, 33, 2, ...new Uint8Array(32).fill(3), 0])),
        ],
        [
            'a two-item witness whose first item is no DER signature',
            b64(Uint8Array.from([2, 10, ...new Uint8Array(9).fill(5), 1, 33, 2, ...new Uint8Array(32).fill(3)])),
        ],
        [
            'a two-item witness whose key is not a compressed key',
            b64(Uint8Array.from([2, 10, 0x30, ...new Uint8Array(8).fill(5), 1, 33, 4, ...new Uint8Array(32).fill(3)])),
        ],
    ])('is false for %s', (_, sig) => {
        expect(reachesCurve(P2WPKH, sig)).toBe(false);
    });

    it('is true for the same witness shape with nothing changed, so each false above is about its one change', () => {
        const shaped = Uint8Array.from([2, 10, 0x30, ...new Uint8Array(8).fill(5), 1, 33, 2, ...new Uint8Array(32).fill(3)]);
        expect(reachesCurve(P2WPKH, b64(shaped))).toBe(true);
    });

    it('is false for an address that is no address', () => {
        expect(reachesCurve('not-an-address', signMessage(P2WPKH, 'hello', key))).toBe(false);
    });
});
