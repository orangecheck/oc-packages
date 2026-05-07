// createPledge() / verifyPledge() round-trip + agent-delegation handling.

import { describe, expect, it, vi } from 'vitest';

import {
    createPledge,
    PledgeError,
    verifyPledge,
} from './pledge.js';
import type { Bip322Signer, CreatePledgeInput, PledgeEnvelope } from './types.js';

function fakeSigner(address: string, value = 'AAAA'): Bip322Signer {
    return {
        address,
        signMessage: vi.fn(async () => value),
    };
}

const baseInput: Omit<CreatePledgeInput, 'swearerSigner'> = {
    swearer: 'bc1qalice000000000000000000000000000000000',
    proposition: 'I will not spend the bonded UTXO before block 920000.',
    resolution: { mechanism: 'chain_state', query: 'address(bc1qalice000000000000000000000000000000000).balance >= 500000' },
    resolves_at: { block: 920000 },
    expires_at: '2026-12-31T00:00:00Z',
    bond: { attestation_id: '1'.repeat(64), min_sats: 500000, min_days: 180 },
    counterparty: null,
    dispute: { mechanism: null, params: null },
    swornAt: '2026-04-24T18:30:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
};

describe('createPledge — direct path', () => {
    it('produces a v=1 pledge envelope with id == sha256(canonical_message)', async () => {
        const env = await createPledge({
            ...baseInput,
            swearerSigner: fakeSigner(baseInput.swearer),
        });
        expect(env.v).toBe(1);
        expect(env.kind).toBe('pledge');
        expect(env.id).toMatch(/^[0-9a-f]{64}$/);
        expect(env.sig.pubkey).toBe(baseInput.swearer);
        expect(env.sig.alg).toBe('bip322');
        expect(env.via_delegation).toBeUndefined();
        expect(env.agent_address).toBeUndefined();
    });

    it('throws E_PLEDGE_MALFORMED on empty nonce', async () => {
        await expect(
            createPledge({
                ...baseInput,
                nonce: '',
                swearerSigner: fakeSigner(baseInput.swearer),
            }),
        ).rejects.toBeInstanceOf(PledgeError);
    });

    it('signMessage receives the lowercase-hex pledge id', async () => {
        const signer = fakeSigner(baseInput.swearer);
        const env = await createPledge({ ...baseInput, swearerSigner: signer });
        expect(signer.signMessage).toHaveBeenCalledWith(env.id);
    });
});

describe('createPledge — agent path', () => {
    it('emits via_delegation + agent_address; sig.pubkey is the agent', async () => {
        const swearer = baseInput.swearer;
        const agent = 'bc1qagent0000000000000000000000000000000000';
        const env = await createPledge({
            ...baseInput,
            swearerSigner: fakeSigner(swearer),
            viaDelegation: {
                delegation_id: 'd'.repeat(64),
                agent_signer: fakeSigner(agent),
            },
        });
        expect(env.via_delegation).toBe('d'.repeat(64));
        expect(env.agent_address).toBe(agent);
        // Cryptographically honest default: sig.pubkey is the address that
        // actually signed (the agent). Verifiers under §7.3 use agent_address
        // as the verification key regardless.
        expect(env.sig.pubkey).toBe(agent);
    });

    it('rejects agent path when agent_signer.address equals principal', async () => {
        await expect(
            createPledge({
                ...baseInput,
                swearerSigner: fakeSigner(baseInput.swearer),
                viaDelegation: {
                    delegation_id: 'd'.repeat(64),
                    agent_signer: fakeSigner(baseInput.swearer),
                },
            }),
        ).rejects.toBeInstanceOf(PledgeError);
    });

    it('rejects malformed delegation id', async () => {
        await expect(
            createPledge({
                ...baseInput,
                swearerSigner: fakeSigner(baseInput.swearer),
                viaDelegation: {
                    delegation_id: 'not-64-hex',
                    agent_signer: fakeSigner('bc1qagent0000000000000000000000000000000000'),
                },
            }),
        ).rejects.toBeInstanceOf(PledgeError);
    });
});

describe('wrapPledgeEnvelope', () => {
    it('produces an envelope byte-identical to createPledge for the same inputs + sig', async () => {
        const fromCreate = await createPledge({
            ...baseInput,
            swearerSigner: fakeSigner(baseInput.swearer, 'AAAA'),
        });
        const { wrapPledgeEnvelope, computePledgeId } = await import('./index.js');
        const id = computePledgeId({
            swearer: baseInput.swearer,
            proposition: baseInput.proposition,
            resolution: baseInput.resolution,
            resolves_at: baseInput.resolves_at,
            expires_at: baseInput.expires_at,
            bond: baseInput.bond,
            counterparty: baseInput.counterparty,
            dispute: baseInput.dispute,
            remediation: 'breach_recorded',
            sworn_at: baseInput.swornAt as string,
            nonce: baseInput.nonce as string,
        });
        expect(id).toBe(fromCreate.id);
        const fromWrap = wrapPledgeEnvelope(
            {
                swearer: baseInput.swearer,
                proposition: baseInput.proposition,
                resolution: baseInput.resolution,
                resolves_at: baseInput.resolves_at,
                expires_at: baseInput.expires_at,
                bond: baseInput.bond,
                counterparty: baseInput.counterparty,
                dispute: baseInput.dispute,
                remediation: 'breach_recorded',
                sworn_at: baseInput.swornAt as string,
                nonce: baseInput.nonce as string,
            },
            'AAAA',
        );
        expect(fromWrap).toEqual(fromCreate);
    });

    it('agent path: sets via_delegation + agent_address + sig.pubkey override', async () => {
        const { wrapPledgeEnvelope, computePledgeId } = await import('./index.js');
        const agentAddress = 'bc1qagent0000000000000000000000000000000000';
        const env = wrapPledgeEnvelope(
            {
                swearer: baseInput.swearer,
                proposition: baseInput.proposition,
                resolution: baseInput.resolution,
                resolves_at: baseInput.resolves_at,
                expires_at: baseInput.expires_at,
                bond: baseInput.bond,
                counterparty: baseInput.counterparty,
                dispute: baseInput.dispute,
                remediation: 'breach_recorded',
                sworn_at: baseInput.swornAt as string,
                nonce: baseInput.nonce as string,
            },
            'AAAA',
            {
                sigPubkey: agentAddress,
                viaDelegation: { delegationId: 'd'.repeat(64), agentAddress },
            },
        );
        expect(env.via_delegation).toBe('d'.repeat(64));
        expect(env.agent_address).toBe(agentAddress);
        expect(env.sig.pubkey).toBe(agentAddress);
        expect(env.id).toBe(
            computePledgeId({
                swearer: baseInput.swearer,
                proposition: baseInput.proposition,
                resolution: baseInput.resolution,
                resolves_at: baseInput.resolves_at,
                expires_at: baseInput.expires_at,
                bond: baseInput.bond,
                counterparty: baseInput.counterparty,
                dispute: baseInput.dispute,
                remediation: 'breach_recorded',
                sworn_at: baseInput.swornAt as string,
                nonce: baseInput.nonce as string,
            }),
        );
    });

    it('throws E_PLEDGE_MALFORMED on empty nonce (same gates as createPledge)', async () => {
        const { wrapPledgeEnvelope } = await import('./index.js');
        expect(() =>
            wrapPledgeEnvelope(
                {
                    swearer: baseInput.swearer,
                    proposition: baseInput.proposition,
                    resolution: baseInput.resolution,
                    resolves_at: baseInput.resolves_at,
                    expires_at: baseInput.expires_at,
                    bond: baseInput.bond,
                    counterparty: baseInput.counterparty,
                    dispute: baseInput.dispute,
                    remediation: 'breach_recorded',
                    sworn_at: baseInput.swornAt as string,
                    nonce: '',
                },
                'AAAA',
            ),
        ).toThrow(PledgeError);
    });
});

describe('verifyPledge', () => {
    async function buildEnv(): Promise<PledgeEnvelope> {
        return createPledge({
            ...baseInput,
            swearerSigner: fakeSigner(baseInput.swearer),
        });
    }

    it('passes minimal verification with skipSignatureVerification', async () => {
        const env = await buildEnv();
        const r = await verifyPledge({ envelope: env, skipSignatureVerification: true });
        expect(r.ok).toBe(true);
    });

    it('detects tampered id', async () => {
        const env = await buildEnv();
        const tampered: PledgeEnvelope = { ...env, id: 'f'.repeat(64) };
        const r = await verifyPledge({ envelope: tampered, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_PLEDGE_BAD_ID');
    });

    it('detects tampered proposition (id no longer matches canonical)', async () => {
        const env = await buildEnv();
        const tampered: PledgeEnvelope = { ...env, proposition: env.proposition + ' (modified)' };
        const r = await verifyPledge({ envelope: tampered, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_PLEDGE_BAD_ID');
    });

    it('uses agent_address as the BIP-322 verification key when via_delegation is present', async () => {
        const swearer = baseInput.swearer;
        const agent = 'bc1qagent0000000000000000000000000000000000';
        const env = await createPledge({
            ...baseInput,
            swearerSigner: fakeSigner(swearer),
            viaDelegation: {
                delegation_id: 'd'.repeat(64),
                agent_signer: fakeSigner(agent),
            },
        });
        const verifier = vi.fn(async () => true);
        await verifyPledge({ envelope: env, verifyBip322: verifier });
        expect(verifier).toHaveBeenCalledWith(env.id, env.sig.value, agent);
    });

    it('returns E_PLEDGE_BAD_SIG when verifier returns false', async () => {
        const env = await buildEnv();
        const r = await verifyPledge({
            envelope: env,
            verifyBip322: async () => false,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_PLEDGE_BAD_SIG');
    });
});
