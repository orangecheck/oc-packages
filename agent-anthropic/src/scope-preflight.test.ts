import { describe, expect, it } from 'vitest';

import { ScopeNotGrantedError } from '@orangecheck/agent-core';

import { stampToolUse } from './index.js';

const AGENT = 'bc1qagent0000000000000000000000000000000000';
const sign = () => async (msg: string) => Buffer.from(msg, 'utf8').toString('base64');

const SEALED = {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    recipients: [{ device_id: 'dev1', ct: 'AA' }],
    ct: 'BB',
    nonce: 'CC',
} as never;

/**
 * This adapter used to open-code the pre-flight scope check. It now routes to
 * agent-core's `assertScopeGranted`, and these assert the routing rather than
 * the check — agent-core owns testing the check itself.
 *
 * The case that matters is the encrypted one: a v1.2 private delegation has no
 * readable `scopes`, and the old `?? []` reported that as "not a sub-scope of
 * any granted scope" — pointing the integrator at a scope string that was
 * probably fine, when the actual need was to decrypt the grant.
 */
describe('stampToolUse scope pre-flight', () => {
    const base = {
        agent: { address: AGENT, sign: sign() },
        toolUse: { type: 'tool_use', id: 't1', name: 'search', input: { q: 'x' } },
    } as never;

    it('names encrypted scopes rather than blaming the scope string', async () => {
        const err = await stampToolUse({
            ...(base as object),
            delegation: { scopes_encrypted: SEALED },
            scopeExercised: 'anthropic:tool(name=search)',
        } as never).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ScopeNotGrantedError);
        expect((err as ScopeNotGrantedError).reason).toBe('scopes_encrypted');
        expect((err as Error).message).toMatch(/decryptPrivateScopes/);
    });

    it('treats an absent grant as granting nothing', async () => {
        const err = await stampToolUse({
            ...(base as object),
            delegation: {},
            scopeExercised: 'anthropic:tool(name=search)',
        } as never).catch((e: unknown) => e);

        expect((err as ScopeNotGrantedError).reason).toBe('no_scopes');
    });
});
