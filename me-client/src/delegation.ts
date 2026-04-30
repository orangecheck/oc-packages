import { api } from './transport';

/** A scope token an agent delegation can carry. */
export type DelegationScope =
    | 'identity.read'
    | 'inbox.read'
    | 'attest.verify'
    | 'stamp.sign'
    | 'payment.authorize';

export interface IssueDelegationOptions {
    /** Agent identifier — usually the agent's own pubkey or DID. */
    agent_id: string;
    /** Scopes the agent is allowed to act on. */
    scope: DelegationScope[];
    /** ISO-8601 expiration timestamp. Max 30 days in the future. */
    expires_at: string;
    /** Optional human-readable reason shown in /me/agents. */
    reason?: string;
}

export interface DelegationEnvelope {
    /** Content-addressed envelope id. */
    id: string;
    /** Scope tokens the agent is allowed. */
    scope: DelegationScope[];
    /** ISO-8601 expiration. */
    expires_at: string;
    /** ISO-8601 issuance time. */
    issued_at: string;
    /** Public verifier URL. */
    verify_url: string;
}

/**
 * Issue an agent delegation. Class A billable event for the integrating
 * site that initiates it (the user authorizes from /me/agents).
 *
 * v1: returns a stub envelope until the federation signing service ships.
 * The shape is canonical and matches what production will return.
 */
async function issue(opts: IssueDelegationOptions): Promise<DelegationEnvelope> {
    if (!opts.agent_id) throw new Error('agent_id is required');
    if (!opts.scope?.length) throw new Error('scope must contain at least one token');
    if (!opts.expires_at) throw new Error('expires_at is required');
    return api<DelegationEnvelope>('/api/delegation/issue', {
        method: 'POST',
        body: opts,
    });
}

/** Revoke a previously-issued delegation by envelope id. Verifier rejects
 *  any envelope signed under the delegation after revocation. */
async function revoke(delegation_id: string): Promise<{ ok: true }> {
    return api<{ ok: true }>('/api/delegation/revoke', {
        method: 'POST',
        body: { delegation_id },
    });
}

export const delegation = { issue, revoke };
