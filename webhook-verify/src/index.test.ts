import { describe, expect, it } from 'vitest';

import { sign, verify } from './index';

const SECRET = 'a'.repeat(64);
const BODY = '{"event":"delegation.registered","id":"abc"}';

describe('sign', () => {
    it('returns a sha256=<hex> string', () => {
        const s = sign(SECRET, BODY);
        expect(s).toMatch(/^sha256=[0-9a-f]{64}$/);
    });
    it('is deterministic (same inputs → same sig)', () => {
        expect(sign(SECRET, BODY)).toBe(sign(SECRET, BODY));
    });
    it('changes when the body changes', () => {
        expect(sign(SECRET, BODY)).not.toBe(sign(SECRET, BODY + ' '));
    });
    it('changes when the secret changes', () => {
        expect(sign(SECRET, BODY)).not.toBe(sign(SECRET + 'b', BODY));
    });
});

describe('verify', () => {
    it('returns true for a self-signed body', () => {
        const sig = sign(SECRET, BODY);
        expect(verify({ secret: SECRET, signature: sig, rawBody: BODY })).toBe(true);
    });
    it('accepts the bare hex form (no sha256= prefix)', () => {
        const sig = sign(SECRET, BODY).slice('sha256='.length);
        expect(verify({ secret: SECRET, signature: sig, rawBody: BODY })).toBe(true);
    });
    it('handles whitespace around the signature header', () => {
        const sig = '   ' + sign(SECRET, BODY) + '   ';
        expect(verify({ secret: SECRET, signature: sig, rawBody: BODY })).toBe(true);
    });
    it('rejects a tampered body', () => {
        const sig = sign(SECRET, BODY);
        expect(verify({ secret: SECRET, signature: sig, rawBody: BODY + 'x' })).toBe(false);
    });
    it('rejects a wrong-length signature', () => {
        expect(
            verify({ secret: SECRET, signature: 'sha256=abcd', rawBody: BODY })
        ).toBe(false);
    });
    it('rejects non-hex characters', () => {
        expect(
            verify({ secret: SECRET, signature: 'sha256=' + 'g'.repeat(64), rawBody: BODY })
        ).toBe(false);
    });
    it('rejects empty signature', () => {
        expect(verify({ secret: SECRET, signature: '', rawBody: BODY })).toBe(false);
    });
    it('rejects empty secret', () => {
        const sig = sign(SECRET, BODY);
        expect(verify({ secret: '', signature: sig, rawBody: BODY })).toBe(false);
    });
    it('accepts a Uint8Array body', () => {
        const bytes = new TextEncoder().encode(BODY);
        const sig = sign(SECRET, bytes);
        expect(verify({ secret: SECRET, signature: sig, rawBody: bytes })).toBe(true);
    });
});
