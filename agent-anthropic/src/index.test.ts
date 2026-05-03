import { describe, expect, it, vi } from 'vitest';

import {
    canonicalizeToolUse,
    postActionToFleet,
    toolUseHash,
} from './index.js';
import type { ActionEnvelope } from '@orangecheck/agent-signer';

describe('canonicalizeToolUse', () => {
    it('produces byte-identical output for identical inputs (key reorder)', () => {
        const a = canonicalizeToolUse({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { customer: 'acme', amount: 14.2 },
        });
        const b = canonicalizeToolUse({
            id: 'toolu_01abc',
            input: { amount: 14.2, customer: 'acme' }, // keys reordered
            name: 'invoice.create',
        });
        expect(a).toEqual(b);
    });

    it('produces different hashes for different argument values', () => {
        const h1 = toolUseHash({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { amount: 14.2 },
        });
        const h2 = toolUseHash({
            id: 'toolu_01abc',
            name: 'invoice.create',
            input: { amount: 28.0 },
        });
        expect(h1).not.toBe(h2);
    });

    it('changes when the tool name changes', () => {
        const h1 = toolUseHash({ id: 't1', name: 'a', input: {} });
        const h2 = toolUseHash({ id: 't1', name: 'b', input: {} });
        expect(h1).not.toBe(h2);
    });

    it('changes when the tool_use id changes', () => {
        const h1 = toolUseHash({ id: 't1', name: 'a', input: {} });
        const h2 = toolUseHash({ id: 't2', name: 'a', input: {} });
        expect(h1).not.toBe(h2);
    });
});

describe('postActionToFleet', () => {
    const fakeAction: ActionEnvelope = {
        v: 1,
        kind: 'agent-action',
        id: 'a'.repeat(64),
        signer: { address: 'bc1qbot00000000000000000000000000000000000a', alg: 'bip322' },
        delegation_id: 'd'.repeat(64),
        scope_exercised: 'anthropic:tool(name=invoice.create)',
        content: {
            hash: 'sha256:' + 'b'.repeat(64),
            length: 1024,
            mime: 'application/vnd.oc-agent.anthropic-tool-use+json',
        },
        signed_at: '2026-04-30T12:00:00Z',
        ots: null,
        sig: { alg: 'bip322', pubkey: 'bc1qbot00000000000000000000000000000000000a', value: 'CCCC' },
    };

    it('POSTs to /api/actions with Bearer auth + the action body fields', async () => {
        const fakeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
            expect(String(url)).toBe('https://fleet.example/api/actions');
            const headers = init!.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer ock_xxxx');
            expect(headers['Content-Type']).toBe('application/json');
            const body = JSON.parse(init!.body as string);
            expect(body.id).toBe(fakeAction.id);
            expect(body.delegation_id).toBe(fakeAction.delegation_id);
            expect(body.agent_address).toBe(fakeAction.signer.address);
            expect(body.scope_exercised).toBe(fakeAction.scope_exercised);
            expect(body.content_hash).toBe(fakeAction.content.hash);
            expect(body.signature).toBe(fakeAction.sig.value);
            expect(body.project_id).toBe('proj_test');
            return new Response(
                JSON.stringify({
                    ok: true,
                    action: {
                        id: fakeAction.id,
                        project_id: 'proj_test',
                        delegation_id: fakeAction.delegation_id,
                    },
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } }
            );
        });
        const result = await postActionToFleet(fakeAction, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://fleet.example',
            fetch: fakeFetch as unknown as typeof fetch,
        });
        expect(result.id).toBe(fakeAction.id);
        expect(result.project_id).toBe('proj_test');
        expect(fakeFetch).toHaveBeenCalledOnce();
    });

    it('throws with the server reason on non-2xx', async () => {
        const fakeFetch = vi.fn(async () =>
            new Response(JSON.stringify({ ok: false, reason: 'agent_must_match_delegation' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            })
        );
        await expect(
            postActionToFleet(fakeAction, {
                apiToken: 'ock_xxxx',
                projectId: 'proj_test',
                baseUrl: 'https://fleet.example',
                fetch: fakeFetch as unknown as typeof fetch,
            })
        ).rejects.toThrow(/agent_must_match_delegation/);
    });

    it('falls back to http_<status> when the body is not JSON', async () => {
        const fakeFetch = vi.fn(async () =>
            new Response('upstream error', { status: 502, headers: { 'Content-Type': 'text/plain' } })
        );
        await expect(
            postActionToFleet(fakeAction, {
                apiToken: 'ock_xxxx',
                projectId: 'proj_test',
                baseUrl: 'https://fleet.example',
                fetch: fakeFetch as unknown as typeof fetch,
            })
        ).rejects.toThrow(/http_502/);
    });

    it('defaults to https://fleet.ochk.io when baseUrl is omitted', async () => {
        const fakeFetch = vi.fn(async (url: string | URL) => {
            expect(String(url)).toBe('https://fleet.ochk.io/api/actions');
            return new Response(
                JSON.stringify({
                    ok: true,
                    action: {
                        id: fakeAction.id,
                        project_id: 'proj_test',
                        delegation_id: fakeAction.delegation_id,
                    },
                }),
                { status: 201, headers: { 'Content-Type': 'application/json' } }
            );
        });
        await postActionToFleet(fakeAction, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            fetch: fakeFetch as unknown as typeof fetch,
        });
    });
});
