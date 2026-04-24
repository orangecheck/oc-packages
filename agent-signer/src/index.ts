// @orangecheck/agent-signer — high-level API for producing OC Agent envelopes.
//
//   createDelegation  — principal signs a scoped grant to an agent address.
//   signAsAgent       — agent produces an agent-action envelope over content.
//   revoke            — principal (or agent, if authorized) burns a delegation.
//
// Each function wraps @orangecheck/agent-core's canonical-message + id
// computation with a caller-supplied `signMessage` wallet adapter. Nothing here
// touches the network — OTS anchoring and Nostr publication are separate steps
// the caller wires up.

import { sha256 } from '@noble/hashes/sha256';
import {
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    ENVELOPE_VERSION,
    hexEncode,
    parseScope,
    validateScope,
} from '@orangecheck/agent-core';
import type { ValidationOptions } from '@orangecheck/agent-core';
import type {
    ActionEnvelope,
    ActionOts,
    DelegationBond,
    DelegationEnvelope,
    RevocationEnvelope,
    RevocationHolder,
} from '@orangecheck/agent-core';

// ─────────────────────────────────────────────────────────────────────────────
// Shared wallet-adapter shape (matches `@orangecheck/stamp-core` StampInput).
// ─────────────────────────────────────────────────────────────────────────────

export interface SignerRef {
    address: string;
    /** Returns a base64 BIP-322 signature over the given message as UTF-8 bytes. */
    signMessage: (msg: string) => Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// createDelegation
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateDelegationInput {
    principal: SignerRef;
    agentAddress: string;
    scopes: string[];
    bond?: DelegationBond | null;
    issuedAt?: Date;
    /** Duration from issuedAt in ms. Default 7 days. MAX 365 days per SPEC §4.4. */
    ttlMs?: number;
    /** Explicit expires_at overrides ttlMs. */
    expiresAt?: Date;
    /** 32-hex. Defaults to crypto.getRandomValues(16-byte) rendered as hex. */
    nonce?: string;
    /** Default ['principal']. */
    revocationHolders?: RevocationHolder[];
    /** Optional Nostr pointer to a revocation event. Non-cryptographic. */
    revocationRef?: string | null;
    /** Default 'strict'. 'permissive' allows unregistered scopes / constraint keys. */
    scopeMode?: ValidationOptions['mode'];
}

export async function createDelegation(input: CreateDelegationInput): Promise<DelegationEnvelope> {
    if (!input.scopes || input.scopes.length === 0) {
        throw new Error('createDelegation: at least one scope is required');
    }
    const mode = input.scopeMode ?? 'strict';
    for (const s of input.scopes) validateScope(parseScope(s), { mode });
    const scopes = canonicalizeScopes(input.scopes);

    const issuedAt = isoUtcSeconds(input.issuedAt ?? new Date());
    let expiresAtDate: Date;
    if (input.expiresAt) {
        expiresAtDate = input.expiresAt;
    } else {
        const ttl = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
        expiresAtDate = new Date(new Date(issuedAt).getTime() + ttl);
    }
    const expiresAt = isoUtcSeconds(expiresAtDate);

    const durationMs = new Date(expiresAt).getTime() - new Date(issuedAt).getTime();
    if (durationMs <= 0) throw new Error('createDelegation: expires_at must be after issued_at');
    if (durationMs > 365 * 24 * 60 * 60 * 1000) {
        throw new Error('createDelegation: delegation duration must not exceed 365 days');
    }

    const nonce = input.nonce ?? randomHex(16);
    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        throw new Error('createDelegation: nonce must be 32 lowercase hex chars');
    }

    const bond = input.bond ?? null;
    if (bond) {
        if (!Number.isInteger(bond.sats) || bond.sats < 0) {
            throw new Error('createDelegation: bond.sats must be a non-negative integer');
        }
        if (!/^[0-9a-f]{64}$/.test(bond.attestation_id)) {
            throw new Error('createDelegation: bond.attestation_id must be 64 lowercase hex chars');
        }
    }

    const canonInput = {
        principal: input.principal.address,
        agent: input.agentAddress,
        scopes,
        bond_sats: bond?.sats ?? 0,
        bond_attestation: bond?.attestation_id ?? 'none',
        issued_at: issuedAt,
        expires_at: expiresAt,
        nonce,
    };
    const id = computeDelegationId(canonInput);

    const sigValue = await input.principal.signMessage(id);

    const envelope: DelegationEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'agent-delegation',
        id,
        principal: { address: input.principal.address, alg: 'bip322' },
        agent: { address: input.agentAddress, alg: 'bip322' },
        scopes,
        bond,
        issued_at: issuedAt,
        expires_at: expiresAt,
        nonce,
        revocation: {
            holders: input.revocationHolders ?? ['principal'],
            ref: input.revocationRef ?? null,
        },
        sig: {
            alg: 'bip322',
            pubkey: input.principal.address,
            value: sigValue,
        },
    };
    return envelope;
}

// ─────────────────────────────────────────────────────────────────────────────
// signAsAgent
// ─────────────────────────────────────────────────────────────────────────────

export interface SignAsAgentInput {
    agent: SignerRef;
    delegation: DelegationEnvelope;
    /** Raw bytes to stamp, or a pre-computed { hash, length } pair. */
    content: Uint8Array | { hash: string; length: number };
    mime: string;
    /** Which scope from delegation.scopes is being exercised (or a narrower sub-scope). */
    scopeExercised: string;
    ref?: string | null;
    signedAt?: Date;
    /** OTS proof / anchor data if the caller has already submitted; otherwise null. */
    ots?: ActionOts | null;
}

export async function signAsAgent(input: SignAsAgentInput): Promise<ActionEnvelope> {
    if (input.agent.address !== input.delegation.agent.address) {
        throw new Error('signAsAgent: signer address does not match delegation.agent.address');
    }

    let contentHash: string;
    let contentLength: number;
    if (input.content instanceof Uint8Array) {
        contentHash = 'sha256:' + hexEncode(sha256(input.content));
        contentLength = input.content.byteLength;
    } else {
        if (!input.content.hash.startsWith('sha256:') || input.content.hash.length !== 'sha256:'.length + 64) {
            throw new Error('signAsAgent: content.hash must be "sha256:" + 64 lowercase hex chars');
        }
        contentHash = input.content.hash;
        contentLength = input.content.length;
        if (!Number.isInteger(contentLength) || contentLength < 0) {
            throw new Error('signAsAgent: content.length must be a non-negative integer');
        }
    }

    const signedAt = isoUtcSeconds(input.signedAt ?? new Date());

    const canonInput = {
        address: input.agent.address,
        content_hash: contentHash,
        content_length: contentLength,
        content_mime: input.mime,
        signed_at: signedAt,
        delegation_id: input.delegation.id,
        scope_exercised: input.scopeExercised,
    };
    const id = computeActionId(canonInput);

    const sigValue = await input.agent.signMessage(id);

    const envelope: ActionEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'agent-action',
        id,
        content: {
            hash: contentHash,
            length: contentLength,
            mime: input.mime,
            ref: input.ref ?? null,
        },
        signer: { address: input.agent.address, alg: 'bip322' },
        signed_at: signedAt,
        delegation_id: input.delegation.id,
        scope_exercised: input.scopeExercised,
        ots: input.ots ?? null,
        sig: { alg: 'bip322', pubkey: input.agent.address, value: sigValue },
    };
    return envelope;
}

// ─────────────────────────────────────────────────────────────────────────────
// revoke
// ─────────────────────────────────────────────────────────────────────────────

export interface RevokeInput {
    signer: SignerRef;
    delegation: DelegationEnvelope;
    /** Short ASCII rationale. Defaults to empty string. */
    reason?: string;
    signedAt?: Date;
    /** OTS proof / anchor data if the caller has already submitted; otherwise null. */
    ots?: ActionOts | null;
}

export async function revoke(input: RevokeInput): Promise<RevocationEnvelope> {
    const holders = input.delegation.revocation?.holders ?? ['principal'];
    const allowed = new Set<string>();
    if (holders.includes('principal')) allowed.add(input.delegation.principal.address);
    if (holders.includes('agent')) allowed.add(input.delegation.agent.address);
    if (!allowed.has(input.signer.address)) {
        throw new Error(
            `revoke: signer ${input.signer.address} not authorized to revoke this delegation`
        );
    }

    const reason = input.reason ?? '';
    if (reason.length > 128) throw new Error('revoke: reason must be <=128 bytes');

    const signedAt = isoUtcSeconds(input.signedAt ?? new Date());
    const canonInput = {
        address: input.signer.address,
        delegation_id: input.delegation.id,
        reason,
        signed_at: signedAt,
    };
    const id = computeRevocationId(canonInput);

    const sigValue = await input.signer.signMessage(id);

    const envelope: RevocationEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'agent-revocation',
        id,
        delegation_id: input.delegation.id,
        signer: { address: input.signer.address, alg: 'bip322' },
        reason,
        signed_at: signedAt,
        ots: input.ots ?? null,
        sig: { alg: 'bip322', pubkey: input.signer.address, value: sigValue },
    };
    return envelope;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export {
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    verifyAction,
    verifyDelegation,
    verifyRevocation,
    parseScope,
    isSubScope,
    canonicalizeScope,
    REGISTERED_SCOPES,
} from '@orangecheck/agent-core';
export type {
    ActionEnvelope,
    ActionOts,
    DelegationBond,
    DelegationEnvelope,
    RevocationEnvelope,
    Scope,
    ScopeConstraint,
    AgentErrorCode,
} from '@orangecheck/agent-core';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isoUtcSeconds(d: Date): string {
    return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function randomHex(bytes: number): string {
    const buf = new Uint8Array(bytes);
    const c: Crypto | undefined = (globalThis as unknown as { crypto?: Crypto }).crypto;
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(buf);
    } else {
        // Non-browser fallback. Node ≥18 exposes globalThis.crypto, so this is unlikely to fire.
        for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < bytes; i++) {
        const b = buf[i]!;
        out += b.toString(16).padStart(2, '0');
    }
    return out;
}
