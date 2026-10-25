// The default exercised scope names the tool as a quoted value, so the name is
// read as written: a tool called "*" is that tool, not every tool.
import { describe, expect, it } from 'vitest';

import { parseScope, verifyAction } from '@orangecheck/agent-core';
import { createDelegation } from '@orangecheck/agent-signer';

import { stampFunctionCall } from './index.js';

const PRINCIPAL = 'bc1qprincipal000000000000000000000000000000';
const AGENT = 'bc1qagent0000000000000000000000000000000000';
const fakeSign = (address: string) => async (msg: string) =>
    Buffer.from(`sig:${address}:${msg}`, 'utf8').toString('base64');
const fakeVerify = async (msg: string, sig: string, address: string) =>
    sig === Buffer.from(`sig:${address}:${msg}`, 'utf8').toString('base64');

const stamp = async (scope: string, name: string) => {
    const delegation = await createDelegation({
        principal: { address: PRINCIPAL, signMessage: fakeSign(PRINCIPAL) },
        agentAddress: AGENT,
        scopes: [scope],
        ttlMs: 60 * 60 * 1000,
    });
    const action = await stampFunctionCall({
        agent: { address: AGENT, signMessage: fakeSign(AGENT) },
        delegation,
        call: { id: 'c1', name, arguments: {} },
    });
    const r = await verifyAction({ action, delegation, verifyBip322: fakeVerify, skipRevocationCheck: true });
    return { action, ok: r.ok };
};

describe('the default exercised scope', () => {
    it('quotes the name', async () => {
        const { action, ok } = await stamp('openai:function(name=search)', 'search');
        expect(action.scope_exercised).toBe('openai:function(name="search")');
        expect(ok).toBe(true);
    });

    it('stamps a tool called "*" as that tool, not every tool', async () => {
        const { action, ok } = await stamp('openai:function(name="*")', '*');
        expect(action.scope_exercised).toBe('openai:function(name="*")');
        expect(ok).toBe(true);
    });

    it('keeps scope punctuation in a name as part of the name', async () => {
        const { action, ok } = await stamp('openai:function(name="a,b")', 'a,b');
        const c = parseScope(action.scope_exercised).constraints[0];
        expect(c).toEqual({ key: 'name', op: '=', value: 'a,b', quoted: true });
        expect(ok).toBe(true);
    });
});
