// SPEC §4.4: expires_at > issued_at and expires_at - issued_at ≤ 365 days, checked at
// §8.1 step 2 (E_MALFORMED) whatever the clock says. Every envelope here has an honest
// id, so without the window check each one would verify.

import { describe, expect, it } from 'vitest';

import { canonicalizeScopes, computeDelegationId } from './canonical.js';
import type { DelegationEnvelope } from './types.js';
import { verifyDelegation } from './verify.js';

const ISSUED = '2026-04-22T12:00:00Z';
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

function delegation(issued_at: string, expires_at: string): DelegationEnvelope {
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
        issued_at,
        expires_at,
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
        issued_at,
        expires_at,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: { alg: 'bip322', pubkey: principal, value: 'AAAA' },
    };
}

const verify = (env: DelegationEnvelope, now?: Date) =>
    verifyDelegation({
        envelope: env,
        skipSignatureVerification: true,
        skipRevocationCheck: true,
        ...(now ? { now } : { skipTemporalCheck: true }),
    });

describe('delegation window (SPEC §4.4)', () => {
    const issuedMs = Date.parse(ISSUED);

    it('accepts exactly 365 days', async () => {
        expect((await verify(delegation(ISSUED, iso(issuedMs + 365 * DAY)))).ok).toBe(true);
    });

    it('rejects 365 days and one second with E_MALFORMED', async () => {
        const r = await verify(delegation(ISSUED, iso(issuedMs + 365 * DAY + 1000)));
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
        if (!r.ok) expect(r.message).toBe('expires_at is more than 365 days after issued_at (SPEC §4.4)');
    });

    it('rejects 366 days even inside the window, so the clock cannot rescue it', async () => {
        const r = await verify(delegation(ISSUED, iso(issuedMs + 366 * DAY)), new Date(issuedMs + DAY));
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it('rejects expires_at equal to issued_at with temporal checks skipped', async () => {
        const r = await verify(delegation(ISSUED, ISSUED));
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
        if (!r.ok) expect(r.message).toBe('expires_at must be after issued_at');
    });

    it('rejects a timestamp that is shaped right but is no real time', async () => {
        const r = await verify(delegation(ISSUED, '2026-13-01T00:00:00Z'));
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });
});
