/**
 * An attestation or bond signature may cover the message without its final LF, which is what a
 * wallet that trims the text before signing it signs (OC Attest SPEC §4.1, BOND.md §3 step 4).
 * No other text verifies, and the message passed in is read, and its id computed, as before.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { createBase58check } from '@scure/base';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    bondId,
    buildBondMessage,
    buildCanonicalMessage,
    generateAttestationId,
    signatureIsValid,
    verify,
    verifyBondSignature,
} from '../index';

const KEY = '00'.repeat(31) + '01';
const NOW = new Date('2026-11-22T12:00:00Z');

/** A legacy signmessage signature with Electrum's header, 31 + recovery id, for any address. */
function bip137(message: string): string {
    const key = Buffer.from(KEY, 'hex');
    const msg = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode('\u0018Bitcoin Signed Message:\n');
    const len = msg.length < 253 ? [msg.length] : [253, msg.length & 0xff, msg.length >> 8];
    const hash = sha256(sha256(Uint8Array.from([...prefix, ...len, ...msg])));
    const rec = secp256k1.sign(hash, key, { prehash: false, format: 'recovered' });
    return Buffer.from(Uint8Array.from([31 + rec[0]!, ...rec.subarray(1)])).toString('base64');
}

const pkh = ripemd160(sha256(secp256k1.getPublicKey(Buffer.from(KEY, 'hex'), true)));
const P2PKH = createBase58check(sha256).encode(Uint8Array.from([0x00, ...pkh]));

const SIGNERS = [
    { name: 'BIP-322 p2wpkh', address: addressFromPrivateKey(KEY, 'p2wpkh'), sign: signMessage },
    { name: 'BIP-322 p2tr', address: addressFromPrivateKey(KEY, 'p2tr'), sign: signMessage },
    {
        name: 'BIP-322 p2wpkh, smp',
        address: addressFromPrivateKey(KEY, 'p2wpkh'),
        sign: (a: string, m: string, k: string) => signMessage(a, m, k, { prefixed: true }),
    },
    {
        name: 'legacy p2wpkh',
        address: addressFromPrivateKey(KEY, 'p2wpkh'),
        sign: (_: string, m: string) => bip137(m),
    },
    { name: 'legacy p2pkh', address: P2PKH, sign: (_: string, m: string) => bip137(m) },
] as const;

const OK = ['sig_ok_bip322', 'sig_ok_legacy'];

function attestation(address: string, extensions: Record<string, string> = {}): string {
    const identities = [{ protocol: 'github', identifier: 'alice' }];
    return buildCanonicalMessage({ address, identities }, extensions, {
        nonce: '0011223344556677889900aabbccddee',
        issuedAt: '2026-11-22T11:59:00Z',
    });
}

describe.each(SIGNERS)('an attestation signed by a wallet that trims ($name)', ({ address, sign }) => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
        );
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    const msg = attestation(address);
    const signed = (text: string) => sign(address, text, KEY);

    it('verifies a signature over the message without its final LF, with the same id', async () => {
        const sig = signed(msg.slice(0, -1));
        const r = await verify({ addr: address, msg, sig });
        expect(r.codes.filter((c) => OK.includes(c))).toHaveLength(1);
        expect(r.attestation_id).toBe(await generateAttestationId(msg));
        expect(await signatureIsValid({ addr: address, msg, sig })).toBe(true);
    });

    it('still verifies a signature over the message itself', async () => {
        const r = await verify({ addr: address, msg, sig: signed(msg) });
        expect(r.codes.filter((c) => OK.includes(c))).toHaveLength(1);
    });

    it.each([
        ['a second LF', msg + '\n'],
        ['CRLF in place of the final LF', msg.slice(0, -1) + '\r\n'],
        ['a leading space', ' ' + msg],
        ['the final LF and the last character', msg.slice(0, -2)],
    ])('refuses a signature over the message with %s', async (_, text) => {
        const sig = signed(text);
        const r = await verify({ addr: address, msg, sig });
        expect(r.codes).toContain('sig_invalid');
        expect(await signatureIsValid({ addr: address, msg, sig })).toBe(false);
    });

    it('refuses a trim that also drops a space ending the last value', async () => {
        const padded = attestation(address, { scope: 'x:@alice ' });
        const r = await verify({ addr: address, msg: padded, sig: signed(padded.trim()) });
        expect(r.codes).toContain('sig_invalid');
        const kept = await verify({ addr: address, msg: padded, sig: signed(padded.slice(0, -1)) });
        expect(kept.codes.filter((c) => OK.includes(c))).toHaveLength(1);
    });

    it('reads a message passed without its final LF as not canonical, whatever it signs', async () => {
        for (const sig of [signed(msg), signed(msg.slice(0, -1))]) {
            const r = await verify({ addr: address, msg: msg.slice(0, -1), sig });
            expect(r.codes).toContain('decode_error');
        }
    });
});

describe.each(SIGNERS)('a bond signed by a wallet that trims ($name)', ({ address, sign }) => {
    const message = buildBondMessage({
        address,
        outpoint: `${'ab'.repeat(32)}:0`,
        subject: 'did:oc:0123456789abcdef0123456789abcdef',
        nonce: '00112233445566778899aabbccddeeff',
        issued_at: '2026-11-22T11:58:00Z',
        expires_at: '2026-11-22T12:08:00Z',
    });
    const signed = (text: string) => sign(address, text, KEY);

    it('verifies a signature over the bond without its final LF, with the same bond id', () => {
        const r = verifyBondSignature({ message, signature: signed(message.slice(0, -1)), now: NOW });
        expect(r).toMatchObject({ ok: true, bond_id: bondId(message) });
    });

    it.each([
        ['a second LF', message + '\n'],
        ['CRLF in place of the final LF', message.slice(0, -1) + '\r\n'],
        ['a leading space', ' ' + message],
    ])('refuses a signature over the bond with %s', (_, text) => {
        expect(verifyBondSignature({ message, signature: signed(text), now: NOW })).toEqual({
            ok: false,
            reason: 'sig_invalid',
        });
    });

    it('reads a bond passed without its final LF as malformed', () => {
        const trimmed = message.slice(0, -1);
        const r = verifyBondSignature({ message: trimmed, signature: signed(trimmed), now: NOW });
        expect(r).toEqual({ ok: false, reason: 'bond_malformed' });
    });
});
