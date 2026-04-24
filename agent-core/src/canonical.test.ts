import { describe, expect, it } from 'vitest';

import {
    actionCanonicalMessage,
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    delegationCanonicalMessage,
    revocationCanonicalMessage,
} from './canonical.js';

describe('delegation canonical message', () => {
    it('sorts scopes lexicographically and serializes fields LF-terminated', () => {
        const msg = delegationCanonicalMessage({
            principal: 'bc1qprincipal',
            agent: 'bc1qagent',
            scopes: canonicalizeScopes(['stamp:sign(mime=text/markdown)', 'lock:seal(recipient=bc1qalice)']),
            bond_sats: 0,
            bond_attestation: 'none',
            issued_at: '2026-04-22T12:00:00Z',
            expires_at: '2026-04-29T12:00:00Z',
            nonce: '0123456789abcdef0123456789abcdef',
        });
        expect(msg.startsWith('oc-agent:delegation:v1\n')).toBe(true);
        expect(msg).toContain('scopes: lock:seal(recipient=bc1qalice),stamp:sign(mime=text/markdown)');
        expect(msg.endsWith('\n')).toBe(false);
    });

    it('produces a deterministic id across identical inputs', () => {
        const input = {
            principal: 'bc1qprincipal000000000000000000000000000000',
            agent: 'bc1qagent0000000000000000000000000000000000',
            scopes: ['lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
            bond_sats: 0,
            bond_attestation: 'none',
            issued_at: '2026-04-22T12:00:00Z',
            expires_at: '2026-04-29T12:00:00Z',
            nonce: '0123456789abcdef0123456789abcdef',
        };
        const id1 = computeDelegationId(input);
        const id2 = computeDelegationId(input);
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('action canonical message', () => {
    it('includes delegation_id and scope_exercised on extra lines', () => {
        const msg = actionCanonicalMessage({
            address: 'bc1qagent',
            content_hash: 'sha256:' + '3'.repeat(64),
            content_length: 1024,
            content_mime: 'application/vnd.oc-lock+json',
            signed_at: '2026-04-22T12:05:00Z',
            delegation_id: 'a'.repeat(64),
            scope_exercised: 'lock:seal(recipient=bc1qalice)',
        });
        expect(msg.startsWith('oc-agent:action:v1\n')).toBe(true);
        expect(msg).toContain('delegation_id: ' + 'a'.repeat(64));
        expect(msg).toContain('scope_exercised: lock:seal(recipient=bc1qalice)');
    });

    it('id is computable', () => {
        const id = computeActionId({
            address: 'bc1qagent',
            content_hash: 'sha256:' + '3'.repeat(64),
            content_length: 1,
            content_mime: 'text/plain',
            signed_at: '2026-04-22T12:05:00Z',
            delegation_id: 'a'.repeat(64),
            scope_exercised: 'lock:seal(recipient=bc1qalice)',
        });
        expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('revocation canonical message', () => {
    it('serializes empty reason as a blank line value', () => {
        const msg = revocationCanonicalMessage({
            address: 'bc1qprincipal',
            delegation_id: 'a'.repeat(64),
            reason: '',
            signed_at: '2026-04-22T14:00:00Z',
        });
        expect(msg).toContain('\nreason: \n');
        const id = computeRevocationId({
            address: 'bc1qprincipal',
            delegation_id: 'a'.repeat(64),
            reason: '',
            signed_at: '2026-04-22T14:00:00Z',
        });
        expect(id).toMatch(/^[0-9a-f]{64}$/);
    });
});
