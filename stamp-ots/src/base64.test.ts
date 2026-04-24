import { describe, expect, it } from 'vitest';

import { base64Decode, base64Encode, hexDecode, hexEncode } from './base64.js';

describe('base64', () => {
    it('encode → decode round-trips', () => {
        const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 255, 254, 128]);
        const s = base64Encode(bytes);
        expect(base64Decode(s)).toEqual(bytes);
    });

    it('empty bytes round-trip', () => {
        const empty = new Uint8Array(0);
        expect(base64Encode(empty)).toBe('');
        expect(base64Decode('').byteLength).toBe(0);
    });

    it('canonical RFC 4648 vectors', () => {
        // Testing "f", "fo", "foo" from the RFC.
        expect(base64Encode(new TextEncoder().encode('f'))).toBe('Zg==');
        expect(base64Encode(new TextEncoder().encode('fo'))).toBe('Zm8=');
        expect(base64Encode(new TextEncoder().encode('foo'))).toBe('Zm9v');
    });

    it('rejects garbage input', () => {
        expect(() => base64Decode('!!!')).toThrow();
        expect(() => base64Decode('abc')).toThrow(); // length not multiple of 4
    });
});

describe('hex', () => {
    it('encode → decode round-trips', () => {
        const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        expect(hexEncode(bytes)).toBe('deadbeef');
        expect(hexDecode('deadbeef')).toEqual(bytes);
    });

    it('rejects odd-length input', () => {
        expect(() => hexDecode('abc')).toThrow();
    });

    it('rejects non-hex chars', () => {
        expect(() => hexDecode('xx')).toThrow();
    });
});
