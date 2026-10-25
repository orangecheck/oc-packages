import { describe, expect, it } from 'vitest';

import { parseScope, verifyAction } from '@orangecheck/agent-core';
import { createDelegation } from '@orangecheck/agent-signer';

import {
    ACTION_META_KEY,
    canonicalizeInvocation,
    invocationHash,
    invokeWithStamp,
    stampInvocation,
} from './index.js';

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
        const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify, skipRevocationCheck: true });
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

    it('hands the action to the call, so the request can carry it', async () => {
        const delegation = await createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: ['mcp:invoke(server=https://mcp.example.com,tool=search)'],
            ttlMs: 60 * 60 * 1000,
        });
        const sent: unknown[] = [];
        const { action } = await invokeWithStamp({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            invocation: { server: 'https://mcp.example.com', tool: 'search', arguments: { q: 'bitcoin' } },
            call: async (inv, signed) => {
                sent.push({ name: inv.tool, arguments: inv.arguments, _meta: { [ACTION_META_KEY]: signed } });
                return null;
            },
        });
        expect(sent).toEqual([
            { name: 'search', arguments: { q: 'bitcoin' }, _meta: { 'io.ochk/agent-action': action } },
        ]);
    });
});

// The default exercised scope names the tool as a quoted value, so the name is
// read as written: a tool called "*" is that tool, not every tool.
describe('the default exercised scope', () => {
    const SERVER = 'https://mcp.example.com';
    const grant = (scope: string) =>
        createDelegation({
            principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
            agentAddress: AGENT,
            scopes: [scope],
            ttlMs: 60 * 60 * 1000,
        });
    const stamp = async (scope: string, tool: string) => {
        const delegation = await grant(scope);
        const action = await stampInvocation({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            invocation: { server: SERVER, tool, arguments: {} },
        });
        const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify, skipRevocationCheck: true });
        return { action, ok: r.ok };
    };

    it('quotes the server and the tool name', async () => {
        const { action, ok } = await stamp(`mcp:invoke(server=${SERVER},tool=search)`, 'search');
        expect(action.scope_exercised).toBe(`mcp:invoke(server="${SERVER}",tool="search")`);
        expect(ok).toBe(true);
    });

    it('stamps a tool called "*" as that tool, not every tool', async () => {
        const { action, ok } = await stamp(`mcp:invoke(server=${SERVER},tool="*")`, '*');
        expect(action.scope_exercised).toBe(`mcp:invoke(server="${SERVER}",tool="*")`);
        expect(ok).toBe(true);
    });

    it('keeps scope punctuation in a tool name as part of the name', async () => {
        const { action, ok } = await stamp(`mcp:invoke(server=${SERVER},tool="a,b")`, 'a,b');
        const tool = parseScope(action.scope_exercised).constraints.find((c) => c.key === 'tool');
        expect(tool).toEqual({ key: 'tool', op: '=', value: 'a,b', quoted: true });
        expect(ok).toBe(true);
    });

    it('keeps a server URL with a query whole, under a grant that names it', async () => {
        const server = 'https://mcp.example.com/sse?key=x';
        const delegation = await grant(`mcp:invoke(server="${server}",tool=search)`);
        const action = await stampInvocation({
            agent: { address: AGENT, signMessage: fakeSign(AGENT) },
            delegation,
            invocation: { server, tool: 'search', arguments: {} },
        });
        const s = parseScope(action.scope_exercised).constraints.find((c) => c.key === 'server');
        expect(s?.value).toBe(server);
        const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify, skipRevocationCheck: true });
        expect(r.ok).toBe(true);
    });
});
