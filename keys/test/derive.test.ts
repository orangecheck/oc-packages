import { addressFromPrivateKey } from '@orangecheck/bip322';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { createBase58check } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { concat, fromHex, toHex, utf8 } from '../src/bytes';
import {
    deriveIdentity,
    deriveWallet,
    fedimintClientSecret,
    fedimintRootSecret,
    identityKeys,
    identityKeysFromMnemonic,
    mnemonicToSecret,
    p2wpkhAddress,
    secretToMnemonic,
    walletFromMnemonic,
} from '../src/derive';

// BIP-39's published vectors (trezor/python-mnemonic vectors.json), 32-byte entropy.
const BIP39 = [
    [
        '0000000000000000000000000000000000000000000000000000000000000000',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art',
    ],
    [
        '7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f7f',
        'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title',
    ],
] as const;

describe('a secret is 24 BIP-39 words', () => {
    it.each(BIP39)('%s', (entropy, words) => {
        expect(secretToMnemonic(fromHex(entropy)!)).toBe(words);
        expect(toHex(mnemonicToSecret(words)!)).toBe(entropy);
    });

    it('refuses what is not 24 valid words', () => {
        const words = BIP39[0][1];
        expect(mnemonicToSecret(words.replace(/art$/, 'abandon'))).toBeNull(); // checksum
        expect(mnemonicToSecret(words.split(' ').slice(0, 12).join(' '))).toBeNull(); // 12 words
        expect(mnemonicToSecret(` ${words}`)).toBeNull();
        expect(mnemonicToSecret(words.toUpperCase())).toBeNull();
        expect(() => secretToMnemonic(new Uint8Array(16))).toThrow(TypeError);
    });
});

// NIP-06's published vectors: m/44'/1237'/0'/0/0 of a BIP-39 phrase.
describe('the Nostr key is NIP-06', () => {
    it('matches NIP-06 vector 2 (24 words) through the identity secret', () => {
        const words =
            'what bleak badge arrange retreat wolf trade produce cricket blur garlic valid proud rude strong choose busy staff weather area salt hollow arm fade';
        const keys = identityKeys(mnemonicToSecret(words)!);
        expect(toHex(keys.nostrKey)).toBe('c15d739894c81a2fcfd3a2df85a0d2c0dbc47a280d092799f144d73d7ae78add');
        expect(keys.nostr).toBe('d41b22899549e1f3d335a31002cfd382174006e166d3e658e3a5eecdb6463573');
        expect(keys.npub).toBe('npub16sdj9zv4f8sl85e45vgq9n7nsgt5qphpvmf7vk8r5hhvmdjxx4es8rq74h');
    });

    it('matches NIP-06 vector 1 (12 words)', () => {
        const keys = identityKeysFromMnemonic(
            'leader monkey parrot ring guide accident before fence cannon height naive bean'
        );
        expect(toHex(keys.nostrKey)).toBe('7f7ff03d123792d6ac594bfa67bf6d0c0ab55b6b1fdb6249303fe861f1ccba9a');
        expect(keys.npub).toBe('npub1zutzeysacnf9rru6zqwmxd54mud0k44tst6l70ja5mhv8jjumytsd2x7nu');
    });
});

// BIP-84's published vector (abandon ... about).
const BIP84_WORDS = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BIP84_ZPUB =
    'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

/** The same key under the plain xpub version bytes (SLIP-132 zpub -> BIP-32 xpub). */
function zpubToXpub(zpub: string): string {
    const b58 = createBase58check(sha256);
    const raw = b58.decode(zpub);
    return b58.encode(Uint8Array.from([0x04, 0x88, 0xb2, 0x1e, ...raw.slice(4)]));
}

describe('the identity address and the wallet are BIP-84', () => {
    it('puts the identity address at BIP-84 first receive', () => {
        const keys = identityKeysFromMnemonic(BIP84_WORDS);
        expect(keys.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
        expect(toHex(secp256k1.getPublicKey(keys.addressKey, true))).toBe(
            '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c'
        );
    });

    it('builds the wallet account, receive and change addresses of BIP-84', () => {
        const w = walletFromMnemonic(BIP84_WORDS);
        expect(w.accountPath).toBe("m/84'/0'/0'");
        expect(w.accountXpub).toBe(zpubToXpub(BIP84_ZPUB));
        expect(w.address(0, 0)).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
        expect(w.address(0, 1)).toBe('bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g');
        expect(w.address(1, 0)).toBe('bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el');
        expect(w.fingerprint).toBe('73c5da0a'); // the BIP-84 test seed's master fingerprint
    });

    it('uses coin 1 and tb1 on test networks', () => {
        const w = walletFromMnemonic(BIP84_WORDS, 'testnet');
        expect(w.accountPath).toBe("m/84'/1'/0'");
        expect(w.accountXpub.startsWith('tpub')).toBe(true);
        expect(w.address(0, 0).startsWith('tb1q')).toBe(true);
        expect(() => w.address(0, 2 ** 31)).toThrow(RangeError);
    });

    it('encodes P2WPKH as bip322 does', () => {
        const key = identityKeysFromMnemonic(BIP84_WORDS).addressKey;
        expect(p2wpkhAddress(secp256k1.getPublicKey(key, true))).toBe(addressFromPrivateKey(key, 'p2wpkh'));
        expect(p2wpkhAddress(secp256k1.getPublicKey(key, true), 'testnet')).toBe(
            addressFromPrivateKey(key, 'p2wpkh', 'testnet')
        );
    });
});

describe('secrets are 32 bytes', () => {
    it('refuses secrets of any other length', () => {
        expect(() => identityKeys(new Uint8Array(31))).toThrow(TypeError);
        expect(() => deriveWallet(new Uint8Array(33))).toThrow(TypeError);
        expect(deriveIdentity(fromHex('11'.repeat(32))!).address.startsWith('bc1q')).toBe(true);
    });
});

// What test/fedimint-xcheck (Fedimint's own HKDF crate and rust-bip39) prints
// for these inputs: DerivableSecret::to_random_bytes::<32>() of the global root
// and of the per-federation client secret.
describe("the Fedimint root is fedimint-bip39's", () => {
    const rawBytes32 = (prk: Uint8Array) =>
        hmac(sha512, prk, concat(utf8('rawbytes'), new Uint8Array(8), Uint8Array.of(1))).slice(0, 32);
    it.each([
        [
            '00'.repeat(32),
            '15db8cb4f1ec8e484d73b889372bec94812580f929e8148b7437d359af422cd3',
            '5dc8a5c32abc326b43fa488f1f9f8586ddc353f02e2e0a74e619a3dd78b71d87',
            'bbf1435504e4a254e1d6ebd977326e961065ca35c52210d987e2130fe4f4ba72',
        ],
        [
            'bbe21ea8250d9b044b29a7a41a0b8bca97b9fa4d353b65895100fc641b1de4f1',
            '2cf7297445c5372c19295aeb657bc91d6da44fc751b5567686bafbb2f6a91df8',
            '38a97ce0601097783e1d67abc983f8612ebbfb8f0dcba1a6c9d047e44d6d0e4e',
            '282cbdfe47e719c9bebe6f44fe208803365fdbb254ef5bdf25c7d6ad1450412c',
        ],
    ])('W %s', (w, federationId, root, client) => {
        expect(toHex(rawBytes32(fedimintRootSecret(fromHex(w)!)))).toBe(root);
        expect(toHex(rawBytes32(fedimintClientSecret(fromHex(w)!, federationId)))).toBe(client);
    });

    it('refuses a federation id that is not 64 hex digits', () => {
        expect(() => fedimintClientSecret(new Uint8Array(32), 'ab')).toThrow(TypeError);
    });
});
