/**
 * Happy-path coverage for the SDK's public API beyond the security regressions
 * and the conformance vectors. We're not aiming for 100% — we're pinning down
 * the contract for the load-bearing entry points (check / verify building
 * blocks / attestation envelope / challenge flow / scoring) so refactors can't
 * silently change user-visible behavior.
 *
 * Network-touching paths (check() hitting Esplora, publishToRelays hitting a
 * relay) are NOT exercised here — that's integration territory. Everything
 * here runs offline.
 */

import { describe, expect, it } from 'vitest';

import {
    buildCanonicalMessage,
    computeAllScores,
    computeScore,
    createAttestationEnvelope,
    extractAttestationIdFromUrl,
    formatIdentities,
    formatIdentitiesForDisplay,
    generateAttestationId,
    getVerificationUrl,
    issueChallenge,
    parseIdentities,
} from '../index';

const FIXED_NONCE = '0011223344556677889900aabbccddee';
const FIXED_T = '2026-04-22T12:00:00Z';

describe('buildCanonicalMessage', () => {
    it('emits exactly one trailing LF', () => {
        const msg = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [] },
            {},
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        expect(msg.endsWith('\n')).toBe(true);
        expect(msg.endsWith('\n\n')).toBe(false);
    });

    it('places core lines in the fixed order mandated by SPEC §2', () => {
        const msg = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [{ protocol: 'github', identifier: 'alice' }] },
            {},
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        const lines = msg.split('\n');
        expect(lines[0]).toBe('orangecheck');
        expect(lines[1]).toBe('identities: github:alice');
        expect(lines[2]).toBe('address: bc1qtest');
        expect(lines[3]).toBe('purpose: portable reputation attestation (non-custodial)');
        expect(lines[4]!.startsWith('nonce: ')).toBe(true);
        expect(lines[5]!.startsWith('issued_at: ')).toBe(true);
        expect(lines[6]!.startsWith('ack: ')).toBe(true);
    });

    it('drops empty-string extension values', () => {
        const msg = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [] },
            { keep: 'v', drop: '' },
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        expect(msg).toContain('keep: v');
        expect(msg).not.toContain('drop:');
    });

    it('lowercases extension keys', () => {
        const msg = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [] },
            { BOND: '100' },
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        expect(msg).toContain('bond: 100');
        expect(msg).not.toContain('BOND: 100');
    });

    it('rejects an invalid nonce override (not hex)', () => {
        expect(() =>
            buildCanonicalMessage(
                { address: 'bc1qtest', identities: [] },
                {},
                { nonce: 'not-hex', issuedAt: FIXED_T }
            )
        ).toThrow(/nonce/i);
    });

    it('mints a fresh nonce + timestamp when no overrides are passed', () => {
        const a = buildCanonicalMessage({ address: 'bc1qtest', identities: [] }, {});
        const b = buildCanonicalMessage({ address: 'bc1qtest', identities: [] }, {});
        // Different nonces (and possibly timestamps) → different messages.
        expect(a).not.toBe(b);
        const nonceLine = a.match(/nonce: ([^\n]+)/)?.[1];
        expect(nonceLine).toMatch(/^[0-9a-f]{32}$/);
    });
});

describe('parseIdentities round-trip', () => {
    it('parse ∘ format = identity', () => {
        const xs = [
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'nostr', identifier: 'npub1abc' },
            { protocol: 'dns', identifier: 'alice.com' },
        ];
        const roundtripped = parseIdentities(formatIdentities(xs));
        // parse returns them in the lex-sorted order format produces,
        // not the original input order.
        expect(roundtripped).toEqual([
            { protocol: 'dns', identifier: 'alice.com' },
            { protocol: 'github', identifier: 'alice' },
            { protocol: 'nostr', identifier: 'npub1abc' },
        ]);
    });

    it('handles the empty string', () => {
        expect(parseIdentities('')).toEqual([]);
        expect(parseIdentities('   ')).toEqual([]);
    });

    it('rejects a missing colon', () => {
        expect(() => parseIdentities('github-alice')).toThrow();
    });
});

describe('generateAttestationId', () => {
    it('produces 64 lowercase hex chars', async () => {
        const id = await generateAttestationId('hello');
        expect(id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same message', async () => {
        const a = await generateAttestationId('orangecheck\n...');
        const b = await generateAttestationId('orangecheck\n...');
        expect(a).toBe(b);
    });

    it('changes if a single byte changes', async () => {
        const a = await generateAttestationId('orangecheck\nfoo');
        const b = await generateAttestationId('orangecheck\nfoq');
        expect(a).not.toBe(b);
    });
});

describe('createAttestationEnvelope', () => {
    it('binds all caller-visible fields and derives attestation_id', async () => {
        const message = buildCanonicalMessage(
            {
                address: 'bc1qtest',
                identities: [{ protocol: 'github', identifier: 'alice' }],
            },
            {},
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        const envelope = await createAttestationEnvelope(
            message,
            'AA'.repeat(64),
            'bip322',
            'bc1qtest',
            [{ protocol: 'github', identifier: 'alice' }]
        );
        expect(envelope.address).toBe('bc1qtest');
        expect(envelope.scheme).toBe('bip322');
        expect(envelope.message).toBe(message);
        expect(envelope.attestation_id).toMatch(/^[0-9a-f]{64}$/);
        expect(envelope.verification_url).toBe(
            `https://ochk.io/attest/${envelope.attestation_id}`
        );
        expect(envelope.identities).toEqual([{ protocol: 'github', identifier: 'alice' }]);
    });

    it('base64url-encodes the message for embedding', async () => {
        const message = buildCanonicalMessage(
            { address: 'bc1qtest', identities: [] },
            {},
            { nonce: FIXED_NONCE, issuedAt: FIXED_T }
        );
        const envelope = await createAttestationEnvelope(
            message,
            'AA'.repeat(64),
            'bip322',
            'bc1qtest',
            []
        );
        // base64url has no padding, no `+` or `/`
        expect(envelope.message_b64url).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});

describe('issueChallenge', () => {
    it('produces a nonce + message with the expected shape', () => {
        const c = issueChallenge({ address: 'bc1qtest' });
        expect(c.nonce).toMatch(/^[0-9a-f]{32}$/);
        expect(c.message).toContain('orangecheck-auth\n');
        expect(c.message).toContain(`address: bc1qtest\n`);
        expect(c.message).toContain(`nonce: ${c.nonce}\n`);
        expect(c.expiresAt).toBeGreaterThan(Date.now());
    });

    it('includes audience + purpose when set', () => {
        const c = issueChallenge({
            address: 'bc1qtest',
            audience: 'https://example.com',
            purpose: 'login',
        });
        expect(c.message).toContain('audience: https://example.com');
        expect(c.message).toContain('purpose: login');
    });

    it('rejects a bad pre-supplied nonce', () => {
        expect(() =>
            issueChallenge({ address: 'bc1qtest', nonce: 'not-hex' })
        ).toThrow(/nonce/i);
    });
});

describe('computeScore / computeAllScores', () => {
    it('matches the published formula for documented points', () => {
        // Points taken from the SPEC's interpretation table.
        const s = (sats: number, days: number) =>
            computeScore(sats, days, { algorithm: 'v0' }) as number;
        expect(s(0, 0)).toBe(0);
        expect(s(100_000, 30)).toBeCloseTo(23.03, 2);
        expect(s(1_000_000, 365)).toBeGreaterThan(180);
    });

    it('computeAllScores returns both v0 and tier', () => {
        const all = computeAllScores(1_000_000, 365);
        expect(all).toHaveProperty('v0');
        expect(all).toHaveProperty('tier');
        expect(typeof all.v0).toBe('number');
    });
});

describe('URL helpers', () => {
    it('round-trip', () => {
        const id = '0123456789abcdef'.repeat(4);
        expect(extractAttestationIdFromUrl(getVerificationUrl(id))).toBe(id);
    });

    it('getVerificationUrl honors a custom base', () => {
        const id = 'a'.repeat(64);
        expect(getVerificationUrl(id, 'https://example.com')).toBe(
            `https://example.com/attest/${id}`
        );
    });

    it('formatIdentitiesForDisplay produces a readable list', () => {
        expect(
            formatIdentitiesForDisplay([
                { protocol: 'github', identifier: 'alice' },
                { protocol: 'nostr', identifier: 'npub1xyz' },
            ])
        ).toBe('github:alice, nostr:npub1xyz');
    });
});
