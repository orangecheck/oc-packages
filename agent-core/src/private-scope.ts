// Private-scope helpers (PRIVATE-SCOPE.md, v1.2). Wrapping the OC Lock
// `seal` and `unseal` primitives with the OC Agent-specific payload format
// (canonical JSON array of scope strings, UTF-8 encoded).
//
// Why this lives in agent-core and not the consumer side: the canonical-
// message commitment is the same across modes, so verifyDelegation needs to
// be able to recover the plaintext. Centralizing the payload codec here
// means every conformant verifier hashes the same bytes.

import { seal as lockSeal, unseal as lockUnseal } from '@orangecheck/lock-core';
import type {
    DeviceRecord,
    LockEnvelope,
    SealInput,
    UnsealInput,
} from '@orangecheck/lock-core';

import { canonicalizeScopes } from './canonical.js';
import type { ScopesEncryptedEnvelope } from './types.js';

/**
 * The plaintext payload sealed inside the OC Lock envelope. Canonical JSON
 * array of scope strings. Scopes are first put in canonical form (constraints
 * sorted by key) and the array is sorted lexicographically — same discipline
 * as v1.0 public-mode `scopes` field, so that the canonical-message bytes
 * match byte-for-byte across modes.
 */
export function encodeScopesPayload(scopes: string[]): Uint8Array {
    const canonical = canonicalizeScopes(scopes);
    const json = JSON.stringify(canonical);
    return new TextEncoder().encode(json);
}

/**
 * Inverse of `encodeScopesPayload`. Returns the canonicalized scope array.
 * Throws if the payload doesn't decode to a string array.
 */
export function decodeScopesPayload(bytes: Uint8Array): string[] {
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
        throw new Error('scopes payload must be a JSON array of strings');
    }
    return parsed as string[];
}

export interface SealScopesInput {
    scopes: string[];
    /** Principal / sender — the same address that signs the OC Agent envelope. */
    sender: SealInput['sender'];
    /** Authorized decryptors. Must include at least the agent. */
    recipients: DeviceRecord[];
    /** Optional human hint stored in the OC Lock envelope. */
    hint?: string;
    /** Optional expiry on the OC Lock envelope itself. Independent of the
     *  delegation's expires_at; usually left null. */
    expiresAt?: Date | null;
}

/**
 * Seal a scope list to one or more recipients. Returns the OC Lock envelope
 * to be embedded as `delegation.scopes_encrypted`.
 */
export async function sealScopes(
    input: SealScopesInput
): Promise<ScopesEncryptedEnvelope> {
    const env = await lockSeal({
        kind: 'identity',
        payload: encodeScopesPayload(input.scopes),
        sender: input.sender,
        recipients: input.recipients,
        ...(input.hint !== undefined && { hint: input.hint }),
        ...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
    });
    return env as unknown as ScopesEncryptedEnvelope;
}

export interface UnsealScopesInput {
    envelope: ScopesEncryptedEnvelope;
    device: UnsealInput['device'];
    /** BIP-322 verifier callback. If omitted, the embedded LockEnvelope's
     *  signature is NOT checked — useful for inspection or test paths. */
    verifyBip322?: UnsealInput['verifyBip322'];
    /** Skip the inner sender-signature check entirely. Default false. */
    skipSenderVerification?: boolean;
}

/** Result of unseal: decoded scope list plus the recovered sender address. */
export interface UnsealedScopes {
    scopes: string[];
    sender: { address: string; attestation_id?: string };
    matchedDeviceId: string;
}

/**
 * Decrypt an OC Agent v1.2 `scopes_encrypted` field with one of the
 * recipient device keys.
 */
export async function unsealScopes(
    input: UnsealScopesInput
): Promise<UnsealedScopes> {
    const r = await lockUnseal({
        envelope: input.envelope as unknown as LockEnvelope,
        device: input.device,
        ...(input.verifyBip322 ? { verifyBip322: input.verifyBip322 } : {}),
        ...(input.skipSenderVerification !== undefined && {
            skipSenderVerification: input.skipSenderVerification,
        }),
    });
    return {
        scopes: decodeScopesPayload(r.payload),
        sender: r.sender,
        matchedDeviceId: r.matchedDeviceId,
    };
}

/** Convenience predicate. */
export function hasPrivateScopes<
    T extends { scopes?: string[]; scopes_encrypted?: ScopesEncryptedEnvelope }
>(envelope: T): envelope is T & { scopes_encrypted: ScopesEncryptedEnvelope } {
    return !!envelope.scopes_encrypted;
}
