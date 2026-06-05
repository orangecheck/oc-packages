// OC Agent v1.2 — Federation Principal (FEDERATION.md).
//
// ADDITIVE module. Implements the federation-principal extension WITHOUT
// touching the v1 single-address path (types.ts DelegationEnvelope, verify.ts
// verifyDelegation are unchanged + byte-identical against their vectors). A
// dispatcher routes by `principal.alg` / `signer.alg`:
//
//   principal.alg === 'bip322'      → verifyDelegation   (v1, unchanged)
//   principal.alg === 'federation'  → verifyFederationDelegation (this module)
//
// A federation principal is a content-addressed M-of-N guardian set. A
// delegation / revocation under it is authentic iff M of N declared guardians
// have BIP-322-signed the canonical message. The canonical-message + id rules
// are unchanged — only the principal line (`federation:<descriptor_id>`) and the
// signature block (`federation-bip322` with M-of-N) generalize. FEDERATION.md
// §2 / §3 / §4.

import { sha256 } from '@noble/hashes/sha256';

import {
    canonicalizeScopes,
    computeDelegationId,
    computeRevocationId,
    delegationCanonicalMessage,
    hexEncode,
    revocationCanonicalMessage,
} from './canonical.js';
import type { ActorRef, AgentErrorCode, DelegationBond, DelegationRevocationRef } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types (FEDERATION.md §2 / §3.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface FederationGuardian {
    /** mainnet Bitcoin address (P2WPKH, P2TR, or P2PKH). */
    address: string;
    alg: 'bip322';
    /** Optional human label. NOT part of the cryptographic identity. */
    name?: string;
}

export interface FederationDescriptor {
    v: 1;
    kind: 'agent-federation';
    /** "M-of-N", 1 ≤ M ≤ N, N === guardians.length. */
    threshold: string;
    guardians: FederationGuardian[];
}

export interface FederationPrincipal {
    alg: 'federation';
    descriptor_id: string;
    descriptor: FederationDescriptor;
}

export interface FederationSignature {
    alg: 'federation-bip322';
    threshold: string;
    signatures: Array<{ guardian_address: string; value: string }>;
}

export interface FederationDelegationEnvelope {
    v: 1;
    kind: 'agent-delegation';
    id: string;
    principal: FederationPrincipal;
    agent: ActorRef;
    scopes: string[];
    bond: DelegationBond | null;
    issued_at: string;
    expires_at: string;
    nonce: string;
    revocation: DelegationRevocationRef;
    sig: FederationSignature;
}

export interface FederationRevocationEnvelope {
    v: 1;
    kind: 'agent-revocation';
    id: string;
    delegation_id: string;
    /** Federation principal that authorizes the revocation (the guardian set). */
    signer: FederationPrincipal;
    reason: string;
    signed_at: string;
    ots?: unknown | null;
    sig: FederationSignature;
}

export type FederationVerifyResult =
    | { ok: true; id: string; canonicalMessage: string }
    | { ok: false; code: AgentErrorCode; message: string };

export interface VerifyFederationBase {
    /** Injected BIP-322 verifier. Required unless `skipSignatureVerification`. */
    verifyBip322?: (msg: string, signatureB64: string, address: string) => Promise<boolean>;
    skipSignatureVerification?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Descriptor canonicalization (FEDERATION.md §2.1 / §2.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical, line-oriented descriptor message. Guardians are emitted in
 * lexicographic byte order of their address (NOT the JSON array order); the
 * `name` label is excluded — it is JSON-only metadata. No trailing LF.
 */
export function federationDescriptorCanonicalMessage(descriptor: FederationDescriptor): string {
    const addresses = descriptor.guardians
        .map((g) => g.address)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return [
        'oc-agent:federation:v1',
        `threshold: ${descriptor.threshold}`,
        ...addresses.map((a) => `guardian: ${a}`),
    ].join('\n');
}

/** descriptor_id := H(canonical_descriptor_bytes). 64 lowercase hex. */
export function computeFederationDescriptorId(descriptor: FederationDescriptor): string {
    return hexEncode(sha256(new TextEncoder().encode(federationDescriptorCanonicalMessage(descriptor))));
}

function parseThreshold(t: unknown): { m: number; n: number } | null {
    if (typeof t !== 'string') return null;
    const m = /^(\d+)-of-(\d+)$/.exec(t);
    if (!m) return null;
    const mm = Number(m[1]);
    const nn = Number(m[2]);
    if (!Number.isInteger(mm) || !Number.isInteger(nn) || mm < 1 || mm > nn) return null;
    return { m: mm, n: nn };
}

const HEX64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Shared descriptor + quorum validation (FEDERATION.md §3.3 checks 3–8 minus the
 * id check, plus BIP-322). `reconstructedId` is the already-computed envelope id.
 */
async function checkFederationQuorum(
    principal: FederationPrincipal,
    sig: FederationSignature,
    reconstructedId: string,
    input: VerifyFederationBase
): Promise<{ ok: true } | { ok: false; code: AgentErrorCode; message: string }> {
    // §3.3.2 — principal alg.
    if (principal?.alg !== 'federation') {
        return fail('E_MALFORMED', 'principal.alg must be "federation"');
    }
    const descriptor = principal.descriptor;
    if (!descriptor || descriptor.kind !== 'agent-federation') {
        return fail('E_MALFORMED', 'principal.descriptor missing or wrong kind');
    }
    const parsed = parseThreshold(descriptor.threshold);
    if (!parsed) return fail('E_MALFORMED', `malformed threshold "${descriptor.threshold}"`);
    if (!Array.isArray(descriptor.guardians) || descriptor.guardians.length !== parsed.n) {
        return fail('E_MALFORMED', 'guardians length must equal N in M-of-N');
    }

    // §3.3.3 — descriptor_id matches the canonical hash of the inlined descriptor.
    const computedDescId = computeFederationDescriptorId(descriptor);
    if (principal.descriptor_id !== computedDescId) {
        return fail(
            'E_BAD_FEDERATION_DESCRIPTOR',
            `declared descriptor_id (${principal.descriptor_id}) != canonical hash (${computedDescId})`
        );
    }

    // §3.3.4 — sig.threshold equals descriptor.threshold.
    if (sig?.alg !== 'federation-bip322') {
        return fail('E_MALFORMED', 'sig.alg must be "federation-bip322"');
    }
    if (sig.threshold !== descriptor.threshold) {
        return fail(
            'E_THRESHOLD_MISMATCH',
            `sig.threshold (${sig.threshold}) != descriptor.threshold (${descriptor.threshold})`
        );
    }

    // §3.3.5 — at least M signatures.
    const sigs = sig.signatures;
    if (!Array.isArray(sigs)) return fail('E_MALFORMED', 'sig.signatures must be an array');
    if (sigs.length < parsed.m) {
        return fail(
            'E_THRESHOLD_NOT_MET',
            `${sigs.length} signature(s) below threshold M=${parsed.m}`
        );
    }

    // §3.3.6 / §3.3.7 — every signer is a declared guardian; no duplicates.
    const guardianSet = new Set(descriptor.guardians.map((g) => g.address));
    const seen = new Set<string>();
    for (const s of sigs) {
        if (!guardianSet.has(s.guardian_address)) {
            return fail('E_UNKNOWN_GUARDIAN', `${s.guardian_address} is not a declared guardian`);
        }
        if (seen.has(s.guardian_address)) {
            return fail('E_DUPLICATE_GUARDIAN', `${s.guardian_address} signed more than once`);
        }
        seen.add(s.guardian_address);
    }

    // §3.3.8 — each signature verifies under BIP-322 over the hex-encoded id.
    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return fail('E_BAD_SIG', 'no BIP-322 verifier supplied');
        for (const s of sigs) {
            const ok = await input.verifyBip322(reconstructedId, s.value, s.guardian_address);
            if (!ok) {
                return fail('E_BAD_SIG', `guardian ${s.guardian_address} signature did not verify`);
            }
        }
    }
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegation under a federation principal (FEDERATION.md §3)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyFederationDelegationInput extends VerifyFederationBase {
    envelope: FederationDelegationEnvelope;
    now?: Date;
    skipTemporalCheck?: boolean;
}

export async function verifyFederationDelegation(
    input: VerifyFederationDelegationInput
): Promise<FederationVerifyResult> {
    const env = input.envelope;
    if (env?.kind !== 'agent-delegation') return fail('E_MALFORMED', 'kind must be "agent-delegation"');
    if (!HEX64.test(env.id ?? '')) return fail('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!env.agent?.address || env.agent.alg !== 'bip322') return fail('E_MALFORMED', 'agent invalid');
    if (!Array.isArray(env.scopes) || env.scopes.length === 0) {
        return fail('E_MALFORMED', 'scopes must be a non-empty array');
    }
    if (!ISO_UTC.test(env.issued_at) || !ISO_UTC.test(env.expires_at)) {
        return fail('E_MALFORMED', 'issued_at / expires_at must be ISO 8601 UTC');
    }
    if (!/^[0-9a-f]{32}$/.test(env.nonce)) return fail('E_MALFORMED', 'nonce must be 32 hex chars');

    // Canonical scopes (identical rules to v1) must be sorted on the envelope.
    let canonicalScopes: string[];
    try {
        canonicalScopes = canonicalizeScopes(env.scopes);
    } catch (e) {
        return fail('E_BAD_SCOPE_GRAMMAR', (e as Error).message);
    }
    for (let i = 0; i < canonicalScopes.length; i++) {
        if (env.scopes[i] !== canonicalScopes[i]) {
            return fail('E_BAD_SCOPE_GRAMMAR', `scope index ${i} not in canonical order`);
        }
    }

    // §3.3.1 / §3.1 — reconstruct the id with the `federation:<descriptor_id>`
    // principal substitution. Everything else is the v1 canonical message.
    const canonInput = {
        principal: `federation:${env.principal?.descriptor_id ?? ''}`,
        agent: env.agent.address,
        scopes: canonicalScopes,
        bond_sats: env.bond?.sats ?? 0,
        bond_attestation: env.bond?.attestation_id ?? 'none',
        issued_at: env.issued_at,
        expires_at: env.expires_at,
        nonce: env.nonce,
    };
    const reconstructedId = computeDelegationId(canonInput);
    if (reconstructedId !== env.id) {
        return fail('E_BAD_ID', `reconstructed id (${reconstructedId}) != envelope.id (${env.id})`);
    }

    const quorum = await checkFederationQuorum(env.principal, env.sig, env.id, input);
    if (!quorum.ok) return quorum;

    if (!input.skipTemporalCheck) {
        const now = input.now ?? new Date();
        const issued = new Date(env.issued_at);
        const expires = new Date(env.expires_at);
        if (expires <= issued) return fail('E_MALFORMED', 'expires_at <= issued_at');
        if (now < issued) return fail('E_NOT_YET_VALID', `delegation not valid until ${env.issued_at}`);
        if (now >= expires) return fail('E_EXPIRED', `delegation expired at ${env.expires_at}`);
    }

    return { ok: true, id: env.id, canonicalMessage: delegationCanonicalMessage(canonInput) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revocation under a federation principal (FEDERATION.md §4)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyFederationRevocationInput extends VerifyFederationBase {
    envelope: FederationRevocationEnvelope;
}

export async function verifyFederationRevocation(
    input: VerifyFederationRevocationInput
): Promise<FederationVerifyResult> {
    const env = input.envelope;
    if (env?.kind !== 'agent-revocation') return fail('E_MALFORMED', 'kind must be "agent-revocation"');
    if (!HEX64.test(env.id ?? '')) return fail('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!HEX64.test(env.delegation_id ?? '')) return fail('E_MALFORMED', 'delegation_id must be 64-hex');
    if (typeof env.reason !== 'string' || env.reason.length > 128) {
        return fail('E_MALFORMED', 'reason must be a string ≤128 bytes');
    }
    if (!ISO_UTC.test(env.signed_at)) return fail('E_MALFORMED', 'signed_at must be ISO 8601 UTC');

    // §4 — the `address:` line carries the `federation:<descriptor_id>`
    // substitution; everything else is the v1 revocation canonical message.
    const canonInput = {
        address: `federation:${env.signer?.descriptor_id ?? ''}`,
        delegation_id: env.delegation_id,
        reason: env.reason,
        signed_at: env.signed_at,
    };
    const reconstructedId = computeRevocationId(canonInput);
    if (reconstructedId !== env.id) {
        return fail('E_BAD_ID', `reconstructed id (${reconstructedId}) != envelope.id (${env.id})`);
    }

    const quorum = await checkFederationQuorum(env.signer, env.sig, env.id, input);
    if (!quorum.ok) return quorum;

    return { ok: true, id: env.id, canonicalMessage: revocationCanonicalMessage(canonInput) };
}

function fail(code: AgentErrorCode, message: string): { ok: false; code: AgentErrorCode; message: string } {
    return { ok: false, code, message };
}
