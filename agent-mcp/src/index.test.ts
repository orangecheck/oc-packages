import { describe, expect, it } from 'vitest';

import { verifyAction } from '@orangecheck/agent-core';
import { createDelegation } from '@orangecheck/agent-signer';

import { canonicalizeInvocation, invocationHash, invokeWithStamp, stampInvocation } from './index.js';

const PRINCIPAL = 'bc1qprincipal000000000000000000000000000000';
const AGENT = 'bc1qagent0000000000000000000000000000000000';

const fakeSign = (address: string) => async (msg: string) =>
    Buffer.from(`sig:${address}:${msg}`, 'utf8').toString('base64');

const fakeVerify = async (msg: string, sig: string, address: string) =>
    sig === Buffer.from(`sig:${address}:${msg}`, 'utf8').toString('base64');

describe('canonicalizeInvocation', () => {
    it('produces byte-identical output for identical inputs', () => {
        const a = canonicalizeInvocation({
            server: 'https://mcp.example.com',
            tool: 'search',
            arguments: { q: 'bitcoin', limit: 10 },
        });
        const b = canonicalizeInvocation({
            server: 'https://mcp.example.com',
            tool: 'search',
            arguments: { limit: 10, q: 'bitcoin' }, // keys reordered
        });
        expect(a).toEqual(b);
    });

    it('produces different hashes for different argument values', () => {
        const h1 = invocationHash({
            server: 'https://mcp.example.com',
            tool: 'search',
            arguments: { q: 'a' },
        });
        const h2 = invocationHash({
            server: 'https://mcp.example.com',
            tool: 'search',
            arguments: { q: 'b' },
        });
        expect(h1).not.toBe(h2);
    });
});

describe('stampInvocation', () => {
    it('produces an action that verifies against its delegation', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['mcp:invoke(server=https://mcp.example.com,tool=search)'],
            ttlMs: 60 * 60 * 1000,
        });
        const action = await stampInvocation({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            invocation: {
                server: 'https://mcp.example.com',
                tool: 'search',
                arguments: { q: 'bitcoin' },
            },
        });
        expect(action.content.mime).toBe('application/vnd.oc-agent.mcp-invocation+json');
        const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify });
        expect(r.ok).toBe(true);
    });

    it('rejects when exercised scope is not a sub-scope of granted', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['mcp:invoke(server=https://mcp.example.com,tool=search)'],
            ttlMs: 60 * 60 * 1000,
        });
        await expect(
            stampInvocation({
                agent: { address: AGENT, signMessage: fakeSign(AGENT) },
                delegation,
                invocation: {
                    server: 'https://mcp.example.com',
                    tool: 'send_email',
                    arguments: {},
                },
            })
        ).rejects.toThrow(/not a sub-scope/);
    });
});

describe('invokeWithStamp', () => {
    it('stamps first then calls', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['mcp:invoke(server=https://mcp.example.com,tool=search)'],
            ttlMs: 60 * 60 * 1000,
        });
        const { result, action } = await invokeWithStamp({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            invocation: {
                server: 'https://mcp.example.com',
                tool: 'search',
                arguments: { q: 'bitcoin' },
            },
            call: async () => ({ hits: 42 }),
        });
        expect(result).toEqual({ hits: 42 });
        expect(action.kind).toBe('agent-action');
        expect(action.delegation_id).toBe(delegation.id);
    });
});
