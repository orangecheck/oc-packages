/**
 * TOTP (RFC 6238) — used to resolve an `ocv://…?attr=otp` reference to a
 * live one-time code rather than the stored seed.
 *
 * SHA-1, the universal default. Variant hash algorithms are deferred — a
 * v1 oc-vault `totp` entry stores a base32 seed, digits, and period only.
 */

import { hmac } from '@noble/hashes/hmac';
import { sha1 } from '@noble/hashes/sha1';

/** Decode an RFC 4648 base32 string (case-insensitive, padding tolerated). */
export function base32Decode(input: string): Uint8Array {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = input.toUpperCase().replace(/[\s=]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = alphabet.indexOf(ch);
        if (idx === -1) throw new Error('invalid base32 in TOTP secret');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out.push((value >>> bits) & 0xff);
        }
    }
    return new Uint8Array(out);
}

/** A counter as an 8-byte big-endian buffer. */
function counterBytes(counter: number): Uint8Array {
    const buf = new Uint8Array(8);
    let n = Math.floor(counter);
    for (let i = 7; i >= 0; i--) {
        buf[i] = n & 0xff;
        n = Math.floor(n / 256);
    }
    return buf;
}

export interface TotpOptions {
    /** Code length. Default 6. */
    digits?: number;
    /** Step length in seconds. Default 30. */
    period?: number;
    /** Unix time in ms. Default `Date.now()`. */
    now?: number;
}

/** Generate the current TOTP code for a base32 `secret`. */
export function totp(secret: string, opts: TotpOptions = {}): string {
    const digits = opts.digits ?? 6;
    const period = opts.period ?? 30;
    const now = opts.now ?? Date.now();
    const counter = Math.floor(now / 1000 / period);

    const mac = hmac(sha1, base32Decode(secret), counterBytes(counter));
    const offset = mac[mac.length - 1]! & 0x0f;
    const binary =
        ((mac[offset]! & 0x7f) << 24) |
        ((mac[offset + 1]! & 0xff) << 16) |
        ((mac[offset + 2]! & 0xff) << 8) |
        (mac[offset + 3]! & 0xff);
    return String(binary % 10 ** digits).padStart(digits, '0');
}
