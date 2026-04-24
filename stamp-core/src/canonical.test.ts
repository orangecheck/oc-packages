import { describe, expect, it } from 'vitest';

import {
    canonicalMessage,
    canonicalMessageBytes,
    canonicalize,
    computeEnvelopeId,
    hexEncode,
    sha256Hex,
} from './canonical.js';

describe('canonicalMessage', () => {
    it('produces the exact SPEC §3.1 shape, LF-separated, no trailing LF', () => {
        const msg = canonicalMessage({
            address: 'bc1qalice',
            content_hash: 'sha256:abc',
            content_length: 42,
            content_mime: 'text/plain',
            signed_at: '2026-04-24T18:30:00Z',
        });
        expect(msg).toBe(
            'oc-stamp:v1\n' +
                'address: bc1qalice\n' +
                'content_hash: sha256:abc\n' +
                'content_length: 42\n' +
                'content_mime: text/plain\n' +
                'signed_at: 2026-04-24T18:30:00Z'
        );
        expect(msg.endsWith('\n')).toBe(false);
    });

    it('UTF-8 encoded bytes match the string length for ASCII input', () => {
        const msg = canonicalMessage({
            address: 'bc1qalice',
            content_hash: 'sha256:abc',
            content_length: 42,
            content_mime: 'text/plain',
            signed_at: '2026-04-24T18:30:00Z',
        });
        const bytes = canonicalMessageBytes({
            address: 'bc1qalice',
            content_hash: 'sha256:abc',
            content_length: 42,
            content_mime: 'text/plain',
            signed_at: '2026-04-24T18:30:00Z',
        });
        expect(bytes.byteLength).toBe(msg.length);
    });

    it('v01 vector id matches the spec-committed hash', () => {
        // Cross-check against test-vectors/v01-minimal.json without loading the file
        // (that full load lives in test-vectors.test.ts). This inline check catches
        // canonical-message drift independently of filesystem layout.
        const id = computeEnvelopeId({
            address: 'bc1qalice000000000000000000000000000000000',
            content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
            content_length: 42,
            content_mime: 'text/plain',
            signed_at: '2026-04-24T18:30:00Z',
        });
        expect(id).toBe('ad30c983dfc872a8c53cd70eb4d84e1869967a4b8433586beec7ba468b03c3de');
    });
});

describe('canonicalize (RFC 8785 JSON)', () => {
    it('sorts object keys lexicographically', () => {
        expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    it('preserves array order', () => {
        expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    });

    it('elides undefined', () => {
        // Cast because TS disallows undefined in JsonValue but JS runtime
        // gets it from optional-chained object spreads.
        expect(canonicalize({ a: 1, b: undefined as never })).toBe('{"a":1}');
    });

    it('emits null explicitly', () => {
        expect(canonicalize({ a: null })).toBe('{"a":null}');
    });

    it('escapes control chars with \\uXXXX', () => {
        expect(canonicalize('')).toBe('"\\u0001"');
    });

    it('canonicalizes integers without exponents', () => {
        expect(canonicalize(12843)).toBe('12843');
        expect(canonicalize(0)).toBe('0');
        expect(canonicalize(-0)).toBe('0');
    });
});

describe('utilities', () => {
    it('hexEncode produces lowercase hex', () => {
        expect(hexEncode(new Uint8Array([0x00, 0xab, 0xcd, 0xef]))).toBe('00abcdef');
    });

    it('sha256Hex of empty bytes is the NIST vector', () => {
        expect(sha256Hex(new Uint8Array(0))).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        );
    });
});
