import { describe, expect, it, vi } from 'vitest';

import {
    ApiError,
    postActionToConsole,
    postDelegationToConsole,
    postRevocationToConsole,
    postSubdelegationToConsole,
} from './index';
import type {
    ActionEnvelope,
    DelegationEnvelope,
    RevocationEnvelope,
    SubdelegationEnvelope,
} from '@orangecheck/agent-core';

const ACTION: ActionEnvelope = {
    v: 1,
    kind: 'agent-action',
    id: 'a'.repeat(64),
    signer: { address: 'bc1qbot00000000000000000000000000000000000a', alg: 'bip322' },
    delegation_id: 'd'.repeat(64),
    scope_exercised: 'mcp:invoke(server=https://x,tool=y)',
    content: {
        hash: 'sha256:' + 'b'.repeat(64),
        length: 1024,
        mime: 'application/json',
    },
    signed_at: '2026-04-30T12:00:00Z',
    ots: null,
    sig: { alg: 'bip322', pubkey: 'bc1qbot00000000000000000000000000000000000a', value: 'CCCC' },
};

const DELEGATION: DelegationEnvelope = {
    v: 1,
    kind: 'agent-delegation',
    id: 'd'.repeat(64),
    principal: { address: 'bc1qalice0000000000000000000000000000000000', alg: 'bip322' },
    agent: { address: 'bc1qbot00000000000000000000000000000000000a', alg: 'bip322' },
    scopes: ['mcp:invoke(server=https://x,tool=y)'],
    bond: null,
    issued_at: '2026-04-30T12:00:00Z',
    expires_at: '2026-05-30T12:00:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
    revocation: { holders: ['principal'], ref: null },
    sig: { alg: 'bip322', pubkey: 'bc1qalice0000000000000000000000000000000000', value: 'AAAA' },
};

const REVOCATION: RevocationEnvelope = {
    v: 1,
    kind: 'agent-revocation',
    id: 'r'.repeat(64),
    delegation_id: 'd'.repeat(64),
    signer: { address: 'bc1qalice0000000000000000000000000000000000', alg: 'bip322' },
    reason: 'rotation',
    signed_at: '2026-04-30T13:00:00Z',
    ots: null,
    sig: { alg: 'bip322', pubkey: 'bc1qalice0000000000000000000000000000000000', value: 'BBBB' },
};

const SUBDEL: SubdelegationEnvelope = {
    v: 1,
    kind: 'agent-subdelegation',
    id: 's'.repeat(64),
    parent_id: 'd'.repeat(64),
    principal: { address: 'bc1qbot00000000000000000000000000000000000a', alg: 'bip322' },
    agent: { address: 'bc1qchild000000000000000000000000000000000c', alg: 'bip322' },
    scopes: ['mcp:invoke(server=https://x,tool=y)'],
    issued_at: '2026-04-30T12:00:00Z',
    expires_at: '2026-05-30T12:00:00Z',
    nonce: 'fedcba9876543210fedcba9876543210',
    revocation: { holders: ['principal'], ref: null },
    sig: { alg: 'bip322', pubkey: 'bc1qbot00000000000000000000000000000000000a', value: 'DDDD' },
};

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('postActionToConsole', () => {
    it('POSTs to /api/actions with Bearer auth + body fields', async () => {
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            expect(String(url)).toBe('https://console.example/api/actions');
            const headers = init!.headers as Record<string, string>;
            expect(headers.Authorization).toBe('Bearer ock_xxxx');
            const body = JSON.parse(init!.body as string);
            expect(body.id).toBe(ACTION.id);
            expect(body.agent_address).toBe(ACTION.signer.address);
            expect(body.signature).toBe(ACTION.sig.value);
            expect(body.project_id).toBe('proj_test');
            return jsonResponse(201, {
                ok: true,
                action: { id: ACTION.id, project_id: 'proj_test', delegation_id: ACTION.delegation_id },
            });
        });
        const r = await postActionToConsole(ACTION, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://console.example',
            fetch: fetchMock as unknown as typeof fetch,
        });
        expect(r.id).toBe(ACTION.id);
    });

    it('throws ApiError with the server reason on non-2xx', async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(403, { ok: false, reason: 'agent_must_match_delegation' })
        );
        const err = await postActionToConsole(ACTION, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://console.example',
            fetch: fetchMock as unknown as typeof fetch,
        }).catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).reason).toBe('agent_must_match_delegation');
        expect((err as ApiError).status).toBe(403);
    });

    it('falls back to http_<status> when body is not JSON', async () => {
        const fetchMock = vi.fn(async () =>
            new Response('upstream error', { status: 502, headers: { 'Content-Type': 'text/plain' } })
        );
        await expect(
            postActionToConsole(ACTION, {
                apiToken: 'ock_xxxx',
                projectId: 'proj_test',
                baseUrl: 'https://console.example',
                fetch: fetchMock as unknown as typeof fetch,
            })
        ).rejects.toMatchObject({ reason: 'http_502', status: 502 });
    });

    it('defaults to https://console.ochk.io when baseUrl is omitted', async () => {
        const fetchMock = vi.fn(async (url: string | URL) => {
            expect(String(url)).toBe('https://console.ochk.io/api/actions');
            return jsonResponse(201, {
                ok: true,
                action: { id: ACTION.id, project_id: 'proj_test', delegation_id: ACTION.delegation_id },
            });
        });
        await postActionToConsole(ACTION, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            fetch: fetchMock as unknown as typeof fetch,
        });
    });
});

describe('postDelegationToConsole', () => {
    it('POSTs to /api/delegations with delegation envelope fields', async () => {
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            expect(String(url)).toBe('https://console.example/api/delegations');
            const body = JSON.parse(init!.body as string);
            expect(body.id).toBe(DELEGATION.id);
            expect(body.principal_address).toBe(DELEGATION.principal.address);
            expect(body.agent_address).toBe(DELEGATION.agent.address);
            expect(body.scopes).toEqual(DELEGATION.scopes);
            expect(body.bond_sats).toBe(0);
            expect(body.signature).toBe(DELEGATION.sig.value);
            return jsonResponse(201, {
                ok: true,
                delegation: { id: DELEGATION.id, project_id: 'proj_test', status: 'active' },
            });
        });
        const r = await postDelegationToConsole(DELEGATION, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://console.example',
            fetch: fetchMock as unknown as typeof fetch,
        });
        expect(r.status).toBe('active');
    });

    it('passes optional agent_name + agent_env extras through', async () => {
        const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
            const body = JSON.parse(init!.body as string);
            expect(body.agent_name).toBe('invoice-bot');
            expect(body.agent_env).toBe('staging');
            return jsonResponse(201, {
                ok: true,
                delegation: { id: DELEGATION.id, project_id: 'proj_test', status: 'active' },
            });
        });
        await postDelegationToConsole(
            DELEGATION,
            {
                apiToken: 'ock_xxxx',
                projectId: 'proj_test',
                baseUrl: 'https://console.example',
                fetch: fetchMock as unknown as typeof fetch,
            },
            { agent_name: 'invoice-bot', agent_env: 'staging' }
        );
    });
});

describe('postRevocationToConsole', () => {
    it('POSTs to /api/revocations with revocation fields', async () => {
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            expect(String(url)).toBe('https://console.example/api/revocations');
            const body = JSON.parse(init!.body as string);
            expect(body.id).toBe(REVOCATION.id);
            expect(body.delegation_id).toBe(REVOCATION.delegation_id);
            expect(body.signer_address).toBe(REVOCATION.signer.address);
            expect(body.reason).toBe('rotation');
            return jsonResponse(201, {
                ok: true,
                revocation: { id: REVOCATION.id, project_id: 'proj_test', delegation_id: REVOCATION.delegation_id },
            });
        });
        const r = await postRevocationToConsole(REVOCATION, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://console.example',
            fetch: fetchMock as unknown as typeof fetch,
        });
        expect(r.delegation_id).toBe(REVOCATION.delegation_id);
    });
});

describe('postSubdelegationToConsole', () => {
    it('POSTs to /api/subdelegations with parent_id + child fields', async () => {
        const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
            expect(String(url)).toBe('https://console.example/api/subdelegations');
            const body = JSON.parse(init!.body as string);
            expect(body.parent_id).toBe(SUBDEL.parent_id);
            expect(body.principal_address).toBe(SUBDEL.principal.address);
            expect(body.agent_address).toBe(SUBDEL.agent.address);
            expect(body.id).toBe(SUBDEL.id);
            return jsonResponse(201, {
                ok: true,
                subdelegation: {
                    id: SUBDEL.id,
                    project_id: 'proj_test',
                    parent_id: SUBDEL.parent_id,
                    status: 'active',
                },
            });
        });
        const r = await postSubdelegationToConsole(SUBDEL, {
            apiToken: 'ock_xxxx',
            projectId: 'proj_test',
            baseUrl: 'https://console.example',
            fetch: fetchMock as unknown as typeof fetch,
        });
        expect(r.parent_id).toBe(SUBDEL.parent_id);
    });
});
