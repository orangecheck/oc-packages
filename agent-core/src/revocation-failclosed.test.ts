// SECURITY §5 item 7: "Query revocation feeds (Nostr kind-30085 by `#t` with
// the cited delegation id) before reporting OK, **unless the caller explicitly
// opts out** of revocation checking."
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

import { computeActionId } from './canonical.js';
import { verifyAction, verifyDelegation } from './verify.js';
import type { ActionEnvelope, DelegationEnvelope } from './types.js';

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
});

// The refusal tells the caller how to fetch revocations. SPEC §9.4: relays index
// single-letter tags only and reject a `#delegation` filter (SPEC §10.4), so the
// message must name the `#t` query.
describe('the refusal names a query relays answer', () => {
    const action: ActionEnvelope = (() => {
        const canon = {
            address: delegation.agent.address,
            content_hash: 'sha256:' + '00'.repeat(32),
            content_length: 0,
            content_mime: 'text/plain',
            signed_at: '2026-04-23T12:00:00Z',
            delegation_id: delegation.id,
            scope_exercised: delegation.scopes![0]!,
        };
        return {
            v: 1,
            kind: 'agent-action',
            id: computeActionId(canon),
            content: { hash: canon.content_hash, length: 0, mime: 'text/plain', ref: null },
            signer: { address: canon.address, alg: 'bip322' },
            signed_at: canon.signed_at,
            delegation_id: delegation.id,
            scope_exercised: canon.scope_exercised,
            ots: null,
            sig: { alg: 'bip322', pubkey: canon.address, value: 'AAAA' },
        } as ActionEnvelope;
    })();

    it('verifyDelegation', async () => {
        const r = await verifyDelegation({ envelope: delegation, skipSignatureVerification: true, now: AT });
        expect(r.ok === false && r.message).toMatch(/"#t": \[delegation id\]/);
        expect(r.ok === false && r.message).not.toMatch(/#delegation/);
    });

    it('verifyAction', async () => {
        const r = await verifyAction({ action, delegation, skipSignatureVerification: true });
        expect(r.ok === false && r.code).toBe('E_MALFORMED');
        expect(r.ok === false && r.message).toMatch(/"#t": \[id of every link in the chain\]/);
        expect(r.ok === false && r.message).not.toMatch(/#delegation/);
    });
});
