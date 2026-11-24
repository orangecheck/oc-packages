import { base64urlnopad } from '@scure/base';

const enc = new TextEncoder();

export function utf8(s: string): Uint8Array {
    return enc.encode(s);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
    return diff === 0;
}

const HEX = /^(?:[0-9a-f]{2})*$/;

export function toHex(b: Uint8Array): string {
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Lowercase hex of even length only; anything else is null. */
export function fromHex(s: string): Uint8Array | null {
    if (typeof s !== 'string' || !HEX.test(s)) return null;
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    return out;
}

export function toB64url(b: Uint8Array): string {
    return base64urlnopad.encode(b);
}

/** Unpadded base64url in its one canonical spelling, or null. */
export function fromB64url(s: string): Uint8Array | null {
    if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) return null;
    try {
        const b = base64urlnopad.decode(s);
        return base64urlnopad.encode(b) === s ? b : null;
    } catch {
        return null;
    }
}

/** 32 bytes from the platform's CSPRNG. */
export function randomSecret(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(32));
}
