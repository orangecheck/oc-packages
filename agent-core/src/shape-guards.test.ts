// A delegation or sub-delegation of the wrong shape is refused as E_MALFORMED,
// never thrown on: anyone can publish one under a delegation's d-tag, and a
// verifier that throws loses every good copy read beside it.

import { describe, expect, it } from 'vitest';

import { canonicalizeScopes, computeDelegationId } from './canonical.js';
import type { DelegationEnvelope } from './types.js';
import { verifyDelegation, verifySubdelegation } from './verify.js';

const ISSUED = '2026-04-22T12:00:00Z';
const EXPIRES = '2026-05-22T12:00:00Z';

function delegation(): DelegationEnvelope {
    const principal = 'bc1qprincipal000000000000000000000000000000';
    const agent = 'bc1qagent0000000000000000000000000000000000';
    const scopes = canonicalizeScopes(['ln:send(max_sats<=1000)']);
    const nonce = '0123456789abcdef0123456789abcdef';
    const id = computeDelegationId({
        principal,
        agent,
        scopes,
        bond_sats: 0,
        bond_attestation: 'none',
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
    });
    return {
        v: 1,
        kind: 'agent-delegation',
        id,
        principal: { address: principal, alg: 'bip322' },
        agent: { address: agent, alg: 'bip322' },
        scopes,
        bond: null,
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: { alg: 'bip322', pubkey: principal, value: 'AAAA' },
    };
}

const verify = (env: unknown) =>
    verifyDelegation({
        envelope: env as DelegationEnvelope,
        skipSignatureVerification: true,
        skipRevocationCheck: true,
        skipTemporalCheck: true,
    });

describe('a delegation of the wrong shape is E_MALFORMED, not a throw', () => {
    it('verifies the well-formed one', async () => {
        expect((await verify(delegation())).ok).toBe(true);
    });

    it.each([
        ['no bond field', (d: Record<string, unknown>) => delete d.bond],
        ['a bond that is text', (d: Record<string, unknown>) => (d.bond = 'x')],
        ['a bond that is a list', (d: Record<string, unknown>) => (d.bond = [1])],
        ['scopes_encrypted null', (d: Record<string, unknown>) => {
            delete d.scopes;
            d.scopes_encrypted = null;
        }],
        ['scopes_encrypted text', (d: Record<string, unknown>) => {
            delete d.scopes;
            d.scopes_encrypted = 'x';
        }],
    ])('%s', async (_what, change) => {
        const d = delegation() as unknown as Record<string, unknown>;
        change(d);
        const r = await verify(d);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.code).toBe('E_MALFORMED');
    });

    it('refuses a scope that is not text', async () => {
        const d = delegation() as unknown as Record<string, unknown>;
        d.scopes = [1];
        expect((await verify(d)).ok).toBe(false);
    });
});

describe('a sub-delegation of the wrong shape is E_MALFORMED, not a throw', () => {
    it.each([
        ['scopes_encrypted null', { scopes_encrypted: null }],
        ['scopes_encrypted with no principal', { scopes_encrypted: {}, principal: null }],
    ])('%s', async (_what, over) => {
        const r = await verifySubdelegation({
            envelope: { v: 1, kind: 'agent-subdelegation', ...over } as never,
            parent: delegation(),
            skipSignatureVerification: true,
            skipRevocationCheck: true,
            skipTemporalCheck: true,
        } as never);
        expect(r.ok).toBe(false);
        expect(!r.ok && r.code).toBe('E_MALFORMED');
    });
});
