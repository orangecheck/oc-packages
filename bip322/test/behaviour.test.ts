import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { secp256k1 } from '@noble/curves/secp256k1';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { createBase58check } from '@scure/base';
import { describe, expect, it } from 'vitest';

import { addressFromPrivateKey, signMessage, verifySignature } from '../src/index';
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

type Row = keyof typeof address;
const verdict = (ok: boolean) => (ok ? 'accepted' : 'refused');

function measure(row: Row): Record<string, string> {
    const addr = address[row];
    // P2PKH has no witness, so BIP-322 defines no simple form for it: present the
    // P2WPKH witness of the same key, which is what a wallet would get wrong.
    const simple = signMessage(row === 'P2PKH' ? address.P2WPKH : addr, message, key);
    const f = full(row.toLowerCase());
    const legacy = [27, 31, 35, 39].map((h) => verifySignature(addr, message, bip137(h)));
    expect(new Set(legacy).size, `${row}: BIP-137 verdict depends on the header flag`).toBe(1);
    return {
        'BIP-322 simple': verdict(verifySignature(addr, message, simple)),
        'simple with `smp`': verdict(verifySignature(addr, message, 'smp' + simple)),
        'BIP-322 full (`ful`)': verdict(verifySignature(f.address, f.message, f.bip322_signatures[0]!)),
        'BIP-137 legacy': verdict(legacy[0]!),
    };
}

function readmeTable(): Record<string, Record<string, string>> {
    const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    const lines = readme.split('\n').filter((l) => l.startsWith('| '));
    const start = lines.findIndex((l) => l.startsWith('| Address |'));
    const head = lines[start]!.split('|').slice(2, -1).map((c) => c.trim());
    const out: Record<string, Record<string, string>> = {};
    for (const line of lines.slice(start + 2, start + 5)) {
        const cells = line.split('|').slice(1, -1).map((c) => c.trim());
        const row = cells[0]!.split(' ')[0]!;
        out[row] = Object.fromEntries(head.map((h, i) => [h, cells[i + 1]!.match(/^\w+/)?.[0]]));
    }
    return out;
}

describe('behaviour table (README)', () => {
    it('matches what 1.1 does, cell by cell', () => {
        const table = readmeTable();
        for (const row of ['P2WPKH', 'P2TR', 'P2PKH'] as Row[]) {
            expect(table[row], row).toEqual(measure(row));
        }
    });
});
