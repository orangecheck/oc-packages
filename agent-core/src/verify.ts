// verifyDelegation / verifyAction / verifyRevocation — reference implementation
// of OC Agent v1 verification. SPEC §8.

import { sha256 } from '@noble/hashes/sha256';

import {
    actionCanonicalBytes,
    actionCanonicalMessage,
    canonicalizeScopes,
    delegationCanonicalBytes,
    delegationCanonicalMessage,
    hexEncode,
    revocationCanonicalBytes,
    revocationCanonicalMessage,
} from './canonical.js';
import {
    canonicalizeScope,
    isSubScope,
    parseScope,
    ScopeParseError,
    validateScope,
    type ValidationOptions,
} from './scope.js';
import {
    ENVELOPE_VERSION,
    type ActionEnvelope,
    type AgentErrorCode,
    type DelegationEnvelope,
    type RevocationEnvelope,
    type VerifyActionResult,
    type VerifyDelegationResult,
    type VerifyRevocationResult,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared options
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyBase {
    verifyBip322?: (msg: string, signatureB64: string, address: string) => Promise<boolean>;
    skipSignatureVerification?: boolean;
    scopeMode?: ValidationOptions['mode'];
}

export class AgentError extends Error {
    code: AgentErrorCode;
    constructor(code: AgentErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'AgentError';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delegation (SPEC §8.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyDelegationInput extends VerifyBase {
    envelope: DelegationEnvelope;
    /** Current time for temporal checks; defaults to new Date(). */
    now?: Date;
    /** Skip temporal checks entirely (useful for inspecting historical envelopes). */
    skipTemporalCheck?: boolean;
}

export async function verifyDelegation(input: VerifyDelegationInput): Promise<VerifyDelegationResult> {
    const env = input.envelope;

    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `delegation version ${env.v} not supported`);
    }

    const shape = checkDelegationShape(env);
    if (shape) return shape;

    // Scope grammar.
    let canonicalScopes: string[];
    try {
        for (const s of env.scopes) validateScope(parseScope(s), { mode: input.scopeMode ?? 'strict' });
        canonicalScopes = canonicalizeScopes(env.scopes);
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }

    // The envelope's `scopes` array must already be in canonical sorted order.
    for (let i = 0; i < canonicalScopes.length; i++) {
        if (env.scopes[i] !== canonicalScopes[i]) {
            return err(
                'E_BAD_SCOPE_GRAMMAR',
                `scope at index ${i} not in canonical form; expected ${canonicalScopes[i]} got ${env.scopes[i]}`
            );
        }
    }

    // Canonical message reconstruction.
    const bondSats = env.bond?.sats ?? 0;
    const bondAttestation = env.bond?.attestation_id ?? 'none';
    const canonInput = {
        principal: env.principal.address,
        agent: env.agent.address,
        scopes: canonicalScopes,
        bond_sats: bondSats,
        bond_attestation: bondAttestation,
        issued_at: env.issued_at,
        expires_at: env.expires_at,
        nonce: env.nonce,
    };
    const reconstructedMessage = delegationCanonicalMessage(canonInput);
    const reconstructedId = hexEncode(sha256(delegationCanonicalBytes(canonInput)));
    if (reconstructedId !== env.id) {
        return err(
            'E_BAD_ID',
            `reconstructed id (${reconstructedId}) does not match envelope.id (${env.id})`
        );
    }

    // Signature.
    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return err('E_BAD_SIG', 'no BIP-322 verifier supplied');
        const ok = await input.verifyBip322(env.id, env.sig.value, env.principal.address);
        if (!ok) return err('E_BAD_SIG', 'BIP-322 signature did not verify');
    }

    // Temporal.
    if (!input.skipTemporalCheck) {
        const now = input.now ?? new Date();
        const issued = new Date(env.issued_at);
        const expires = new Date(env.expires_at);
        if (expires <= issued) return err('E_MALFORMED', 'expires_at <= issued_at');
        if (now < issued) return err('E_NOT_YET_VALID', `delegation not valid until ${env.issued_at}`);
        if (now >= expires) return err('E_EXPIRED', `delegation expired at ${env.expires_at}`);
    }

    return {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructedMessage,
        id: env.id,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (SPEC §8.2–8.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyActionInput extends VerifyBase {
    action: ActionEnvelope;
    /** The delegation cited by action.delegation_id. Required. */
    delegation: DelegationEnvelope;
    /**
     * Known revocations targeting the delegation. The verifier scans for one whose
     * effective time precedes the action (SPEC §9.3).
     */
    revocations?: RevocationEnvelope[];
    content?: Uint8Array;
    verifyOtsAnchor?: (proofB64: string, blockHeight: number, blockHash: string) => Promise<boolean>;
    /** If action and revocation are both OTS-anchored, pass a function that returns the comparable block height of each via proof parsing. Defaults: use envelope.ots.block_height. */
    resolveAnchorBlockHeight?: (env: ActionEnvelope | RevocationEnvelope) => number | null;
}

export async function verifyAction(input: VerifyActionInput): Promise<VerifyActionResult> {
    const a = input.action;
    const d = input.delegation;

    // 1. First verify the delegation.
    const dr = await verifyDelegation({
        envelope: d,
        verifyBip322: input.verifyBip322,
        skipSignatureVerification: input.skipSignatureVerification,
        scopeMode: input.scopeMode,
        skipTemporalCheck: true, // action window check dominates
    });
    if (!dr.ok) return dr;

    // 2. Core action checks.
    if (a.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `action version ${a.v} not supported`);
    }
    const shape = checkActionShape(a);
    if (shape) return shape;

    const canonInput = {
        address: a.signer.address,
        content_hash: a.content.hash,
        content_length: a.content.length,
        content_mime: a.content.mime,
        signed_at: a.signed_at,
        delegation_id: a.delegation_id,
        scope_exercised: a.scope_exercised,
    };
    const reconstructedMessage = actionCanonicalMessage(canonInput);
    const reconstructedId = hexEncode(sha256(actionCanonicalBytes(canonInput)));
    if (reconstructedId !== a.id) {
        return err('E_BAD_ID', `reconstructed id (${reconstructedId}) does not match action.id (${a.id})`);
    }

    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return err('E_BAD_SIG', 'no BIP-322 verifier supplied');
        const ok = await input.verifyBip322(a.id, a.sig.value, a.signer.address);
        if (!ok) return err('E_BAD_ACTION_STAMP', 'action BIP-322 signature did not verify');
    }

    // 3. Authority chain.
    if (a.delegation_id !== d.id) {
        return err('E_DELEGATION_MISMATCH', `action.delegation_id (${a.delegation_id}) != delegation.id (${d.id})`);
    }
    if (a.signer.address !== d.agent.address) {
        return err('E_AGENT_MISMATCH', `action signer (${a.signer.address}) != delegation.agent (${d.agent.address})`);
    }

    // 4. Window.
    const issued = new Date(d.issued_at).getTime();
    const expires = new Date(d.expires_at).getTime();
    const signed = new Date(a.signed_at).getTime();
    if (Number.isNaN(issued) || Number.isNaN(expires) || Number.isNaN(signed)) {
        return err('E_MALFORMED', 'unparseable ISO 8601 timestamp');
    }
    if (signed < issued || signed >= expires) {
        return err('E_OUT_OF_WINDOW', `action.signed_at ${a.signed_at} is outside delegation window [${d.issued_at}, ${d.expires_at})`);
    }

    // 5. Scope containment.
    let exercised, accepted;
    try {
        exercised = canonicalizeScope(parseScope(a.scope_exercised));
        const granted = d.scopes.map((s) => parseScope(s));
        const exercisedParsed = parseScope(a.scope_exercised);
        validateScope(exercisedParsed, { mode: input.scopeMode ?? 'strict' });
        accepted = granted.some((g) => isSubScope(exercisedParsed, g));
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }
    if (!accepted) return err('E_SCOPE_DENIED', `scope_exercised (${exercised}) not a sub-scope of any granted scope`);

    // 6. Revocation check.
    if (input.revocations && input.revocations.length > 0) {
        for (const rev of input.revocations) {
            if (rev.delegation_id !== d.id) continue;
            // Verify the revocation itself (signature + canonical) with the same BIP-322 verifier.
            const rr = await verifyRevocation({
                envelope: rev,
                delegation: d,
                verifyBip322: input.verifyBip322,
                skipSignatureVerification: input.skipSignatureVerification,
            });
            if (!rr.ok) continue; // malformed revocations don't affect the action
            const effective = effectiveRevocationTime(rev, input.resolveAnchorBlockHeight);
            const actionTime = actionEffectiveTime(a, input.resolveAnchorBlockHeight);
            if (compareTimes(effective, actionTime) <= 0) {
                return err('E_REVOKED', `delegation was revoked by ${rev.id} before action was signed`);
            }
        }
    }

    // 7. Content check.
    if (input.content) {
        const actualHash = 'sha256:' + hexEncode(sha256(input.content));
        if (actualHash !== a.content.hash) {
            return err('E_BAD_ACTION_STAMP', `content hash (${actualHash}) != action.content.hash (${a.content.hash})`);
        }
    }

    // 8. Anchor info.
    let anchor: VerifyActionResult extends infer R ? R extends { anchor: infer X } ? X : never : never;
    if (a.ots === null) {
        anchor = { status: 'none' } as typeof anchor;
    } else if (a.ots.status === 'pending') {
        anchor = { status: 'pending' } as typeof anchor;
    } else {
        const h = a.ots.block_height;
        const hash = a.ots.block_hash;
        if (h === null || hash === null) {
            return err('E_MALFORMED', 'confirmed OTS proof missing block_height or block_hash');
        }
        let verified = false;
        if (input.verifyOtsAnchor) {
            try {
                verified = await input.verifyOtsAnchor(a.ots.proof, h, hash);
            } catch (e) {
                return err('E_MALFORMED', `anchor verifier threw: ${(e as Error).message}`);
            }
        }
        anchor = { status: 'confirmed', blockHeight: h, blockHash: hash, verified } as typeof anchor;
    }

    return {
        ok: true,
        envelope: a,
        canonicalMessage: reconstructedMessage,
        id: a.id,
        delegation: d,
        scopeExercised: exercised,
        anchor,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Revocation (SPEC §9, §8 transitive)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyRevocationInput extends VerifyBase {
    envelope: RevocationEnvelope;
    /** The delegation targeted by the revocation. Required to check signer is authorized. */
    delegation: DelegationEnvelope;
}

export async function verifyRevocation(input: VerifyRevocationInput): Promise<VerifyRevocationResult> {
    const env = input.envelope;
    const d = input.delegation;

    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `revocation version ${env.v} not supported`);
    }
    const shape = checkRevocationShape(env);
    if (shape) return shape;

    if (env.delegation_id !== d.id) {
        return err('E_DELEGATION_MISMATCH', `revocation.delegation_id (${env.delegation_id}) != delegation.id (${d.id})`);
    }

    // Signer must be authorized per delegation.revocation.holders.
    const holders = d.revocation?.holders ?? ['principal'];
    const holderAddrs = new Set<string>();
    if (holders.includes('principal')) holderAddrs.add(d.principal.address);
    if (holders.includes('agent')) holderAddrs.add(d.agent.address);
    if (!holderAddrs.has(env.signer.address)) {
        return err('E_REVOKER_UNAUTHORIZED', `revocation signer ${env.signer.address} not in delegation holders`);
    }

    const canonInput = {
        address: env.signer.address,
        delegation_id: env.delegation_id,
        reason: env.reason,
        signed_at: env.signed_at,
    };
    const reconstructedMessage = revocationCanonicalMessage(canonInput);
    const reconstructedId = hexEncode(sha256(revocationCanonicalBytes(canonInput)));
    if (reconstructedId !== env.id) {
        return err('E_BAD_ID', `reconstructed id (${reconstructedId}) does not match revocation.id (${env.id})`);
    }

    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return err('E_BAD_SIG', 'no BIP-322 verifier supplied');
        const ok = await input.verifyBip322(env.id, env.sig.value, env.signer.address);
        if (!ok) return err('E_BAD_SIG', 'revocation BIP-322 signature did not verify');
    }

    return { ok: true, envelope: env, canonicalMessage: reconstructedMessage, id: env.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape checks
// ─────────────────────────────────────────────────────────────────────────────

function checkDelegationShape(env: DelegationEnvelope): VerifyDelegationResult | null {
    if (env.kind !== 'agent-delegation') return err('E_MALFORMED', 'kind must be "agent-delegation"');
    if (!isHex64(env.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!env.principal?.address || env.principal.alg !== 'bip322') return err('E_MALFORMED', 'principal invalid');
    if (!env.agent?.address || env.agent.alg !== 'bip322') return err('E_MALFORMED', 'agent invalid');
    if (!Array.isArray(env.scopes) || env.scopes.length === 0) return err('E_MALFORMED', 'scopes must be non-empty array');
    if (env.bond !== null) {
        if (!Number.isInteger(env.bond.sats) || env.bond.sats < 0) return err('E_MALFORMED', 'bond.sats must be non-negative integer');
        if (!isHex64(env.bond.attestation_id)) return err('E_MALFORMED', 'bond.attestation_id must be 64-hex');
    }
    if (!isIsoUtc(env.issued_at)) return err('E_MALFORMED', 'issued_at must be ISO 8601 UTC');
    if (!isIsoUtc(env.expires_at)) return err('E_MALFORMED', 'expires_at must be ISO 8601 UTC');
    if (!/^[0-9a-f]{32}$/.test(env.nonce)) return err('E_MALFORMED', 'nonce must be 32 lowercase hex chars');
    if (env.sig?.alg !== 'bip322' || typeof env.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (env.sig.pubkey !== env.principal.address) return err('E_MALFORMED', 'sig.pubkey must equal principal.address');
    return null;
}

function checkActionShape(a: ActionEnvelope): VerifyActionResult | null {
    if (a.kind !== 'agent-action') return err('E_MALFORMED', 'kind must be "agent-action"');
    if (!isHex64(a.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!a.content || typeof a.content.hash !== 'string' || !a.content.hash.startsWith('sha256:')) {
        return err('E_MALFORMED', 'content.hash must start with "sha256:"');
    }
    if (!Number.isInteger(a.content.length) || a.content.length < 0) return err('E_MALFORMED', 'content.length invalid');
    if (!a.signer?.address || a.signer.alg !== 'bip322') return err('E_MALFORMED', 'signer invalid');
    if (!isIsoUtc(a.signed_at)) return err('E_MALFORMED', 'signed_at must be ISO 8601 UTC');
    if (!isHex64(a.delegation_id)) return err('E_MALFORMED', 'delegation_id must be 64-hex');
    if (typeof a.scope_exercised !== 'string' || a.scope_exercised.length === 0) return err('E_MALFORMED', 'scope_exercised required');
    if (a.sig?.alg !== 'bip322' || typeof a.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (a.sig.pubkey !== a.signer.address) return err('E_MALFORMED', 'sig.pubkey must equal signer.address');
    return null;
}

function checkRevocationShape(env: RevocationEnvelope): VerifyRevocationResult | null {
    if (env.kind !== 'agent-revocation') return err('E_MALFORMED', 'kind must be "agent-revocation"');
    if (!isHex64(env.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!isHex64(env.delegation_id)) return err('E_MALFORMED', 'delegation_id must be 64-hex');
    if (!env.signer?.address || env.signer.alg !== 'bip322') return err('E_MALFORMED', 'signer invalid');
    if (typeof env.reason !== 'string' || env.reason.length > 128) return err('E_MALFORMED', 'reason must be a string <=128 bytes');
    if (!isIsoUtc(env.signed_at)) return err('E_MALFORMED', 'signed_at must be ISO 8601 UTC');
    if (env.sig?.alg !== 'bip322' || typeof env.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (env.sig.pubkey !== env.signer.address) return err('E_MALFORMED', 'sig.pubkey must equal signer.address');
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time comparison for revocation vs action (SPEC §9.3)
// ─────────────────────────────────────────────────────────────────────────────

type EffectiveTime =
    | { kind: 'anchor'; blockHeight: number }
    | { kind: 'signed'; ms: number };

function actionEffectiveTime(
    a: ActionEnvelope,
    resolve?: (env: ActionEnvelope | RevocationEnvelope) => number | null
): EffectiveTime {
    if (a.ots?.status === 'confirmed') {
        const h = resolve ? resolve(a) : a.ots.block_height;
        if (h !== null && h !== undefined) return { kind: 'anchor', blockHeight: h };
    }
    return { kind: 'signed', ms: new Date(a.signed_at).getTime() };
}

function effectiveRevocationTime(
    r: RevocationEnvelope,
    resolve?: (env: ActionEnvelope | RevocationEnvelope) => number | null
): EffectiveTime {
    if (r.ots?.status === 'confirmed') {
        const h = resolve ? resolve(r) : r.ots.block_height;
        if (h !== null && h !== undefined) return { kind: 'anchor', blockHeight: h };
    }
    return { kind: 'signed', ms: new Date(r.signed_at).getTime() };
}

/** Returns <0 if a < b, 0 if equal, >0 if a > b. Anchored always beats signed-only. */
function compareTimes(a: EffectiveTime, b: EffectiveTime): number {
    if (a.kind === 'anchor' && b.kind === 'anchor') return a.blockHeight - b.blockHeight;
    // If only one anchored, the anchored one is authoritative: an unanchored action cannot
    // prove priority against an anchored revocation, so the anchored side is treated as "earlier".
    if (a.kind === 'anchor') return -1;
    if (b.kind === 'anchor') return 1;
    return a.ms - b.ms;
}

// ─────────────────────────────────────────────────────────────────────────────

function err(code: AgentErrorCode, message: string): VerifyErrResult {
    return { ok: false, code, message };
}

type VerifyErrResult = { ok: false; code: AgentErrorCode; message: string };

function isHex64(s: unknown): s is string {
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

function isIsoUtc(s: unknown): s is string {
    return (
        typeof s === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)
    );
}
