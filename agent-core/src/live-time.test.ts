// SPEC §8.1 step 6 checks the delegation at the time of verification, not at
// the action's signed_at. The agent picks signed_at, so an action that only
// had to fit the delegation's window could be backdated past its expiry or past
// a revocation and still verify. A live verifier checks at `now`; an audit of a
// past action says outright that it relied on the agent's claimed time.
import { describe, expect, it } from 'vitest';

import { computeActionId, computeRevocationId } from './canonical.js';
import { createReplayGuard, verifyAction, verifyActionAsOfSignedAt } from './verify.js';
import type { ActionEnvelope, DelegationEnvelope, RevocationEnvelope } from './types.js';

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

function action(signed_at: string): ActionEnvelope {
    const canon = {
        address: delegation.agent.address,
        content_hash: 'sha256:' + '00'.repeat(32),
        content_length: 0,
        content_mime: 'text/plain',
        signed_at,
        delegation_id: delegation.id,
        scope_exercised: delegation.scopes![0]!,
    };
    return {
        v: 1,
        kind: 'agent-action',
        id: computeActionId(canon),
        content: { hash: canon.content_hash, length: 0, mime: 'text/plain', ref: null },
        signer: { address: canon.address, alg: 'bip322' },
        signed_at,
        delegation_id: delegation.id,
        scope_exercised: canon.scope_exercised,
        ots: null,
        sig: { alg: 'bip322', pubkey: canon.address, value: 'AAAA' },
    } as ActionEnvelope;
}

function revocation(signed_at: string): RevocationEnvelope {
    const canon = { address: delegation.principal.address, delegation_id: delegation.id, reason: '', signed_at };
    return {
        v: 1,
        kind: 'agent-revocation',
        id: computeRevocationId(canon),
        delegation_id: delegation.id,
        signer: { address: canon.address, alg: 'bip322' },
        reason: '',
        signed_at,
        ots: null,
        sig: { alg: 'bip322', pubkey: canon.address, value: 'AAAA' },
    } as RevocationEnvelope;
}

const base = { delegation, skipSignatureVerification: true };

describe('live verification checks at now', () => {
    it('refuses an action backdated into the window of a delegation that has expired', async () => {
        const r = await verifyAction({
            ...base,
            action: action('2026-04-28T00:00:00Z'),
            revocations: [],
            now: new Date('2026-05-01T00:00:00Z'),
        });
        expect(r.ok === false && r.code).toBe('E_EXPIRED');
    });

    it('refuses an action backdated to before a revocation that is already in effect', async () => {
        const r = await verifyAction({
            ...base,
            action: action('2026-04-24T11:59:00Z'),
            revocations: [revocation('2026-04-24T11:59:30Z')],
            now: new Date('2026-04-24T12:00:00Z'),
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
    });

    it('refuses an action signed further from now than the freshness bound', async () => {
        const now = new Date('2026-04-24T12:00:00Z');
        const old = await verifyAction({ ...base, action: action('2026-04-24T11:50:00Z'), revocations: [], now });
        expect(old.ok === false && old.code).toBe('E_STALE');
        const ahead = await verifyAction({ ...base, action: action('2026-04-24T12:05:00Z'), revocations: [], now });
        expect(ahead.ok === false && ahead.code).toBe('E_STALE');
    });

    it('accepts a fresh action under a clear feed, and says it was checked at now', async () => {
        const now = new Date('2026-04-24T12:00:00Z');
        const r = await verifyAction({ ...base, action: action('2026-04-24T11:59:30Z'), revocations: [], now });
        expect(r.ok).toBe(true);
        expect(r.ok && r.asOf).toEqual({ basis: 'now', now: '2026-04-24T12:00:00.000Z' });
    });

    it('takes a wider freshness bound when the caller sets one', async () => {
        const r = await verifyAction({
            ...base,
            action: action('2026-04-24T11:50:00Z'),
            revocations: [],
            now: new Date('2026-04-24T12:00:00Z'),
            maxSkewMs: 15 * 60_000,
        });
        expect(r.ok).toBe(true);
    });

    it('does not let a revocation dated in the future refuse an action today', async () => {
        const r = await verifyAction({
            ...base,
            action: action('2026-04-24T11:59:30Z'),
            revocations: [revocation('2026-04-25T00:00:00Z')],
            now: new Date('2026-04-24T12:00:00Z'),
        });
        expect(r.ok).toBe(true);
    });
});

describe('an audit checks as of signed_at, and says that time is a claim', () => {
    it('accepts a past action inside its window, with an unanchored signed_at', async () => {
        const r = await verifyActionAsOfSignedAt({ ...base, action: action('2026-04-28T00:00:00Z'), revocations: [] });
        expect(r.ok).toBe(true);
        expect(r.ok && r.asOf).toEqual({ basis: 'signed_at', signedAt: '2026-04-28T00:00:00Z', anchored: false });
    });

    it('still refuses an action that claims a time after the revocation', async () => {
        const r = await verifyActionAsOfSignedAt({
            ...base,
            action: action('2026-04-24T12:00:00Z'),
            revocations: [revocation('2026-04-24T11:59:30Z')],
        });
        expect(r.ok === false && r.code).toBe('E_REVOKED');
    });
});

describe('createReplayGuard', () => {
    it('admits an action once, and forgets it when it could no longer pass as fresh', () => {
        const guard = createReplayGuard(120_000);
        const a = action('2026-04-24T12:00:00Z');
        expect(guard.firstUse(a, new Date('2026-04-24T12:00:05Z'))).toBe(true);
        expect(guard.firstUse(a, new Date('2026-04-24T12:01:00Z'))).toBe(false);
        expect(guard.firstUse(a, new Date('2026-04-24T12:02:01Z'))).toBe(true);
    });
});
