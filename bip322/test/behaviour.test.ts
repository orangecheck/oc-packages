import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { secp256k1 } from '@noble/curves/secp256k1';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { createBase58check } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { addressFromPrivateKey, normalizeAddress, signMessage, verifySignature } from '../src/index';
import corpus from './fixtures/bip322-js-6.1.8.json';
import generated from './fixtures/bip322-official-generated.json';

// The README's behaviour table, recomputed by signing and verifying. If behaviour
// changes, this fails until the table says the same thing.

const key = secp256k1.utils.randomSecretKey();
const pubkey = secp256k1.getPublicKey(key, true);
const message = 'behaviour table';
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const p2pkh = createBase58check(sha256).encode(Uint8Array.from([0x00, ...ripemd160(sha256(pubkey))]));
const address = { P2WPKH: addressFromPrivateKey(key, 'p2wpkh'), P2TR: addressFromPrivateKey(key, 'p2tr'), P2PKH: p2pkh };

/** A legacy signmessage signature (BIP-137) under a header flag base: 27 uncompressed, 31 P2PKH, 35 P2SH-P2WPKH, 39 P2WPKH. */
function bip137(flagBase: number): string {
    const utf8 = new TextEncoder();
    const msg = utf8.encode(message);
    const prefix = utf8.encode('\u0018Bitcoin Signed Message:\n');
    const hash = sha256(sha256(Uint8Array.from([...prefix, msg.length, ...msg])));
    const sig = secp256k1.sign(hash, key, { prehash: false, lowS: true });
    return b64(Uint8Array.from([flagBase + sig.recovery!, ...sig.toBytes('compact')]));
}

const full = (type: string) => generated.full.find((v) => v.type === type)!;
// bip322-js signed this P2SH-P2WPKH simple signature; signMessage signs only P2WPKH and P2TR.
const p2sh = corpus.find((c) => c.label.startsWith('good-p2sh') && c.address.startsWith('3'))!;
const p2shAddress = createBase58check(sha256).encode(
    Uint8Array.from([0x05, ...ripemd160(sha256(Uint8Array.from([0x00, 0x14, ...ripemd160(sha256(pubkey))])))])
);

type Signed = [address: string, message: string, signature: string];
interface Row {
    /** A BIP-322 simple signature, unprefixed. */
    simple: Signed;
    full: Signed;
    /** The address BIP-137 signatures by `key` are checked against. */
    legacy: string;
}

const upper = (s: Signed): Signed => [s[0].toUpperCase(), s[1], s[2]];
const f = (type: string): Signed => [full(type).address, full(type).message, full(type).bip322_signatures[0]!];
const p2wpkhSimple: Signed = [address.P2WPKH, message, signMessage(address.P2WPKH, message, key)];
const rows: Record<string, Row> = {
    P2WPKH: { simple: p2wpkhSimple, full: f('p2wpkh'), legacy: address.P2WPKH },
    'P2SH-P2WPKH': { simple: [p2sh.address, p2sh.message, p2sh.signature], full: f('p2sh-p2wpkh'), legacy: p2shAddress },
    P2TR: { simple: [address.P2TR, message, signMessage(address.P2TR, message, key)], full: f('p2tr'), legacy: address.P2TR },
    // P2PKH has no witness, so BIP-322 defines no simple form for it: present the
    // P2WPKH witness of the same key, which is what a wallet would get wrong.
    P2PKH: { simple: [address.P2PKH, message, p2wpkhSimple[2]], full: f('p2pkh'), legacy: address.P2PKH },
    // The P2WPKH row again, against the all-capitals spelling a QR code carries.
    Uppercase: { simple: upper(p2wpkhSimple), full: upper(f('p2wpkh')), legacy: address.P2WPKH.toUpperCase() },
};

const verdict = (ok: boolean) => (ok ? 'accepted' : 'refused');

function measure({ simple, full, legacy }: Row): Record<string, string> {
    const verdicts = [27, 31, 35, 39].map((h) => verifySignature(legacy, message, bip137(h)));
    expect(new Set(verdicts).size, `${legacy}: BIP-137 verdict depends on the header flag`).toBe(1);
    return {
        'BIP-322 simple': verdict(verifySignature(...simple)),
        'simple with `smp`': verdict(verifySignature(simple[0], simple[1], 'smp' + simple[2])),
        'BIP-322 full (`ful`)': verdict(verifySignature(...full)),
        'BIP-137 legacy': verdict(verdicts[0]!),
    };
}

function readmeTable(): Record<string, Record<string, string | undefined>> {
    const lines = readFileSync(join(__dirname, '..', 'README.md'), 'utf8').split('\n');
    const start = lines.findIndex((l) => l.startsWith('| Address |'));
    const end = lines.findIndex((l, i) => i > start && !l.startsWith('|'));
    const [header, , ...body] = lines.slice(start, end);
    const cells = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());
    const head = cells(header!).slice(1);
    return Object.fromEntries(
        body.map((line) => {
            const [name, ...values] = cells(line);
            return [name!.split(' ')[0]!, Object.fromEntries(head.map((h, i) => [h, values[i]!.match(/^\w+/)?.[0]]))];
        })
    );
}

describe('behaviour table (README)', () => {
    it('matches what the code does, cell by cell', () => {
        const table = readmeTable();
        expect(Object.keys(table)).toEqual(Object.keys(rows));
        for (const [name, row] of Object.entries(rows)) {
            expect(table[name], name).toEqual(measure(row));
        }
    });

    it('normalizeAddress turns the uppercase row into the P2WPKH row', () => {
        expect(normalizeAddress(address.P2WPKH.toUpperCase())).toBe(address.P2WPKH);
    });
});
