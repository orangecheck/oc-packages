// Well-formed envelopes for the input tests to bend: a delegation (with or
// without a bond), a sub-delegation of it, an action, a revocation, and a
// federation delegation with its revocation. Ids are real; signatures are not.

import {
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    computeSubdelegationId,
} from './canonical.js';
import {
    computeFederationDescriptorId,
    type FederationDelegationEnvelope,
    type FederationRevocationEnvelope,
} from './federation.js';
import type {
    ActionEnvelope,
    DelegationEnvelope,
    RevocationEnvelope,
    SubdelegationEnvelope,
} from './types.js';

export const PRINCIPAL = 'bc1qprincipal000000000000000000000000000000';
export const AGENT = 'bc1qagent0000000000000000000000000000000000';
export const SUBAGENT = 'bc1qsubagent00000000000000000000000000000000';
export const ISSUED = '2026-04-22T12:00:00Z';
export const EXPIRES = '2026-05-22T12:00:00Z';
export const SIGNED = '2026-04-22T12:05:00Z';
export const NOW = new Date('2026-04-22T12:05:30Z');
export const SCOPE = 'lock:seal(recipient=bc1qalice000000000000000000000000000000000)';
export const BOND_ATTESTATION = 'a'.repeat(64);

export function delegation(bond: DelegationEnvelope['bond'] = null): DelegationEnvelope {
    const scopes = canonicalizeScopes([SCOPE]);
    const nonce = '0123456789abcdef0123456789abcdef';
    const id = computeDelegationId({
        principal: PRINCIPAL,
        agent: AGENT,
        scopes,
        bond_sats: bond?.sats ?? 0,
        bond_attestation: bond?.attestation_id ?? 'none',
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
    });
    return {
        v: 1,
        kind: 'agent-delegation',
        id,
        principal: { address: PRINCIPAL, alg: 'bip322' },
        agent: { address: AGENT, alg: 'bip322' },
        scopes,
        bond,
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: { alg: 'bip322', pubkey: PRINCIPAL, value: 'AAAA' },
    };
}

export function subdelegation(parent: DelegationEnvelope): SubdelegationEnvelope {
    const scopes = canonicalizeScopes([SCOPE]);
    const nonce = 'fedcba9876543210fedcba9876543210';
    const id = computeSubdelegationId({
        parent_id: parent.id,
        principal: AGENT,
        agent: SUBAGENT,
        scopes,
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
    });
    return {
        v: 1,
        kind: 'agent-subdelegation',
        id,
        parent_id: parent.id,
        principal: { address: AGENT, alg: 'bip322' },
        agent: { address: SUBAGENT, alg: 'bip322' },
        scopes,
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: { alg: 'bip322', pubkey: AGENT, value: 'AAAA' },
    } as SubdelegationEnvelope;
}

export function action(delegationId: string, signer: string): ActionEnvelope {
    const content = {
        hash: 'sha256:' + '3'.repeat(64),
        length: 1024,
        mime: 'application/vnd.oc-lock+json',
        ref: null,
    };
    const id = computeActionId({
        address: signer,
        content_hash: content.hash,
        content_length: content.length,
        content_mime: content.mime,
        signed_at: SIGNED,
        delegation_id: delegationId,
        scope_exercised: SCOPE,
    });
    return {
        v: 1,
        kind: 'agent-action',
        id,
        content,
        signer: { address: signer, alg: 'bip322' },
        signed_at: SIGNED,
        delegation_id: delegationId,
        scope_exercised: SCOPE,
        ots: {
            status: 'confirmed',
            proof: 'AAAA',
            calendars: ['https://a.example'],
            block_height: 900_000,
            block_hash: '0'.repeat(64),
            upgraded_at: SIGNED,
        },
        sig: { alg: 'bip322', pubkey: signer, value: 'AAAA' },
    };
}

export function revocation(delegationId: string, signer = PRINCIPAL): RevocationEnvelope {
    const signedAt = '2026-04-22T12:01:00Z';
    const id = computeRevocationId({
        address: signer,
        delegation_id: delegationId,
        reason: '',
        signed_at: signedAt,
    });
    return {
        v: 1,
        kind: 'agent-revocation',
        id,
        delegation_id: delegationId,
        signer: { address: signer, alg: 'bip322' },
        reason: '',
        signed_at: signedAt,
        ots: null,
        sig: { alg: 'bip322', pubkey: signer, value: 'AAAA' },
    };
}

export function federation(): { del: FederationDelegationEnvelope; rev: FederationRevocationEnvelope } {
    const descriptor = {
        v: 1 as const,
        kind: 'agent-federation' as const,
        threshold: '2-of-3',
        guardians: ['g1', 'g2', 'g3'].map((g) => ({
            address: `bc1q${g}${'0'.repeat(36)}`,
            alg: 'bip322' as const,
        })),
    };
    const descriptorId = computeFederationDescriptorId(descriptor);
    const principal = { alg: 'federation' as const, descriptor_id: descriptorId, descriptor };
    const sig = {
        alg: 'federation-bip322' as const,
        threshold: '2-of-3',
        signatures: descriptor.guardians.slice(0, 2).map((g) => ({
            guardian_address: g.address,
            value: 'AAAA',
        })),
    };
    const scopes = canonicalizeScopes([SCOPE]);
    const nonce = '0123456789abcdef0123456789abcdef';
    const delId = computeDelegationId({
        principal: `federation:${descriptorId}`,
        agent: AGENT,
        scopes,
        bond_sats: 0,
        bond_attestation: 'none',
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
    });
    const del: FederationDelegationEnvelope = {
        v: 1,
        kind: 'agent-delegation',
        id: delId,
        principal,
        agent: { address: AGENT, alg: 'bip322' },
        scopes,
        bond: null,
        issued_at: ISSUED,
        expires_at: EXPIRES,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig,
    };
    const revId = computeRevocationId({
        address: `federation:${descriptorId}`,
        delegation_id: delId,
        reason: '',
        signed_at: SIGNED,
    });
    const rev: FederationRevocationEnvelope = {
        v: 1,
        kind: 'agent-revocation',
        id: revId,
        delegation_id: delId,
        signer: principal,
        reason: '',
        signed_at: SIGNED,
        ots: null,
        sig,
    };
    return { del, rev };
}
