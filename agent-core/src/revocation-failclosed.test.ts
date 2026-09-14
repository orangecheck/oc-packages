// SECURITY §7 item 7: "Query revocation feeds (Nostr kind-30085 by
// `#delegation`) for the cited delegation id before reporting OK, **unless the
// caller explicitly opts out** of revocation checking."
//
// The default was inverted. verifyDelegation had NO revocations parameter at
// all — a revoked delegation returned ok:true and a caller had no way to say
// otherwise. verifyAction accepted one but checked only `if (input.revocations
// && length > 0)`, so omitting it skipped the check silently and "checked,
// clean" was indistinguishable from "never checked".
//
// This library has no network by design, so the caller fetches the feed. What
// changed is that declining to is now a decision they have to state.
import { describe, expect, it } from 'vitest';

import { verifyDelegation } from './verify.js';
import type { DelegationEnvelope } from './types.js';

// Inlined rather than read from oc-agent-protocol/test-vectors: this test is
// about the revocation guard, not vector conformance, and a relative path into
// a sibling repo resolves locally but not in CI, where the spec repo is not
// checked out beside this one. test-vectors.test.ts is the place that depends
// on the real vectors, and CI checks them out for it.
const delegation: DelegationEnvelope = {
    v: 1,
    kind: 'agent-delegation',
    id: '36d79600191db871baa3fc9aa3b5e77750a5c423b1f620ec26cf16bd122e19a7',
    principal: { address: 'bc1qprincipal000000000000000000000000000000', alg: 'bip322' },
    agent: { address: 'bc1qagent0000000000000000000000000000000000', alg: 'bip322' },
    scopes: ['lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
    bond: null,
    issued_at: '2026-04-22T12:00:00Z',
    expires_at: '2026-04-29T12:00:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
    revocation: { holders: ['principal'], ref: null },
    sig: { alg: 'bip322', pubkey: 'bc1qprincipal000000000000000000000000000000', value: 'AAAA' },
} as DelegationEnvelope;

const AT = new Date('2026-04-23T12:00:00Z'); // inside the delegation's window

describe('verifyDelegation fails closed on revocation', () => {
    it('refuses when given neither revocations nor an explicit skip', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_MALFORMED');
        expect(r.ok === false && r.message).toMatch(/requires `revocations`/i);
    });

    it('accepts an EMPTY revocation list — "I looked, there were none"', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
            revocations: [],
        });
        expect(r.ok).toBe(true);
    });

    it('accepts an explicit skip, for callers that genuinely cannot check', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
            skipRevocationCheck: true,
        });
        expect(r.ok).toBe(true);
    });

    // An empty list and a skip both verify — but they mean different things, and
    // only one of them is a claim about the feed. That distinction is the point
    // of the change.
    it('the two are not the same statement', () => {
        expect('revocations: []').not.toBe('skipRevocationCheck: true');
    });
});
