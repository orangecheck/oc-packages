/**
 * Some wallets trim the text before they sign it: Sparrow on every sign path, Electrum's GUI,
 * Nunchuk on Android and Bitcoin Keeper. A challenge has no leading whitespace and its last value
 * ends in a printable character, so a trim removes exactly its final LF. A signature over the
 * challenge without that LF verifies, and over no other edit of it.
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { createBase58check } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { issueChallenge, verifyChallenge } from '../index';

const KEY = '00'.repeat(31) + '01';
const NOW = new Date('2026-11-21T05:00:00Z');
const NONCE = 'b'.repeat(32);

/** Java's String.trim(), which Sparrow applies: every char up to U+0020, at both ends. */
const javaTrim = (s: string) => s.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');

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
        // BIP-322 2.1.0 prefixes a simple signature with "smp"; Sparrow does from 2.5.1.
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

function challenge(address: string): string {
    return issueChallenge({
        address,
        nonce: NONCE,
        audience: 'https://ochk.io',
        purpose: 'login',
        now: NOW,
    }).message;
}

function verify(address: string, message: string, signature: string) {
    return verifyChallenge({
        message,
        signature,
        expectedNonce: NONCE,
        expectedAudience: 'https://ochk.io',
        expectedPurpose: 'login',
        now: NOW,
    });
}

describe.each(SIGNERS)('a challenge signed by a wallet that trims ($name)', ({ address, sign }) => {
    const issued = challenge(address);

    it('trims to the challenge without its final LF', () => {
        expect(javaTrim(issued)).toBe(issued.slice(0, -1));
        expect(issued.trim()).toBe(issued.slice(0, -1));
    });

    it('verifies against the issued text', async () => {
        const r = await verify(address, issued, sign(address, javaTrim(issued), KEY));
        expect(r).toMatchObject({ ok: true, address, nonce: NONCE, purpose: 'login' });
    });

    it('verifies against the issued text without its final LF, either way round', async () => {
        const bare = issued.slice(0, -1);
        for (const signed of [bare, issued]) {
            const r = await verify(address, bare, sign(address, signed, KEY));
            expect(r).toMatchObject({ ok: true, address });
        }
    });

    it('refuses a signature over any other edit of the text', async () => {
        const body = issued.slice(0, -1);
        const edits = [
            issued + '\n',
            body + '\n\n',
            ' ' + issued,
            ' ' + body,
            '\n' + issued,
            body + ' ',
            body + ' \n',
            body + '\r\n',
            issued.replace(/\n/g, '\r\n'),
            body.replace(/\n/g, '\r\n'),
            body.slice(0, -1),
            issued.replace('purpose: login', 'purpose: logi'),
        ];
        for (const signed of edits) {
            const signature = sign(address, signed, KEY);
            for (const posted of [issued, body]) {
                const r = await verify(address, posted, signature);
                expect(r).toEqual({ ok: false, reason: 'sig_invalid' });
            }
        }
    });

    it('refuses a trimmed signature over another challenge', async () => {
        const other = issueChallenge({
            address,
            nonce: 'c'.repeat(32),
            audience: 'https://ochk.io',
            purpose: 'login',
            now: NOW,
        }).message;
        const r = await verify(address, issued, sign(address, javaTrim(other), KEY));
        expect(r).toEqual({ ok: false, reason: 'sig_invalid' });
    });

    it('still reads a text with an extra LF, CRLF or leading space as malformed', async () => {
        for (const message of [issued + '\n', issued.replace(/\n/g, '\r\n'), ' ' + issued]) {
            const r = await verify(address, message, sign(address, message, KEY));
            expect(r).toEqual({ ok: false, reason: 'malformed' });
        }
    });
});
