/**
 * Which scheme verifies a signature is decided by its bytes, never by the
 * address or the first letter of its base64: a 65-byte compact signature is
 * BIP-137 for every address it can stand for, and anything else is BIP-322.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { createBase58check } from '@scure/base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, issueChallenge, signatureIsValid, verify, verifyChallenge } from '../index';
import generated from './fixtures/bip322-official-generated.json';

const base58check = createBase58check(sha256);
const hash160 = (b: Uint8Array) => ripemd160(sha256(b));
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');

function addresses(key: Uint8Array) {
    const pkh = hash160(secp256k1.getPublicKey(key, true));
    return {
        p2pkh: base58check.encode(Uint8Array.from([0x00, ...pkh])),
        'p2sh-p2wpkh': base58check.encode(Uint8Array.from([0x05, ...hash160(Uint8Array.from([0x00, 0x14, ...pkh]))])),
        p2wpkh: addressFromPrivateKey(key, 'p2wpkh'),
        p2tr: addressFromPrivateKey(key, 'p2tr'),
    };
}

/** A legacy signmessage signature: header = flagBase + recovery id. */
function bip137(key: Uint8Array, message: string, flagBase: number): { sig: string; recid: number } {
    const msg = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode('\u0018Bitcoin Signed Message:\n');
    const len = msg.length < 253 ? [msg.length] : [253, msg.length & 0xff, msg.length >> 8];
    const hash = sha256(sha256(Uint8Array.from([...prefix, ...len, ...msg])));
    const rec = secp256k1.sign(hash, key, { prehash: false, format: 'recovered' });
    return { sig: b64(Uint8Array.from([flagBase + rec[0]!, ...rec.subarray(1)])), recid: rec[0]! };
}

const key = secp256k1.utils.randomSecretKey();
const other = secp256k1.utils.randomSecretKey();
const addrs = addresses(key);
const LEGACY_TYPES = ['p2pkh', 'p2sh-p2wpkh', 'p2wpkh'] as const;
// 27 uncompressed, 31 compressed P2PKH (Electrum uses it for every type), 35 P2SH-P2WPKH, 39 P2WPKH.
const HEADERS = [27, 31, 35, 39];

/** One canonical attestation per recovery-id parity, found by varying the nonce. */
function attestations(addr: string, flagBase: number, signer = key) {
    const out = new Map<number, { msg: string; sig: string }>();
    for (let i = 0; out.size < 2; i++) {
        const msg = buildCanonicalMessage(
            { address: addr, identities: [] },
            {},
            { nonce: i.toString(16).padStart(32, '0'), issuedAt: '2026-10-22T00:00:00Z' }
        );
        const { sig, recid } = bip137(signer, msg, flagBase);
        if (!out.has(recid & 1)) out.set(recid & 1, { msg, sig });
    }
    return [...out.entries()];
}

function challenges(addr: string, flagBase: number, signer = key) {
    const out = new Map<number, { message: string; signature: string }>();
    for (let i = 0; out.size < 2; i++) {
        const { message } = issueChallenge({ address: addr, nonce: i.toString(16).padStart(32, '0') });
        const { sig, recid } = bip137(signer, message, flagBase);
        if (!out.has(recid & 1)) out.set(recid & 1, { message, signature: sig });
    }
    return [...out.entries()];
}

describe('signature routing', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network is off in this test'))));
    });
    afterEach(() => vi.unstubAllGlobals());

    describe.each(LEGACY_TYPES)('BIP-137 on %s', (type) => {
        it.each(HEADERS)('verify() labels header %i legacy, for both recovery-id parities', async (flag) => {
            for (const [parity, { msg, sig }] of attestations(addrs[type], flag)) {
                const out = await verify({ addr: addrs[type], msg, sig });
                expect(out.codes[0], `parity ${parity}`).toBe('sig_ok_legacy');
            }
        });

        it.each(HEADERS)('verifyChallenge accepts header %i under any scheme hint, both parities', async (flag) => {
            for (const [parity, { message, signature }] of challenges(addrs[type], flag)) {
                for (const scheme of [undefined, 'legacy', 'bip322'] as const) {
                    const out = await verifyChallenge({ message, signature, ...(scheme && { scheme }) });
                    expect(out, `parity ${parity} scheme ${scheme}`).toMatchObject({ ok: true, scheme: 'legacy' });
                }
            }
        });

        it('a BIP-137 signature by another key is refused', async () => {
            for (const flag of HEADERS) {
                for (const [, { msg, sig }] of attestations(addrs[type], flag, other)) {
                    expect((await verify({ addr: addrs[type], msg, sig })).codes[0]).toBe('sig_invalid');
                }
                for (const [, { message, signature }] of challenges(addrs[type], flag, other)) {
                    expect(await verifyChallenge({ message, signature })).toMatchObject({ ok: false, reason: 'sig_invalid' });
                }
            }
        });
    });

    describe('BIP-322', () => {
        it.each(['p2wpkh', 'p2tr'] as const)('a %s simple signature is labelled bip322, with or without smp', async (type) => {
            const msg = buildCanonicalMessage({ address: addrs[type], identities: [] }, {}, { nonce: 'ab'.repeat(16), issuedAt: '2026-10-22T00:00:00Z' });
            for (const prefixed of [false, true]) {
                const sig = signMessage(addrs[type], msg, key, { prefixed });
                expect((await verify({ addr: addrs[type], msg, sig })).codes[0]).toBe('sig_ok_bip322');
                const { message } = issueChallenge({ address: addrs[type] });
                const signature = signMessage(addrs[type], message, key, { prefixed });
                expect(await verifyChallenge({ message, signature, scheme: 'legacy' })).toMatchObject({ ok: true, scheme: 'bip322' });
            }
        });

        it('the official simple vectors verify; the error vectors do not', async () => {
            for (const v of generated.simple.filter((s) => s.type === 'p2wpkh' || s.type === 'p2tr')) {
                for (const sig of [v.bip322_signatures[0]!, v.bip322_signatures[0]!.replace(/^smp/, '')]) {
                    expect(await signatureIsValid({ addr: v.address, msg: v.message, sig })).toBe(true);
                }
            }
            for (const v of generated.error) {
                expect(await signatureIsValid({ addr: v.address, msg: v.message, sig: v.signature }), v.description).toBe(false);
            }
        });

        it('full and proof-of-funds signatures are unsupported, not invalid', async () => {
            const { message } = issueChallenge({ address: addrs.p2wpkh });
            const full = generated.full.find((v) => v.type === 'p2wpkh')!.bip322_signatures[0]!;
            const msg = buildCanonicalMessage({ address: addrs.p2wpkh, identities: [] }, {}, { nonce: 'cd'.repeat(16), issuedAt: '2026-10-22T00:00:00Z' });
            for (const sig of [full, 'pof' + full.slice(3)]) {
                expect((await verify({ addr: addrs.p2wpkh, msg, sig })).codes[0]).toBe('sig_unsupported_script');
                expect(await verifyChallenge({ message, signature: sig })).toMatchObject({ ok: false, reason: 'sig_unsupported_scheme' });
            }
        });
    });
});
