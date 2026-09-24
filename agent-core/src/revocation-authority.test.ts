// SPEC §9.5 / §9.3: who may revoke a delegation, and when a revocation takes
// effect against an action. `revocation.holders` and `ots` are both outside the
// signatures they sit next to, so neither may narrow what a signed revocation
// does.
import { describe, expect, it } from 'vitest';

import { computeActionId, computeDelegationId, computeRevocationId } from './canonical.js';
import { verifyAction, verifyDelegation, verifyRevocation } from './verify.js';
import type { ActionEnvelope, ActionOts, DelegationEnvelope, RevocationEnvelope } from './types.js';

const PRINCIPAL = 'bc1qprincipal000000000000000000000000000000';
const AGENT = 'bc1qagent0000000000000000000000000000000000';
const SCOPE = 'lock:seal(recipient=bc1qalice000000000000000000000000000000000)';

function delegation(holders: unknown): DelegationEnvelope {
    const canon = {
        principal: PRINCIPAL,
        agent: AGENT,
        scopes: [SCOPE],
        bond_sats: 0,
        bond_attestation: 'none',
        issued_at: '2026-04-22T12:00:00Z',
        expires_at: '2026-04-29T12:00:00Z',
        nonce: '0123456789abcdef0123456789abcdef',
    };
    return {
        v: 1,
        kind: 'agent-delegation',
        id: computeDelegationId(canon),
        principal: { address: PRINCIPAL, alg: 'bip322' },
        agent: { address: AGENT, alg: 'bip322' },
        scopes: [SCOPE],
        bond: null,
        issued_at: canon.issued_at,
        expires_at: canon.expires_at,
        nonce: canon.nonce,
        revocation: { holders, ref: null },
        sig: { alg: 'bip322', pubkey: PRINCIPAL, value: 'AAAA' },
    } as DelegationEnvelope;
}

function revocation(d: DelegationEnvelope, signer: string, signedAt: string, ots: ActionOts | null = null): RevocationEnvelope {
    const id = computeRevocationId({ address: signer, delegation_id: d.id, reason: '', signed_at: signedAt });
    return {
        v: 1,
        kind: 'agent-revocation',
        id,
        delegation_id: d.id,
        signer: { address: signer, alg: 'bip322' },
        reason: '',
        signed_at: signedAt,
        ots,
        sig: { alg: 'bip322', pubkey: signer, value: 'AAAA' },
    };
}

function action(d: DelegationEnvelope, signedAt: string, ots: ActionOts | null = null): ActionEnvelope {
    const canon = {
        address: AGENT,
        content_hash: 'sha256:' + '00'.repeat(32),
        content_length: 0,
        content_mime: 'text/plain',
        signed_at: signedAt,
        delegation_id: d.id,
        scope_exercised: SCOPE,
    };
    return {
        v: 1,
        kind: 'agent-action',
        id: computeActionId(canon),
        content: { hash: canon.content_hash, length: 0, mime: 'text/plain', ref: null },
        signer: { address: AGENT, alg: 'bip322' },
        signed_at: signedAt,
        delegation_id: d.id,
        scope_exercised: SCOPE,
        ots,
        sig: { alg: 'bip322', pubkey: AGENT, value: 'AAAA' },
    } as ActionEnvelope;
}

function confirmed(height: number): ActionOts {
    return {
        status: 'confirmed',
        proof: 'AAAA',
        calendars: [],
        block_height: height,
        block_hash: 'ab'.repeat(32),
        upgraded_at: null,
    };
}

const AT = new Date('2026-04-23T12:00:00Z');

describe('revocation authority always includes the principal', () => {
    for (const holders of [['agent'], [], ['principal'], undefined, 'agent']) {
        it(`principal revocation is honoured with holders=${JSON.stringify(holders)}`, async () => {
            const d = delegation(holders);
            const rev = revocation(d, PRINCIPAL, '2026-04-23T00:00:00Z');
            const rr = await verifyRevocation({ envelope: rev, delegation: d, skipSignatureVerification: true });
            expect(rr.ok).toBe(true);
            const dr = await verifyDelegation({
                envelope: d,
                revocations: [rev],
                skipSignatureVerification: true,
                now: AT,
            });
            expect(dr.ok === false && dr.code).toBe('E_REVOKED');
            const ar = await verifyAction({
                action: action(d, '2026-04-23T06:00:00Z'),
                delegation: d,
                revocations: [rev],
                skipSignatureVerification: true,
            });
            expect(ar.ok === false && ar.code).toBe('E_REVOKED');
        });
    }

    it('the agent may revoke only when holders lists it', async () => {
        const open = delegation(['principal', 'agent']);
        const closed = delegation(['principal']);
        const okR = await verifyRevocation({
            envelope: revocation(open, AGENT, '2026-04-23T00:00:00Z'),
            delegation: open,
            skipSignatureVerification: true,
        });
        expect(okR.ok).toBe(true);
        const noR = await verifyRevocation({
            envelope: revocation(closed, AGENT, '2026-04-23T00:00:00Z'),
            delegation: closed,
            skipSignatureVerification: true,
        });
        expect(noR.ok === false && noR.code).toBe('E_REVOKER_UNAUTHORIZED');
    });

    it('a third party is never an authorised revoker', async () => {
        const d = delegation(['principal', 'agent']);
        const r = await verifyRevocation({
            envelope: revocation(d, 'bc1qother0000000000000000000000000000000000', '2026-04-23T00:00:00Z'),
            delegation: d,
            skipSignatureVerification: true,
        });
        expect(r.ok === false && r.code).toBe('E_REVOKER_UNAUTHORIZED');
    });
});

describe('revocation priority uses only verified anchors', () => {
    const d = delegation(['principal']);
    // Revocation signed before the action: revoked unless the action proves priority.
    const rev = revocation(d, PRINCIPAL, '2026-04-23T00:00:00Z');
    const later = '2026-04-23T06:00:00Z';

    it('an action anchor with no anchor verifier does not outrank a revocation', async () => {
        const r = await verifyAction({
            action: action(d, later, confirmed(1)),
            delegation: d,
            revocations: [rev],
            skipSignatureVerification: true,
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
    });

    it('an action anchor the verifier rejects does not outrank a revocation', async () => {
        const r = await verifyAction({
            action: action(d, later, confirmed(1)),
            delegation: d,
            revocations: [rev],
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => false,
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
        const clean = await verifyAction({
            action: action(d, later, confirmed(1)),
            delegation: d,
            revocations: [],
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => false,
        });
        expect(clean.ok && clean.anchor).toEqual({
            status: 'confirmed',
            blockHeight: 1,
            blockHash: 'ab'.repeat(32),
            verified: false,
        });
    });

    it('the anchor verifier is asked about the envelope it belongs to', async () => {
        const a = action(d, later, confirmed(100));
        const revAnchored = revocation(d, PRINCIPAL, '2026-04-23T00:00:00Z', confirmed(200));
        const seen: string[] = [];
        const r = await verifyAction({
            action: a,
            delegation: d,
            revocations: [revAnchored],
            skipSignatureVerification: true,
            verifyOtsAnchor: async (_p, _h, _b, id) => {
                seen.push(id);
                return true;
            },
        });
        expect(seen).toEqual([a.id, revAnchored.id]);
        // Both verified: action at 100 precedes revocation at 200 (§9.3).
        expect(r.ok).toBe(true);
    });

    it('a verified action anchor against an unanchored revocation falls back to signed times', async () => {
        const r = await verifyAction({
            action: action(d, later, confirmed(1)),
            delegation: d,
            revocations: [rev],
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => true,
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
        const before = await verifyAction({
            action: action(d, '2026-04-22T18:00:00Z', confirmed(1)),
            delegation: d,
            revocations: [rev],
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => true,
        });
        expect(before.ok).toBe(true);
    });

    it('a revocation anchor that does not verify cannot move the revocation later', async () => {
        const revFarFuture = revocation(d, PRINCIPAL, '2026-04-23T00:00:00Z', confirmed(10_000_000));
        const a = action(d, later, confirmed(100));
        const r = await verifyAction({
            action: a,
            delegation: d,
            revocations: [revFarFuture],
            skipSignatureVerification: true,
            verifyOtsAnchor: async (_p, _h, _b, id) => id === a.id,
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
    });

    it('both anchors verified: the later block does not revoke the earlier action', async () => {
        const a = action(d, later, confirmed(300));
        const revAt = (h: number) => revocation(d, PRINCIPAL, '2026-04-23T00:00:00Z', confirmed(h));
        const verifyOtsAnchor = async () => true;
        const earlierRev = await verifyAction({
            action: a,
            delegation: d,
            revocations: [revAt(300)],
            skipSignatureVerification: true,
            verifyOtsAnchor,
        });
        expect(earlierRev.ok === false && earlierRev.code).toBe('E_REVOKED');
        const laterRev = await verifyAction({
            action: a,
            delegation: d,
            revocations: [revAt(301)],
            skipSignatureVerification: true,
            verifyOtsAnchor,
        });
        expect(laterRev.ok).toBe(true);
    });
});
