import type { Scheme } from '../types';

import { decodeAddress } from '@orangecheck/bip322';
import { Buffer } from 'buffer';

/** A signature as base64: hex input is converted, anything else passes through. */
export function toBase64Maybe(sig: string): string {
    if (/^[0-9a-fA-F]+$/.test(sig) && sig.length % 2 === 0) {
        return Buffer.from(sig, 'hex').toString('base64');
    }
    return sig;
}

/**
 * The scheme a signature's bytes say it is, the same rule @orangecheck/bip322
 * verifies by: 65 bytes is a BIP-137 compact signature, whatever the address,
 * and anything else is BIP-322 simple. `null` for a BIP-322 full or
 * proof-of-funds signature, which is not supported.
 */
export function signatureScheme(sigBase64: string): Scheme | null {
    if (/^(ful|pof)/.test(sigBase64)) return null;
    if (sigBase64.startsWith('smp')) return 'bip322';
    return Buffer.from(sigBase64, 'base64').length === 65 ? 'legacy' : 'bip322';
}

/**
 * Whether checking `sigBase64` for `address` gets as far as curve math in
 * @orangecheck/bip322's verifySignature. It turns away bytes not shaped like a
 * signature for the address's kind before any: no address, a full or
 * proof-of-funds signature, bytes that are no base64, a BIP-137 header out of
 * range, a witness that does not parse, or a witness of the wrong shape. This
 * decides no signature's validity; check() uses it to charge its signature
 * budget only for the checks that cost, so junk under a tag is checked free.
 * It follows verifySignature's early returns in bip322 1.1.3, and where it
 * stops short of them it charges, never the other way.
 */
export function reachesCurve(address: string, sigBase64: string): boolean {
    const addr = decodeAddress(address);
    if (!addr || /^(ful|pof)/.test(sigBase64)) return false;
    const prefixed = sigBase64.startsWith('smp');
    const bytes = decodeBase64(prefixed ? sigBase64.slice(3) : sigBase64);
    if (bytes.length === 0) return false;
    if (!prefixed && (addr.type === 'p2pkh' || bytes.length === 65)) {
        return bytes.length === 65 && bytes[0]! >= 27 && bytes[0]! <= 42;
    }
    const stack = witnessItems(bytes);
    if (!stack) return false;
    if (stack.length === 2) {
        const [sig, pubkey] = stack as [Uint8Array, Uint8Array];
        return (
            pubkey.length === 33 &&
            (pubkey[0] === 2 || pubkey[0] === 3) &&
            sig.length >= 9 &&
            sig[0] === 0x30 &&
            sig[sig.length - 1] === 1
        );
    }
    const only = stack[0];
    return (
        addr.type === 'p2tr' &&
        stack.length === 1 &&
        (only!.length === 64 || (only!.length === 65 && only![64] === 1))
    );
}

/** bip322's base64 reading: URL-safe letters allowed, padding optional, anything else empty. */
function decodeBase64(s: string): Uint8Array {
    const clean = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return new Uint8Array();
    return Uint8Array.from(Buffer.from(clean, 'base64'));
}

/** A serialized witness stack's items, or null when the bytes are not exactly one. */
function witnessItems(bytes: Uint8Array): Uint8Array[] | null {
    let at = 0;
    const readSize = (): number | null => {
        const first = bytes[at++];
        if (first === undefined) return null;
        if (first < 253) return first;
        const width = first === 253 ? 2 : first === 254 ? 4 : 8;
        if (at + width > bytes.length) return null;
        let n = 0;
        for (let i = width - 1; i >= 0; i--) n = n * 256 + bytes[at + i]!;
        at += width;
        return n;
    };
    const count = readSize();
    if (count === null) return null;
    const stack: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
        const len = readSize();
        if (len === null || at + len > bytes.length) return null;
        stack.push(bytes.subarray(at, at + len));
        at += len;
    }
    return at === bytes.length ? stack : null;
}
