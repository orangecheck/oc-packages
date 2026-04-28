// Canonical messages + envelope canonicalization for OC Agent. SPEC §4.1, §5.1, §9.1.
//
// Three canonical-message builders live here — one per envelope kind. Each one
// produces the exact byte sequence a signer signs via BIP-322 and the hash
// input for the envelope id.
//
// The RFC 8785 JSON canonicalizer and hex utilities are re-exported from
// @orangecheck/stamp-core so OC Agent and OC Stamp are guaranteed to produce
// identical bytes for identical structural inputs.

import { sha256 } from '@noble/hashes/sha256';
import { canonicalize, hexEncode } from '@orangecheck/stamp-core/canonical';

import { canonicalizeScope, parseScope, type Scope } from './scope.js';
import type {
    ActionCanonicalInput,
    ActionEnvelope,
    DelegationCanonicalInput,
    DelegationEnvelope,
    RevocationCanonicalInput,
    RevocationEnvelope,
    SubdelegationCanonicalInput,
} from './types.js';

export { canonicalize, hexEncode };

// ─────────────────────────────────────────────────────────────────────────────
// Scope sorting + serialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonicalize and sort a list of scope strings for the delegation canonical
 * message. Each scope is first parsed, then re-emitted in canonical form
 * (constraints sorted by key), and the whole list is sorted lexicographically.
 */
export function canonicalizeScopes(scopes: string[]): string[] {
    const canonical = scopes.map((s) => canonicalizeScope(parseScope(s)));
    return [...canonical].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Same as `canonicalizeScopes` but returns `Scope` objects too, for callers
 * that need them.
 */
export function parseAndCanonicalizeScopes(scopes: string[]): { canonical: string[]; parsed: Scope[] } {
    const parsed = scopes.map(parseScope);
    const canonicalStrings = parsed.map(canonicalizeScope);
    const indexed = canonicalStrings.map((s, i) => ({ s, p: parsed[i]! }));
    indexed.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
    return {
        canonical: indexed.map((x) => x.s),
        parsed: indexed.map((x) => x.p),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical messages (SPEC §4.1, §5.1, §9.1)
// ─────────────────────────────────────────────────────────────────────────────

export function delegationCanonicalMessage(input: DelegationCanonicalInput): string {
    const scopeField = input.scopes.join(',');
    return [
        'oc-agent:delegation:v1',
        `principal: ${input.principal}`,
        `agent: ${input.agent}`,
        `scopes: ${scopeField}`,
        `bond_sats: ${input.bond_sats}`,
        `bond_attestation: ${input.bond_attestation}`,
        `issued_at: ${input.issued_at}`,
        `expires_at: ${input.expires_at}`,
        `nonce: ${input.nonce}`,
    ].join('\n');
}

export function actionCanonicalMessage(input: ActionCanonicalInput): string {
    return [
        'oc-agent:action:v1',
        `address: ${input.address}`,
        `content_hash: ${input.content_hash}`,
        `content_length: ${input.content_length}`,
        `content_mime: ${input.content_mime}`,
        `signed_at: ${input.signed_at}`,
        `delegation_id: ${input.delegation_id}`,
        `scope_exercised: ${input.scope_exercised}`,
    ].join('\n');
}

export function revocationCanonicalMessage(input: RevocationCanonicalInput): string {
    return [
        'oc-agent:revocation:v1',
        `address: ${input.address}`,
        `delegation_id: ${input.delegation_id}`,
        `reason: ${input.reason}`,
        `signed_at: ${input.signed_at}`,
    ].join('\n');
}

export function subdelegationCanonicalMessage(input: SubdelegationCanonicalInput): string {
    const scopeField = input.scopes.join(',');
    return [
        'oc-agent:subdelegation:v1',
        `parent_id: ${input.parent_id}`,
        `principal: ${input.principal}`,
        `agent: ${input.agent}`,
        `scopes: ${scopeField}`,
        `issued_at: ${input.issued_at}`,
        `expires_at: ${input.expires_at}`,
        `nonce: ${input.nonce}`,
    ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bytes + ids
// ─────────────────────────────────────────────────────────────────────────────

export function delegationCanonicalBytes(input: DelegationCanonicalInput): Uint8Array {
    return new TextEncoder().encode(delegationCanonicalMessage(input));
}

export function actionCanonicalBytes(input: ActionCanonicalInput): Uint8Array {
    return new TextEncoder().encode(actionCanonicalMessage(input));
}

export function revocationCanonicalBytes(input: RevocationCanonicalInput): Uint8Array {
    return new TextEncoder().encode(revocationCanonicalMessage(input));
}

export function subdelegationCanonicalBytes(input: SubdelegationCanonicalInput): Uint8Array {
    return new TextEncoder().encode(subdelegationCanonicalMessage(input));
}

export function computeDelegationId(input: DelegationCanonicalInput): string {
    return hexEncode(sha256(delegationCanonicalBytes(input)));
}

export function computeActionId(input: ActionCanonicalInput): string {
    return hexEncode(sha256(actionCanonicalBytes(input)));
}

export function computeRevocationId(input: RevocationCanonicalInput): string {
    return hexEncode(sha256(revocationCanonicalBytes(input)));
}

export function computeSubdelegationId(input: SubdelegationCanonicalInput): string {
    return hexEncode(sha256(subdelegationCanonicalBytes(input)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope canonicalization (SPEC §6; RFC 8785 + scope-sorting)
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalizeDelegation(env: DelegationEnvelope): string {
    return canonicalize(env as unknown as Parameters<typeof canonicalize>[0]);
}

export function canonicalizeAction(env: ActionEnvelope): string {
    return canonicalize(env as unknown as Parameters<typeof canonicalize>[0]);
}

export function canonicalizeRevocation(env: RevocationEnvelope): string {
    return canonicalize(env as unknown as Parameters<typeof canonicalize>[0]);
}

export function canonicalDelegationBytes(env: DelegationEnvelope): Uint8Array {
    return new TextEncoder().encode(canonicalizeDelegation(env) + '\n');
}

export function canonicalActionBytes(env: ActionEnvelope): Uint8Array {
    return new TextEncoder().encode(canonicalizeAction(env) + '\n');
}

export function canonicalRevocationBytes(env: RevocationEnvelope): Uint8Array {
    return new TextEncoder().encode(canonicalizeRevocation(env) + '\n');
}

export function sha256Hex(bytes: Uint8Array): string {
    return hexEncode(sha256(bytes));
}
