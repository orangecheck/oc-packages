import { bech32, bech32m } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { decodeAddress, normalizeAddress, verifySignature } from '../src/index';
import attestations from './fixtures/attestations.json';
import corpus from './fixtures/bip322-js-6.1.8.json';

// BIP-322's own test vectors (bips/bip-0322.mediawiki, "Test vectors").
const P2WPKH = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
const P2TR = 'bc1ppv609nr0vr25u07u95waq5lucwfm6tde4nydujnu8npg4q75mr5sxq8lt3';
const SIG_EMPTY =
    'AkcwRAIgM2gBAQqvZX15ZiysmKmQpDrG83avLIT492QBzLnQIxYCIBaTpOaD20qRlEylyxFSeEA2ba9YOixpX8z46TSDtS40ASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';
const SIG_HELLO =
    'AkcwRAIgZRfIY3p7/DoVTty6YZbWS71bc5Vct9p9Fia83eRmw2QCICK/ENGfwLtptFluMGs2KsqoNSk89pO7F29zJLUx9a/sASECx/EgAxlkQpQ9hYjgGu6EBCPMVPwVIVJqO4XCsMvViHI=';
const SIG_TR_HELLO =
    'AUHd69PrJQEv+oKTfZ8l+WROBHuy9HKrbFCJu7U1iK2iiEy1vMU5EfMtjc+VSHM7aU0SDbak5IUZRVno2P5mjSafAQ==';

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const bytes = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'));

describe('BIP-322 test vectors', () => {
    it('verifies the P2WPKH signatures over "" and "Hello World"', () => {
        expect(verifySignature(P2WPKH, '', SIG_EMPTY)).toBe(true);
        expect(verifySignature(P2WPKH, 'Hello World', SIG_HELLO)).toBe(true);
    });

    it('verifies the single-key P2TR signature', () => {
        expect(verifySignature(P2TR, 'Hello World', SIG_TR_HELLO)).toBe(true);
    });

    it('refuses each signature over the other message', () => {
        expect(verifySignature(P2WPKH, 'Hello World', SIG_EMPTY)).toBe(false);
        expect(verifySignature(P2WPKH, '', SIG_HELLO)).toBe(false);
        expect(verifySignature(P2TR, 'Hello World!', SIG_TR_HELLO)).toBe(false);
    });

    it('refuses a signature presented for another address', () => {
        expect(verifySignature(P2TR, 'Hello World', SIG_HELLO)).toBe(false);
        expect(verifySignature(P2WPKH, 'Hello World', SIG_TR_HELLO)).toBe(false);
    });
});

describe('real attestations', () => {
    // Every orangecheck attestation on public relays at 2026-10-16: the ones
    // attest.ochk.io read as forged while bitcoinjs-lib 6.1.9 broke bip322-js.
    it.each(attestations)('verifies $addr', ({ addr, msg, sig }) => {
        expect(verifySignature(addr, msg, sig)).toBe(true);
        expect(verifySignature(addr, msg.replace('\n', '\n '), sig)).toBe(false);
    });
});

describe('agreement with bip322-js', () => {
    // Generated with bip322-js 3.0.0 on bitcoinjs-lib 6.1.8, its last working
    // version: random keys on mainnet and testnet; P2PKH, P2SH-P2WPKH, P2WPKH
    // and P2TR; legacy signatures under every header; and wrong messages,
    // wrong addresses, cross-type addresses, bit flips and truncations.
    // `expect` is bip322-js's verdict except where a row says `why`.
    it(`matches it on ${corpus.length} cases`, () => {
        const wrong = corpus.filter(
            (c) => verifySignature(c.address, c.message, c.signature) !== c.expect
        );
        expect(wrong.map((c) => c.label)).toEqual([]);
        expect(corpus.filter((c) => c.expect).length).toBeGreaterThan(150);
    });
});

describe('stricter than bip322-js', () => {
    it('requires SIGHASH_ALL, as BIP-322 does; bip322-js accepted any hash type', () => {
        const sig = bytes(SIG_HELLO);
        sig[1 + 1 + sig[1]! - 1] = 0x03; // SIGHASH_SINGLE on the DER signature
        expect(verifySignature(P2WPKH, 'Hello World', b64(sig))).toBe(false);
    });

    it('refuses a witness whose length prefix overruns it; bip322-js truncated and accepted', () => {
        const sig = bytes(SIG_HELLO);
        sig[2 + sig[1]!] = 0x29; // pubkey length 41, with 33 bytes present
        expect(verifySignature(P2WPKH, 'Hello World', b64(sig))).toBe(false);
    });

    it('refuses a 65-byte Schnorr signature carrying SIGHASH_DEFAULT', () => {
        const sig = bytes(SIG_TR_HELLO);
        sig[sig.length - 1] = 0x00;
        expect(verifySignature(P2TR, 'Hello World', b64(sig))).toBe(false);
    });
});

describe('malformed input', () => {
    it.each([
        ['', 'Hello World', SIG_HELLO],
        ['not-an-address', 'Hello World', SIG_HELLO],
        // Mixed case is never bech32 (BIP-173), whatever the checksum says.
        [P2WPKH.slice(0, 5) + P2WPKH.slice(5).toUpperCase(), 'Hello World', SIG_HELLO],
        ['BC1Q' + P2WPKH.slice(4), 'Hello World', SIG_HELLO],
        [P2WPKH, 'Hello World', ''],
        [P2WPKH, 'Hello World', '!!!!'],
        [P2WPKH, 'Hello World', 'AA=='],
        [P2WPKH, 'Hello World', b64(new Uint8Array(65))],
    ])('is not a valid signature (%s)', (address, message, sig) => {
        expect(verifySignature(address, message, sig)).toBe(false);
    });

    it('accepts URL-safe and unpadded base64', () => {
        const urlSafe = SIG_HELLO.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        expect(verifySignature(P2WPKH, 'Hello World', urlSafe)).toBe(true);
    });
});

describe('uppercase bech32 (BIP-173, as QR codes carry it)', () => {
    it('does not verify: only the canonical lowercase spelling does', () => {
        expect(verifySignature(P2WPKH.toUpperCase(), 'Hello World', SIG_HELLO)).toBe(false);
        expect(verifySignature(P2TR.toUpperCase(), 'Hello World', SIG_TR_HELLO)).toBe(false);
        expect(decodeAddress(P2WPKH.toUpperCase())).toBeNull();
    });

    it('normalizeAddress turns it into the address that verifies', () => {
        for (const [addr, sig] of [[P2WPKH, SIG_HELLO], [P2TR, SIG_TR_HELLO]] as const) {
            const canonical = normalizeAddress(addr.toUpperCase());
            expect(canonical).toBe(addr);
            expect(verifySignature(canonical!, 'Hello World', sig)).toBe(true);
        }
    });
});

describe('normalizeAddress', () => {
    it.each([
        [P2WPKH, P2WPKH],
        [`  ${P2WPKH}\n`, P2WPKH],
        ['TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX', 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'],
        ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'],
        ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
    ])('%s -> %s', (input, canonical) => {
        expect(normalizeAddress(input)).toBe(canonical);
    });

    it.each([
        ['mixed case', 'BC1Q' + P2WPKH.slice(4)],
        ['mixed case after the prefix', P2WPKH.slice(0, 5) + P2WPKH.slice(5).toUpperCase()],
        ['base58 with its case changed', '1BVBMSEYSTWETQTFN5AU4M4GFG7XJANVN2'],
        ['not an address', 'hello'],
        ['empty', ''],
    ])('refuses %s', (_, input) => {
        expect(normalizeAddress(input)).toBeNull();
    });
});

describe('decodeAddress network', () => {
    it.each([
        [P2WPKH, 'mainnet'],
        [P2TR, 'mainnet'],
        ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 'mainnet'],
        ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'mainnet'],
        ['tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx', 'testnet'],
        ['mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn', 'testnet'],
        ['2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc', 'testnet'],
        ['bcrt1qs758ursh4q9z627kt3pp5yysm78ddny6txaqgw', 'regtest'],
    ])('%s is %s', (address, network) => {
        expect(decodeAddress(address)?.network).toBe(network);
    });
});

describe('decodeAddress', () => {
    it('names each supported type', () => {
        expect(decodeAddress(P2WPKH)?.type).toBe('p2wpkh');
        expect(decodeAddress(P2TR)?.type).toBe('p2tr');
        expect(decodeAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')?.type).toBe('p2pkh');
        expect(decodeAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')?.type).toBe('p2sh');
        expect(
            decodeAddress('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3')?.type
        ).toBe('p2wsh');
        expect(decodeAddress('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx')?.type).toBe('p2wpkh');
    });

    it('refuses a bech32 checksum on a v1 program, and bech32m on v0 (BIP-350)', () => {
        const wpkh = decodeAddress(P2WPKH)!.program;
        const tr = decodeAddress(P2TR)!.program;
        expect(decodeAddress(bech32m.encode('bc', [0, ...bech32m.toWords(wpkh)]))).toBeNull();
        expect(decodeAddress(bech32.encode('bc', [1, ...bech32.toWords(tr)]))).toBeNull();
        expect(decodeAddress(bech32m.encode('bc', [1, ...bech32m.toWords(tr)]))?.type).toBe('p2tr');
    });

    it('refuses, never throws on, a valid checksum over bad padding', () => {
        // 33 words of 5 bits leave 5 excess bits; all ones make them non-zero too.
        const v0 = bech32.encode('bc', [0, ...new Array(33).fill(31)]);
        const v1 = bech32m.encode('bc', [1, ...new Array(53).fill(31)]);
        for (const address of [v0, v1]) {
            expect(() => decodeAddress(address)).not.toThrow();
            expect(decodeAddress(address)).toBeNull();
            expect(verifySignature(address, 'Hello World', SIG_HELLO)).toBe(false);
        }
    });
});
