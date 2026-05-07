// Unit tests for the agent-delegation §7.3 logic in pledge-core.
//
// Two surfaces:
//   - parsePledgeCreateScope / checkPledgeCreateScope (pure scope-string
//     parsing + constraint matching)
//   - verifyPledge with delegationLookup wired in (end-to-end verify path)

import { describe, expect, it } from 'vitest';

import { computePledgeId } from './canonical.js';
import { checkPledgeCreateScope, parsePledgeCreateScope } from './delegation.js';
import { verifyPledge } from './pledge.js';
import {
    ENVELOPE_VERSION,
    type DelegationLookupResult,
    type PledgeEnvelope,
} from './types.js';

function pledge(opts: Partial<PledgeEnvelope> = {}): PledgeEnvelope {
    const base = {
        swearer: { address: 'bc1qprincipal', alg: 'bip322' as const },
        proposition: 'p',
        resolution: { mechanism: 'chain_state' as const, query: 'q' },
        resolves_at: { block: 100 } as PledgeEnvelope['resolves_at'],
        expires_at: '2099-01-01T00:00:00Z',
        bond: { attestation_id: '0'.repeat(64), min_sats: 1_000_000, min_days: 90 },
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded' as const,
        sworn_at: '2026-04-01T00:00:00Z',
        nonce: '0'.repeat(32),
        ...opts,
    };
    const id = computePledgeId({
        swearer: base.swearer.address,
        proposition: base.proposition,
        resolution: base.resolution,
        resolves_at: base.resolves_at,
        expires_at: base.expires_at,
        bond: base.bond,
        counterparty: base.counterparty,
        dispute: base.dispute,
        remediation: base.remediation,
        sworn_at: base.sworn_at,
        nonce: base.nonce,
    });
    // Default to agent-delegated; tests opt out by passing via_delegation:
    // undefined explicitly (in: 'via_delegation' in opts).
    const useAgentPath = !('via_delegation' in opts) || opts.via_delegation !== undefined;
    const env: PledgeEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id,
        ...base,
        sig:
            opts.sig ??
            (useAgentPath
                ? { alg: 'bip322', pubkey: 'bc1qagent', value: 'AAAA' }
                : { alg: 'bip322', pubkey: base.swearer.address, value: 'AAAA' }),
    };
    if (useAgentPath) {
        env.via_delegation = (opts.via_delegation as string | undefined) ?? 'd'.repeat(64);
        env.agent_address = (opts.agent_address as string | undefined) ?? 'bc1qagent';
    }
    return env;
}

function delegation(opts: Partial<DelegationLookupResult> = {}): DelegationLookupResult {
    return {
        principal: 'bc1qprincipal',
        agent: 'bc1qagent',
        scopes: ['pledge:create'],
        expires_at: '2099-01-01T00:00:00Z',
        ...opts,
    };
}

describe('parsePledgeCreateScope', () => {
    it('returns {} for the bare scope', () => {
        expect(parsePledgeCreateScope('pledge:create')).toEqual({});
    });
    it('parses a single max_bond_sats constraint', () => {
        expect(parsePledgeCreateScope('pledge:create(max_bond_sats=2000000)')).toEqual({
            max_bond_sats: '2000000',
        });
    });
    it('parses multiple comma-joined constraints', () => {
        expect(
            parsePledgeCreateScope(
                'pledge:create(max_bond_sats=2000000,mechanism=chain_state,counterparty=bc1qcp)',
            ),
        ).toEqual({
            max_bond_sats: '2000000',
            mechanism: 'chain_state',
            counterparty: 'bc1qcp',
        });
    });
    it('returns null for non-pledge:create scopes', () => {
        expect(parsePledgeCreateScope('lock:seal(max_bytes=1024)')).toBeNull();
        expect(parsePledgeCreateScope('stamp:sign')).toBeNull();
    });
    it('returns null for malformed parens', () => {
        expect(parsePledgeCreateScope('pledge:create(missing_close')).toBeNull();
        expect(parsePledgeCreateScope('pledge:create(no_equals)')).toBeNull();
    });
});

describe('checkPledgeCreateScope', () => {
    it('passes the bare scope without constraints', () => {
        const r = checkPledgeCreateScope(pledge(), delegation({ scopes: ['pledge:create'] }));
        expect(r.ok).toBe(true);
    });
    it('passes when max_bond_sats >= pledge.bond.min_sats', () => {
        const r = checkPledgeCreateScope(
            pledge({ bond: { attestation_id: '0'.repeat(64), min_sats: 500_000, min_days: 30 } }),
            delegation({ scopes: ['pledge:create(max_bond_sats=1000000)'] }),
        );
        expect(r.ok).toBe(true);
    });
    it('fails when pledge.bond.min_sats > max_bond_sats', () => {
        const r = checkPledgeCreateScope(
            pledge({
                bond: { attestation_id: '0'.repeat(64), min_sats: 5_000_000, min_days: 30 },
            }),
            delegation({ scopes: ['pledge:create(max_bond_sats=1000000)'] }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.code).toBe('E_DELEGATION_SCOPE_VIOLATED');
            expect(r.reason).toMatch(/exceeds.*max_bond_sats/);
        }
    });
    it('fails when mechanism does not match', () => {
        const r = checkPledgeCreateScope(
            pledge({ resolution: { mechanism: 'http_get_hash', query: 'q' } }),
            delegation({ scopes: ['pledge:create(mechanism=chain_state)'] }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/mechanism/);
    });
    it('fails when counterparty does not match', () => {
        const r = checkPledgeCreateScope(
            pledge({ counterparty: 'bc1qOTHER' }),
            delegation({ scopes: ['pledge:create(counterparty=bc1qexpected)'] }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/counterparty/);
    });
    it('AND-joins multiple constraints; all must satisfy', () => {
        const r = checkPledgeCreateScope(
            pledge({ resolution: { mechanism: 'chain_state', query: 'q' } }),
            delegation({
                scopes: ['pledge:create(max_bond_sats=2000000,mechanism=http_get_hash)'],
            }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toMatch(/mechanism/);
    });
    it('searches multiple scopes for any matching pledge:create', () => {
        const r = checkPledgeCreateScope(
            pledge(),
            delegation({
                scopes: [
                    'lock:seal(max_bytes=1024)',
                    'pledge:create(max_bond_sats=2000000)',
                    'stamp:sign',
                ],
            }),
        );
        expect(r.ok).toBe(true);
    });
    it('returns E_DELEGATION_SCOPE_VIOLATED when no pledge:create scope is present', () => {
        const r = checkPledgeCreateScope(
            pledge(),
            delegation({ scopes: ['lock:seal', 'stamp:sign'] }),
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DELEGATION_SCOPE_VIOLATED');
    });
});

describe('verifyPledge — delegationLookup integration', () => {
    it('passes when delegation resolves cleanly with pledge:create scope', async () => {
        const r = await verifyPledge({
            envelope: pledge(),
            skipSignatureVerification: true,
            delegationLookup: async () => delegation(),
        });
        expect(r.ok).toBe(true);
    });

    it('E_DELEGATION_NOT_FOUND when lookup returns null', async () => {
        const r = await verifyPledge({
            envelope: pledge(),
            skipSignatureVerification: true,
            delegationLookup: async () => null,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DELEGATION_NOT_FOUND');
    });

    it('E_DELEGATION_SCOPE_VIOLATED when principal != swearer', async () => {
        const r = await verifyPledge({
            envelope: pledge(),
            skipSignatureVerification: true,
            delegationLookup: async () => delegation({ principal: 'bc1qOTHER' }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DELEGATION_SCOPE_VIOLATED');
    });

    it('E_DELEGATION_SCOPE_VIOLATED when agent != agent_address', async () => {
        const r = await verifyPledge({
            envelope: pledge(),
            skipSignatureVerification: true,
            delegationLookup: async () => delegation({ agent: 'bc1qOTHER' }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DELEGATION_SCOPE_VIOLATED');
    });

    it('E_DELEGATION_EXPIRED when expires_at <= sworn_at', async () => {
        const r = await verifyPledge({
            envelope: pledge({ sworn_at: '2026-04-01T00:00:00Z' }),
            skipSignatureVerification: true,
            delegationLookup: async () =>
                delegation({ expires_at: '2026-03-01T00:00:00Z' }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DELEGATION_EXPIRED');
    });

    it('skips delegation chain when no delegationLookup supplied (back-compat)', async () => {
        // Without a lookup, agent path falls back to envelope-shape + sig-only
        // verification per SPEC §7.3 step 6 — same as pre-0.2.0.
        const r = await verifyPledge({
            envelope: pledge(),
            skipSignatureVerification: true,
        });
        expect(r.ok).toBe(true);
    });

    it('skips delegation chain for non-agent pledges (no via_delegation)', async () => {
        const r = await verifyPledge({
            envelope: pledge({
                via_delegation: undefined,
                agent_address: undefined,
                sig: { alg: 'bip322', pubkey: 'bc1qprincipal', value: 'AAAA' },
            }),
            skipSignatureVerification: true,
            // delegationLookup would never be called in this path; pass a
            // throwing one to confirm.
            delegationLookup: async () => {
                throw new Error('should not be called for non-agent pledges');
            },
        });
        expect(r.ok).toBe(true);
    });
});
