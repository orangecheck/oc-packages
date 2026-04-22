/**
 * Security regression tests.
 *
 * Every assertion here corresponds to a CRITICAL or HIGH-severity finding
 * from the cross-package audit. Breaking any of these tests means we are
 * silently reintroducing a known-bad behavior — do not delete or relax
 * without reading the matching audit entry.
 */

import { describe, expect, it } from 'vitest';

import {
    buildCanonicalMessage,
    extractAttestationIdFromUrl,
    formatIdentities,
    getVerificationUrl,
    issueChallenge,
    parseIdentities,
    verifyChallenge,
} from '../index';

describe('identity-line smuggling (canonical.ts)', () => {
    it('rejects newlines in the identifier when formatting', () => {
        expect(() =>
            formatIdentities([{ protocol: 'github', identifier: 'alice\naddress: bc1qEVIL' }])
        ).toThrow(/newline/i);
    });

    it('rejects carriage returns', () => {
        expect(() =>
            formatIdentities([{ protocol: 'github', identifier: 'alice\raddress:\tEVIL' }])
        ).toThrow(/newline/i);
    });

    it('rejects commas in the identifier (would forge a second binding)', () => {
        expect(() =>
            formatIdentities([{ protocol: 'github', identifier: 'alice,github:mallory' }])
        ).toThrow(/newline|comma/i);
    });

    it('rejects bad protocol shape', () => {
        expect(() =>
            formatIdentities([{ protocol: 'Github!', identifier: 'alice' }])
        ).toThrow(/protocol/i);
    });

    it('parseIdentities rejects a field that contains a raw newline', () => {
        // "alice\naddress: EVIL" with the newline preserved in the line we parse.
        expect(() => parseIdentities('github:alice\naddress: bc1qEVIL')).toThrow();
    });

    it('round-trips safe identities unchanged', () => {
        const formatted = formatIdentities([
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'nostr', identifier: 'npub1xxxx' },
        ]);
        expect(formatted).toBe('github:alice,nostr:npub1xxxx');
        expect(parseIdentities(formatted)).toEqual([
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'nostr', identifier: 'npub1xxxx' },
        ]);
    });
});

describe('buildCanonicalMessage nonce generation', () => {
    it('produces a 32-char lowercase-hex nonce', () => {
        const msg = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [] },
            {}
        );
        const match = msg.match(/nonce: ([^\n]+)/);
        expect(match).not.toBeNull();
        expect(match![1]!).toMatch(/^[0-9a-f]{32}$/);
    });
});

describe('signed-challenge duplicate-core-key defence', () => {
    it('parses a well-formed challenge', async () => {
        const { message, nonce } = issueChallenge({ address: 'bc1qtest', nonce: 'a'.repeat(32) });
        expect(nonce).toHaveLength(32);
        // sig_invalid is fine — we just want the parse step to succeed.
        const r = await verifyChallenge({ message, signature: 'AA'.repeat(50), expectedNonce: nonce });
        expect(r.reason).toBe('sig_invalid');
    });

    it('rejects a challenge with two `address:` lines', async () => {
        const { message, nonce } = issueChallenge({ address: 'bc1qtest', nonce: 'b'.repeat(32) });
        // Splice in a second address line right after the first.
        const lines = message.split('\n');
        const addrIdx = lines.findIndex((l) => l.startsWith('address:'));
        lines.splice(addrIdx + 1, 0, 'address: bc1qEVIL');
        const forged = lines.join('\n');
        const r = await verifyChallenge({ message: forged, signature: 'AA'.repeat(50), expectedNonce: nonce });
        expect(r.reason).toBe('malformed');
    });

    it('rejects a challenge with two `nonce:` lines', async () => {
        const { message } = issueChallenge({ address: 'bc1qtest', nonce: 'c'.repeat(32) });
        const forged = message.replace('nonce: ', 'nonce: d\nnonce: ');
        const r = await verifyChallenge({ message: forged, signature: 'AA'.repeat(50) });
        expect(r.reason).toBe('malformed');
    });

    it('rejects the wrong ack literal', async () => {
        const { message } = issueChallenge({ address: 'bc1qtest', nonce: 'e'.repeat(32) });
        const forged = message.replace('ack: ', 'ack: something else\nold_ack: ');
        const r = await verifyChallenge({ message: forged, signature: 'AA'.repeat(50) });
        expect(r.reason).toBe('malformed');
    });

    it('rejects expired challenges', async () => {
        const { message } = issueChallenge({
            address: 'bc1qtest',
            nonce: 'f'.repeat(32),
            ttlSeconds: 1,
            now: new Date(Date.now() - 60_000),
        });
        const r = await verifyChallenge({ message, signature: 'AA'.repeat(50) });
        expect(r.reason).toBe('expired');
    });

    it('rejects a mismatched expectedNonce', async () => {
        const { message } = issueChallenge({ address: 'bc1qtest', nonce: '1'.repeat(32) });
        const r = await verifyChallenge({
            message,
            signature: 'AA'.repeat(50),
            expectedNonce: '2'.repeat(32),
        });
        expect(r.reason).toBe('nonce_mismatch');
    });
});

describe('verification URL helpers (matches live /attest/<id> route)', () => {
    it('builds the canonical URL', () => {
        expect(getVerificationUrl('a'.repeat(64))).toBe(`https://ochk.io/attest/${'a'.repeat(64)}`);
    });

    it('accepts a custom baseUrl for forks / self-hosted verifiers', () => {
        expect(getVerificationUrl('b'.repeat(64), 'https://example.com')).toBe(
            `https://example.com/attest/${'b'.repeat(64)}`
        );
    });

    it('round-trips an id through getVerificationUrl → extract', () => {
        const id = 'c'.repeat(64);
        expect(extractAttestationIdFromUrl(getVerificationUrl(id))).toBe(id);
    });

    it('still parses legacy /verify?id=<id> URLs', () => {
        const id = 'd'.repeat(64);
        expect(extractAttestationIdFromUrl(`https://ochk.io/verify?id=${id}`)).toBe(id);
    });

    it('returns null for garbage', () => {
        expect(extractAttestationIdFromUrl('not-a-url')).toBeNull();
        expect(extractAttestationIdFromUrl('https://ochk.io/attest/short')).toBeNull();
    });
});
