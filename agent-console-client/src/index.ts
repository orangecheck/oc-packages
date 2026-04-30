/**
 * @orangecheck/agent-console-client
 *
 * Tiny HTTP client for posting OC Agent envelopes to console.ochk.io.
 * The framework adapters (agent-anthropic, agent-openai, agent-vercel,
 * agent-langgraph, agent-mcp) all use this — same wire format, same
 * error handling, same fetch-override-friendly knob for non-Node
 * runtimes.
 *
 * Quick start:
 *
 *   import { postActionToConsole } from '@orangecheck/agent-console-client';
 *
 *   await postActionToConsole(stampedActionEnvelope, {
 *     apiToken: process.env.OC_TOKEN!,        // ock_<64-hex>
 *     projectId: process.env.OC_PROJECT_ID!,   // proj_*
 *   });
 *
 * The console:
 *   - re-derives the action id from canonical inputs (tamper defense)
 *   - validates that action.signer.address === parent_delegation.agent_address
 *   - persists, fans out to Nostr (kind 30084), submits to OC Stamp,
 *     and triggers any subscribed webhooks (action.registered)
 *
 * Returns the registered action's id + project_id + delegation_id.
 * Throws on non-2xx with the server's stable reason string
 * ('agent_must_match_delegation', 'id_mismatch', 'role_forbidden', etc).
 */

import type {
    ActionEnvelope,
    DelegationEnvelope,
    RevocationEnvelope,
    SubdelegationEnvelope,
} from '@orangecheck/agent-core';

const DEFAULT_BASE_URL = 'https://console.ochk.io';

export interface ConsoleClient {
    /** Defaults to https://console.ochk.io. */
    baseUrl?: string;
    /** Bearer token from /settings § 03 (`ock_<hex>`). */
    apiToken: string;
    /** Project the envelope belongs to (proj_*). */
    projectId: string;
    /** Optional fetch override for runtimes that need it. */
    fetch?: typeof fetch;
}

export interface PostActionResult {
    id: string;
    project_id: string;
    delegation_id: string;
}

export interface PostDelegationResult {
    id: string;
    project_id: string;
    status: string;
}

export interface PostRevocationResult {
    id: string;
    project_id: string;
    delegation_id: string;
}

export interface PostSubdelegationResult {
    id: string;
    project_id: string;
    parent_id: string;
    status: string;
}

class ApiError extends Error {
    readonly status: number;
    readonly reason: string;
    constructor(status: number, reason: string, detail?: string) {
        super(`console api ${status} ${reason}${detail ? ` — ${detail}` : ''}`);
        this.status = status;
        this.reason = reason;
    }
}

async function callJson<T>(
    client: ConsoleClient,
    path: string,
    body: Record<string, unknown>
): Promise<T> {
    const baseUrl = client.baseUrl ?? DEFAULT_BASE_URL;
    const f = client.fetch ?? fetch;
    const r = await f(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${client.apiToken}`,
        },
        body: JSON.stringify(body),
    });
    if (!r.ok) {
        let reason = `http_${r.status}`;
        let detail: string | undefined;
        try {
            const j = (await r.json()) as { reason?: string; detail?: string };
            if (j.reason) reason = j.reason;
            if (j.detail) detail = j.detail;
        } catch {
            // body wasn't json; keep the http_<n> reason
        }
        throw new ApiError(r.status, reason, detail);
    }
    return (await r.json()) as T;
}

/**
 * POST a stamped action envelope to /api/actions. Same security
 * envelope as /api/delegations: the server tamper-checks id and
 * agent-must-match-delegation before persisting.
 */
export async function postActionToConsole(
    action: ActionEnvelope,
    client: ConsoleClient
): Promise<PostActionResult> {
    const body = {
        project_id: client.projectId,
        delegation_id: action.delegation_id,
        agent_address: action.signer.address,
        scope_exercised: action.scope_exercised,
        content_hash: action.content.hash,
        content_length: action.content.length,
        content_mime: action.content.mime,
        signed_at: action.signed_at,
        signature: action.sig.value,
        id: action.id,
    };
    const r = await callJson<{ ok: true; action: PostActionResult }>(
        client,
        '/api/actions',
        body
    );
    return r.action;
}

/**
 * POST a signed delegation envelope to /api/delegations. The server
 * enforces principal_must_match_session — for SDK use this means the
 * project token holder's address must equal envelope.principal.address.
 */
export async function postDelegationToConsole(
    delegation: DelegationEnvelope,
    client: ConsoleClient,
    extras: {
        agent_name?: string | null;
        agent_env?: 'prod' | 'staging' | 'dev';
    } = {}
): Promise<PostDelegationResult> {
    const body = {
        project_id: client.projectId,
        principal_address: delegation.principal.address,
        agent_address: delegation.agent.address,
        agent_name: extras.agent_name ?? null,
        agent_env: extras.agent_env ?? 'prod',
        scopes: delegation.scopes ?? [],
        bond_sats: delegation.bond?.sats ?? 0,
        bond_attestation_id: delegation.bond?.attestation_id ?? null,
        issued_at: delegation.issued_at,
        expires_at: delegation.expires_at,
        nonce: delegation.nonce,
        signature: delegation.sig.value,
        id: delegation.id,
    };
    const r = await callJson<{ ok: true; delegation: PostDelegationResult }>(
        client,
        '/api/delegations',
        body
    );
    return r.delegation;
}

/**
 * POST a signed revocation envelope to /api/revocations. The server
 * enforces signer_must_be_principal + signer_must_match_session.
 */
export async function postRevocationToConsole(
    revocation: RevocationEnvelope,
    client: ConsoleClient
): Promise<PostRevocationResult> {
    const body = {
        project_id: client.projectId,
        delegation_id: revocation.delegation_id,
        signer_address: revocation.signer.address,
        reason: revocation.reason ?? '',
        signed_at: revocation.signed_at,
        signature: revocation.sig.value,
        id: revocation.id,
    };
    const r = await callJson<{ ok: true; revocation: PostRevocationResult }>(
        client,
        '/api/revocations',
        body
    );
    return r.revocation;
}

/**
 * POST a sub-delegation (kind 30086, OC Agent v1.1) to /api/sub
 * delegations. The signing principal must equal parent.agent.
 */
export async function postSubdelegationToConsole(
    sub: SubdelegationEnvelope,
    client: ConsoleClient,
    extras: {
        agent_name?: string | null;
        agent_env?: 'prod' | 'staging' | 'dev';
    } = {}
): Promise<PostSubdelegationResult> {
    const body = {
        project_id: client.projectId,
        parent_id: sub.parent_id,
        principal_address: sub.principal.address,
        agent_address: sub.agent.address,
        agent_name: extras.agent_name ?? null,
        agent_env: extras.agent_env ?? 'prod',
        scopes: sub.scopes ?? [],
        issued_at: sub.issued_at,
        expires_at: sub.expires_at,
        nonce: sub.nonce,
        signature: sub.sig.value,
        id: sub.id,
    };
    const r = await callJson<{
        ok: true;
        subdelegation: PostSubdelegationResult;
    }>(client, '/api/subdelegations', body);
    return r.subdelegation;
}

export { ApiError };
