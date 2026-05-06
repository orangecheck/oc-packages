import { describe, expect, it } from 'vitest';

import { validateResolutionQuery } from './resolution.js';

describe('validateResolutionQuery', () => {
    it('accepts canonical chain_state predicates and AND-joined ones', () => {
        const queries = [
            'address(bc1qalice000000000000000000000000000000000).utxo_count >= 1',
            'address(bc1qalice000).balance >= 500000',
            'address(bc1qalice000).balance >= 1000000 AT block(925000)',
            'address(bc1q).utxo_count >= 1 AND address(bc1q).balance >= 500000',
            'block(920000).exists',
            'block(920000).hash.startsWith(0000)',
            'tx(' + 'a'.repeat(64) + ').confirmed',
            'tx(' + 'a'.repeat(64) + ').confirmations >= 6',
        ];
        for (const q of queries) {
            const r = validateResolutionQuery('chain_state', q);
            expect(r.ok, `chain_state should accept: ${q}`).toBe(true);
        }
    });

    it('rejects malformed chain_state queries', () => {
        const bad = [
            'random gibberish',
            'address(x).foo == 1',
        ];
        for (const q of bad) {
            const r = validateResolutionQuery('chain_state', q);
            expect(r.ok).toBe(false);
        }
    });

    it('accepts the canonical counterparty_signs form', () => {
        const r = validateResolutionQuery(
            'counterparty_signs',
            'counterparty(bc1qcounter0000000000000000000000000000000) signs outcome over pledge_id',
        );
        expect(r.ok).toBe(true);
    });

    it('accepts a well-formed nostr_event_exists query', () => {
        const r = validateResolutionQuery(
            'nostr_event_exists',
            'kind=1 author=npub1xyz tag(d)=oc-stamp:abc created_at_before=2026-09-01T00:00:00Z',
        );
        expect(r.ok).toBe(true);
    });

    it('accepts the stamp_published form', () => {
        const r = validateResolutionQuery(
            'stamp_published',
            'stamp(content_hash=sha256:' + 'e'.repeat(64) + ', signer=bc1qalice000000000000000000000000000000000)',
        );
        expect(r.ok).toBe(true);
    });

    it('accepts the http_get_hash form', () => {
        const r = validateResolutionQuery(
            'http_get_hash',
            'GET https://example.com/release.tar.gz body_sha256 == ' + '0'.repeat(64),
        );
        expect(r.ok).toBe(true);
    });

    it('accepts dns_record forms', () => {
        const queries = [
            'A example.com == 192.0.2.1',
            'TXT _verify.example.com == oc-pledge=abc',
            'CAA example.com == 0 issue letsencrypt.org',
            'MX example.com == 10 mail.example.com',
        ];
        for (const q of queries) {
            const r = validateResolutionQuery('dns_record', q);
            expect(r.ok, q).toBe(true);
        }
    });

    it('accepts vote_resolves form', () => {
        const r = validateResolutionQuery(
            'vote_resolves',
            'poll_id=' + '0'.repeat(64) + ' option=kept threshold=0.66',
        );
        expect(r.ok).toBe(true);
    });

    it('refuses self_proof with E_RESOLUTION_NONDETERMINISTIC', () => {
        const r = validateResolutionQuery('self_proof', 'I say so');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_RESOLUTION_NONDETERMINISTIC');
    });

    it('rejects unknown mechanisms with E_RESOLUTION_UNKNOWN', () => {
        const r = validateResolutionQuery('teapot_says_so', 'whatever');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_RESOLUTION_UNKNOWN');
    });

    it('rejects multi-line queries', () => {
        const r = validateResolutionQuery('chain_state', 'address(x).balance >= 1\naddress(x).balance >= 2');
        expect(r.ok).toBe(false);
    });
});
