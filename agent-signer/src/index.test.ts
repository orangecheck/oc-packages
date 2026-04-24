import { describe, expect, it } from 'vitest';

import { verifyAction, verifyDelegation, verifyRevocation } from '@orangecheck/agent-core';

import { createDelegation, revoke, signAsAgent } from './index.js';

// Fake BIP-322 signer/verifier: the signer just base64-encodes "sig:<address>:<hex(msg)>",
// and the verifier confirms the pattern. This is enough to exercise the envelope
// plumbing; real signatures need a wallet-adapter.
const fakeSign = (address: string) => async (msg: string) => {
    const payload = `sig:${address}:${msg}`;
    return Buffer.from(payload, 'utf8').toString('base64');
};
const fakeVerify = async (msg: string, sig: string, address: string) => {
    const expected = Buffer.from(`sig:${address}:${msg}`, 'utf8').toString('base64');
    return sig === expected;
};

const PRINCIPAL = 'bc1qprincipal000000000000000000000000000000';
const AGENT = 'bc1qagent0000000000000000000000000000000000';

describe('createDelegation', () => {
    it('produces a delegation envelope that verifies', async () => {
        const envelope = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
            ttlMs: 24 * 60 * 60 * 1000,
        });
        expect(envelope.kind).toBe('agent-delegation');
        expect(envelope.id).toMatch(/^[0-9a-f]{64}$/);
        expect(envelope.scopes).toHaveLength(1);

        const r = await verifyDelegation({ envelope, verifyBip322: fakeVerify });
        expect(r.ok).toBe(true);
    });

    it('rejects unregistered scopes by default (strict)', async () => {
        await expect(
            createDelegation({
                principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
                agentAddress: AGENT,
                scopes: ['made_up:scope'],
                ttlMs: 60_000,
            })
        ).rejects.toThrow();
    });

    it('throws when scopes is empty', async () => {
        await expect(
            createDelegation({
                principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
                agentAddress: AGENT,
                scopes: [],
            })
        ).rejects.toThrow(/at least one scope/);
    });

    it('normalizes nonce default and scope order', async () => {
        const env = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['stamp:sign(mime=text/markdown)', 'lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
            ttlMs: 60_000,
        });
        expect(env.scopes[0]!.startsWith('lock:')).toBe(true);
        expect(/^[0-9a-f]{32}$/.test(env.nonce)).toBe(true);
    });
});

describe('signAsAgent', () => {
    it('produces an action that verifies against its delegation', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
            ttlMs: 60 * 60 * 1000,
        });

        const content = new TextEncoder().encode('hello agent');
        const action = await signAsAgent({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            content,
            mime: 'text/plain',
            scopeExercised: 'lock:seal(recipient=bc1qalice000000000000000000000000000000000)',
        });
        expect(action.kind).toBe('agent-action');
        expect(action.delegation_id).toBe(delegation.id);

        const r = await verifyAction({
            action,
            delegation,
            verifyBip322: fakeVerify,
        });
        expect(r.ok).toBe(true);
    });

    it('rejects when signer address does not match delegation.agent', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['stamp:sign(mime=text/markdown)'],
            ttlMs: 60_000,
        });
        await expect(
            signAsAgent({
                agent: { address: 'bc1qotheragent', signMessage: fakeSign('bc1qotheragent') },
                delegation,
                content: new Uint8Array([1, 2, 3]),
                mime: 'text/plain',
                scopeExercised: 'stamp:sign(mime=text/markdown)',
            })
        ).rejects.toThrow(/delegation.agent/);
    });

    it('fails verification when exercised scope is not a sub-scope', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['stamp:sign(mime=text/markdown)'],
            ttlMs: 60 * 60 * 1000,
        });
        const action = await signAsAgent({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            content: new TextEncoder().encode('x'),
            mime: 'application/pdf',
            scopeExercised: 'stamp:sign(mime=application/pdf)',
        });
        const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_SCOPE_DENIED');
    });
});

describe('revoke', () => {
    it('produces a revocation that verifies and applies to the delegation', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['lock:seal(recipient=bc1qalice000000000000000000000000000000000)'],
            ttlMs: 60 * 60 * 1000,
        });
        const rev = await revoke({
            signer: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            delegation,
            reason: 'key rotated',
        });
        const r = await verifyRevocation({ envelope: rev, delegation, verifyBip322: fakeVerify });
        expect(r.ok).toBe(true);
    });

    it('rejects a revocation from an unauthorized signer', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['stamp:sign(mime=text/markdown)'],
            ttlMs: 60_000,
        });
        await expect(
            revoke({
                signer: { address: AGENT, signMessage: fakeSign(AGENT) },
                delegation, // revocation.holders default = ['principal']
            })
        ).rejects.toThrow(/not authorized/);
    });

    it('allows agent revocation when delegation opts in', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['stamp:sign(mime=text/markdown)'],
            ttlMs: 60_000,
            revocationHolders: ['principal', 'agent'],
        });
        const rev = await revoke({
            signer: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            reason: 'self-revoke',
        });
        const r = await verifyRevocation({ envelope: rev, delegation, verifyBip322: fakeVerify });
        expect(r.ok).toBe(true);
    });
});
