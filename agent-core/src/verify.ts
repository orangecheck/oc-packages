// verifyDelegation / verifyAction / verifyRevocation — reference implementation
// of OC Agent v1 verification. SPEC §8.

import { sha256 } from '@noble/hashes/sha256';

import {
    actionCanonicalBytes,
    actionCanonicalMessage,
    canonicalizeScopes,
    computeSubdelegationId,
    delegationCanonicalBytes,
    delegationCanonicalMessage,
    hexEncode,
    revocationCanonicalBytes,
    revocationCanonicalMessage,
} from './canonical.js';
import {
    isHex64,
    isIsoUtc,
    isPlainObject,
    isText,
    nowProblem,
    shown,
    signatureVerifies,
} from './guards.js';
import { unsealScopes } from './private-scope.js';
import { revocationFlags } from './reason.js';
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
    type ChainLink,
    type DelegationEnvelope,
    type RevocationEnvelope,
    type SubdelegationEnvelope,
    type VerifyActionResult,
    type VerifyDelegationResult,
    type VerifyRevocationResult,
    type VerifySubdelegationResult,
} from './types.js';

/** Default maximum chain depth, per SUB-DELEGATION.md §2.1. */
export const DEFAULT_MAX_CHAIN_DEPTH = 5;

/** How far a live action's `signed_at` may lie from the verifier's clock, either way (SPEC §8.3 step 11a). */
export const DEFAULT_MAX_SKEW_MS = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// Shared options
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyBase {
    verifyBip322?: (msg: string, signatureB64: string, address: string) => Promise<boolean>;
    skipSignatureVerification?: boolean;
    scopeMode?: ValidationOptions['mode'];
    /**
     * Verify WITHOUT consulting revocation feeds. Required to be explicit.
     *
     * SECURITY §5 item 7: "Query revocation feeds (Nostr kind-30085 by `#t`
     * with the cited delegation id) before reporting OK, **unless the caller
     * explicitly opts out**." The default was inverted — revocations
     * were checked only when supplied, and omitting them skipped the check
     * silently, so "checked, clean" was indistinguishable from "never checked".
     *
     * This library has no network by design, so the caller fetches the feed and
     * passes `revocations`. Declining to is a decision they must state.
     */
    skipRevocationCheck?: boolean;
    /**
     * Revocations to evaluate against the delegation (or, for an action, every
     * link in its chain). Fetch kind-30085 events with `"#t": [<delegation id>]`
     * (SPEC §9.4); relays do not index the multi-letter `delegation` tag. Pass
     * `[]` only when a relay answered with EOSE and none matched (SPEC §10.4).
     */
    revocations?: RevocationEnvelope[];
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
    /**
     * v1.2 private-scope decryption key. When the envelope carries
     * `scopes_encrypted`, the verifier MUST supply a device key matching one
     * of the recipient entries to recover the plaintext scope list. Without
     * this, verification returns `E_SCOPES_UNREADABLE`.
     */
    decryptScopesWith?: {
        device_id: string;
        secretKey: Uint8Array;
    };
}

export async function verifyDelegation(input: VerifyDelegationInput): Promise<VerifyDelegationResult> {
    if (!isPlainObject(input)) return err('E_MALFORMED', 'verifyDelegation takes an options object');
    const env = input.envelope;
    if (!isPlainObject(env)) return err('E_MALFORMED', 'the delegation must be an object');
    const listProblem = revocationsProblem(input.revocations);
    if (listProblem) return err('E_MALFORMED', listProblem);
    const badNow = nowProblem(input.now);
    if (badNow) return err('E_MALFORMED', badNow);

    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `delegation version ${shown(env.v)} not supported`);
    }

    const shape = checkDelegationShape(env);
    if (shape) return shape;

    // ─── v1.2 PRE-VERIFICATION (PRIVATE-SCOPE.md §2 steps P1–P6) ───────────
    // Steps P1 / P2: mutual exclusion + presence.
    if (env.scopes !== undefined && env.scopes_encrypted !== undefined) {
        return err(
            'E_SCOPES_BOTH_PROVIDED',
            'envelope carries both scopes and scopes_encrypted; pick one'
        );
    }
    if (env.scopes === undefined && env.scopes_encrypted === undefined) {
        return err(
            'E_SCOPES_NEITHER_PROVIDED',
            'envelope carries neither scopes nor scopes_encrypted'
        );
    }

    // The plaintext scope list. Either copied from env.scopes (public mode)
    // or recovered by decrypting env.scopes_encrypted (private mode).
    let workingScopes: string[];

    if (env.scopes_encrypted !== undefined) {
        // Step P3: issuer binding — the inner Lock envelope's `from.address`
        // must match the OC Agent envelope's principal.
        if (env.scopes_encrypted.from?.address !== env.principal.address) {
            return err(
                'E_MALFORMED',
                `scopes_encrypted.from.address (${shown(env.scopes_encrypted.from?.address)}) does not match principal.address (${env.principal.address})`
            );
        }
        // Step P5: decryption capability.
        if (!input.decryptScopesWith) {
            return err(
                'E_SCOPES_UNREADABLE',
                'envelope carries scopes_encrypted; no decryption key provided'
            );
        }
        // Step P6: decrypt. Step P4 (inner-sig verify) is handled inside
        // unsealScopes via the same BIP-322 verifier — but only when
        // skipSignatureVerification is false.
        try {
            const r = await unsealScopes({
                envelope: env.scopes_encrypted,
                device: input.decryptScopesWith,
                ...(input.verifyBip322 ? { verifyBip322: input.verifyBip322 } : {}),
                skipSenderVerification: !!input.skipSignatureVerification,
            });
            workingScopes = r.scopes;
        } catch (e) {
            const msg = (e as Error).message ?? String(e);
            // Distinguish "I had a key but the cryptographic operation failed
            // (bad envelope)" from "I had no matching recipient" — the latter
            // is the more common case and gets E_SCOPES_UNREADABLE; the
            // former gets E_BAD_LOCK_ENVELOPE.
            if (/no matching recipient|no recipient|device_id/i.test(msg)) {
                return err('E_SCOPES_UNREADABLE', msg);
            }
            return err('E_BAD_LOCK_ENVELOPE', msg);
        }
    } else {
        workingScopes = env.scopes!;
    }

    // ─── Standard verification (SPEC.md §8.1) ──────────────────────────────
    // Scope grammar.
    let canonicalScopes: string[];
    try {
        for (const s of workingScopes) validateScope(parseScope(s), { mode: input.scopeMode ?? 'strict' });
        canonicalScopes = canonicalizeScopes(workingScopes);
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }

    // In public mode the envelope's `scopes` array must already be in
    // canonical sorted order. (Private mode: the decrypted plaintext is
    // canonicalized at seal time, so this loop is a no-op for it.)
    for (let i = 0; i < canonicalScopes.length; i++) {
        if (workingScopes[i] !== canonicalScopes[i]) {
            return err(
                'E_BAD_SCOPE_GRAMMAR',
                `scope at index ${i} not in canonical form; expected ${canonicalScopes[i]} got ${workingScopes[i]}`
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
        const ok = await signatureVerifies(input.verifyBip322, env.id, env.sig.value, env.principal.address);
        if (!ok) return err('E_BAD_SIG', 'BIP-322 signature did not verify');
    }

    // Revocation. SECURITY §5 item 7 — check unless the caller states otherwise.
    // Before this, verifyDelegation had NO revocations parameter at all: a
    // revoked delegation returned ok:true and a caller had no way to say
    // otherwise.
    if (!input.skipRevocationCheck && !input.revocations) {
        return err(
            'E_MALFORMED',
            'verifyDelegation requires `revocations` (query kind 30085 with "#t": [delegation id], ' +
                'SPEC §9.4) or an explicit skipRevocationCheck:true to state that revocation is not being checked',
        );
    }
    // A revocation that is not an object, or cites this delegation and fails its
    // own check, revokes nothing; it is skipped and counted.
    let revocationsSkipped = 0;
    for (const rev of input.revocations ?? []) {
        if (!isPlainObject(rev)) {
            revocationsSkipped++;
            continue;
        }
        if (rev.delegation_id !== env.id) continue;
        const rr = await verifyRevocation({
            envelope: rev,
            delegation: env,
            verifyBip322: input.verifyBip322,
            skipSignatureVerification: input.skipSignatureVerification,
        });
        if (!rr.ok) {
            revocationsSkipped++;
            continue;
        }
        return err('E_REVOKED', `delegation ${env.id} was revoked by ${rr.id}`);
    }

    // Temporal.
    if (!input.skipTemporalCheck) {
        const now = input.now ?? new Date();
        const issued = new Date(env.issued_at);
        const expires = new Date(env.expires_at);
        if (now < issued) return err('E_NOT_YET_VALID', `delegation not valid until ${env.issued_at}`);
        if (now >= expires) return err('E_EXPIRED', `delegation expired at ${env.expires_at}`);
    }

    // In private mode, return a hydrated envelope that includes the recovered
    // plaintext scopes so callers (verifyAction's chain walker, web-app
    // consumers) don't have to repeat the decryption.
    const returnedEnvelope: DelegationEnvelope =
        env.scopes_encrypted !== undefined
            ? { ...env, scopes: canonicalScopes }
            : env;

    return {
        ok: true,
        envelope: returnedEnvelope,
        canonicalMessage: reconstructedMessage,
        id: env.id,
        revocationsSkipped,
    };
}

/** `revocations` is absent or a list; its entries are checked one by one. */
function revocationsProblem(revocations: unknown): string | null {
    return revocations === undefined || revocations === null || Array.isArray(revocations)
        ? null
        : 'revocations must be a list';
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (SPEC §8.2–8.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyActionInput extends VerifyBase {
    action: ActionEnvelope;
    /** The ROOT delegation rooting the authority chain. Always required. */
    delegation: DelegationEnvelope;
    /**
     * Optional v1.1 sub-delegation chain from S_1 (immediate child of `delegation`)
     * to S_leaf (the envelope `action.delegation_id` cites). When provided, the
     * verifier walks each link checking parent-id linkage, principal-equals-
     * parent-agent, scope containment, and temporal containment. The action's
     * delegation_id MUST equal the leaf's id; the action's signer MUST equal
     * the leaf's agent. See SUB-DELEGATION.md §2.2.
     */
    subdelegationChain?: SubdelegationEnvelope[];
    /**
     * Maximum permitted chain depth (number of subdelegations).
     * Default `DEFAULT_MAX_CHAIN_DEPTH` (5). Verifiers MAY lower; MUST NOT raise
     * silently above their advertised cap. Chains exceeding this fail with
     * E_SUBDELEGATION_DEPTH_EXCEEDED before any per-link work is performed.
     */
    maxChainDepth?: number;
    content?: Uint8Array;
    /**
     * Verify an OTS proof commits `envelopeId` into the block at `blockHeight`.
     * Same shape as @orangecheck/stamp-core. An anchor is used for revocation
     * priority (SPEC §9.3) only when this returns true; without it every
     * anchor is treated as absent.
     */
    verifyOtsAnchor?: (
        proofB64: string,
        blockHeight: number,
        blockHash: string,
        envelopeId: string
    ) => Promise<boolean>;
    /** If action and revocation are both OTS-anchored, pass a function that returns the comparable block height of each via proof parsing. Defaults: use envelope.ots.block_height. The height is still checked by verifyOtsAnchor. */
    resolveAnchorBlockHeight?: (env: ActionEnvelope | RevocationEnvelope) => number | null;
    /**
     * v1.2 private-scope decryption key. Applied to the root delegation AND
     * every subdelegation in the chain that carries `scopes_encrypted`. If a
     * link is private-mode and no key matches its recipients, verification
     * fails E_SCOPES_UNREADABLE — the chain's transitive narrowing cannot be
     * checked without the plaintext.
     */
    decryptScopesWith?: {
        device_id: string;
        secretKey: Uint8Array;
    };
    /**
     * The time of verification; defaults to new Date(). Every link of the
     * chain must be in force at `now`, and a revocation in effect at or
     * before `now` refuses the action, whatever `signed_at` it claims
     * (SPEC §8.1 steps 6–7).
     */
    now?: Date;
    /**
     * How far `signed_at` may lie from `now`, either way, before the action
     * is refused with E_STALE. Default DEFAULT_MAX_SKEW_MS (120 s). The agent
     * chooses `signed_at`, so this bound is what makes it mean "just now".
     */
    maxSkewMs?: number;
}

/** An audit of a past action: no `now`, no freshness bound. See verifyActionAsOfSignedAt. */
export type VerifyActionAsOfSignedAtInput = Omit<VerifyActionInput, 'now' | 'maxSkewMs'>;

/**
 * Verify an action live, as of `now` (SPEC §8). This is the check for a
 * server deciding whether to act on it. Replay is the caller's to stop: keep
 * the ids of accepted actions (createReplayGuard) for as long as they could
 * pass the freshness bound.
 */
export async function verifyAction(input: VerifyActionInput): Promise<VerifyActionResult> {
    if (!isPlainObject(input)) return err('E_MALFORMED', 'verifyAction takes an options object');
    const badNow = nowProblem(input.now);
    if (badNow) return err('E_MALFORMED', badNow);
    return verifyActionAt(input, input.now ?? new Date());
}

/**
 * Verify a past action as of its own `signed_at`, for an audit (SPEC §8.6).
 * The agent chose that time, so the verdict holds only if the claim is true:
 * `asOf.anchored` is false unless a verified OTS anchor fixes it. Never use
 * this to decide whether to act on an action now.
 */
export async function verifyActionAsOfSignedAt(
    input: VerifyActionAsOfSignedAtInput
): Promise<VerifyActionResult> {
    if (!isPlainObject(input)) return err('E_MALFORMED', 'verifyActionAsOfSignedAt takes an options object');
    return verifyActionAt(input, null);
}

/** `now` null: the audit form, checked as of the action's own signed_at. */
async function verifyActionAt(
    input: VerifyActionInput,
    now: Date | null
): Promise<VerifyActionResult> {
    const a = input.action;
    const d = input.delegation;
    if (!isPlainObject(a)) return err('E_MALFORMED', 'the action must be an object');
    const listProblem = revocationsProblem(input.revocations);
    if (listProblem) return err('E_MALFORMED', listProblem);
    const chainInput: unknown = input.subdelegationChain ?? [];
    if (!Array.isArray(chainInput)) return err('E_MALFORMED', 'subdelegationChain must be a list');
    if (!chainInput.every(isPlainObject)) {
        return err('E_MALFORMED', 'every subdelegationChain entry must be an object');
    }
    if (input.content !== undefined && !(input.content instanceof Uint8Array)) {
        return err('E_MALFORMED', 'content must be a Uint8Array');
    }

    // 0. Chain-depth check (SUB-DELEGATION.md §2.1) — before any per-link work.
    const chain = chainInput as unknown as SubdelegationEnvelope[];
    const maxDepth = input.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
    if (chain.length > maxDepth) {
        return err(
            'E_SUBDELEGATION_DEPTH_EXCEEDED',
            `chain depth ${chain.length} exceeds maximum ${maxDepth}`
        );
    }

    // 1. First verify the root delegation. verifyDelegation handles v1.2
    //    private-scope hydration internally — when the root is private-mode,
    //    the returned envelope already has `scopes` populated from the
    //    decrypted plaintext.
    const dr = await verifyDelegation({
        envelope: d,
        verifyBip322: input.verifyBip322,
        skipSignatureVerification: input.skipSignatureVerification,
        scopeMode: input.scopeMode,
        skipTemporalCheck: true, // action window check dominates
        // Revocation is evaluated ONCE, below, across every link in the chain
        // (root + subdelegations) against the action's effective time — a
        // per-link check here would use the wrong clock and would also
        // double-report. Forward the caller's decision so this inner call does
        // not trip the fail-closed guard.
        skipRevocationCheck: true,
        ...(input.decryptScopesWith ? { decryptScopesWith: input.decryptScopesWith } : {}),
    });
    if (!dr.ok) return dr;
    const rootHydrated: DelegationEnvelope = dr.envelope;

    // 1b. Walk the sub-delegation chain (SUB-DELEGATION.md §2.2 step 3).
    //     Each link may independently be private-mode; we hydrate it before
    //     handing it to verifyChainLink so the chain walker sees plaintext
    //     scopes uniformly.
    let parent: ChainLink = rootHydrated;
    const hydratedChain: SubdelegationEnvelope[] = [];
    for (const sub of chain) {
        const hydrated = await hydrateSubdelegationScopes(sub, input);
        if (!hydrated.ok) return hydrated;
        const r = await verifyChainLink(hydrated.envelope, parent, input);
        if (!r.ok) return r;
        hydratedChain.push(hydrated.envelope);
        parent = hydrated.envelope;
    }
    /** The envelope `action.delegation_id` should cite (root if no chain, leaf otherwise). */
    const leaf: ChainLink =
        hydratedChain.length > 0 ? hydratedChain[hydratedChain.length - 1]! : rootHydrated;

    // 2. Core action checks.
    if (a.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `action version ${shown(a.v)} not supported`);
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
        const ok = await signatureVerifies(input.verifyBip322, a.id, a.sig.value, a.signer.address);
        if (!ok) return err('E_BAD_ACTION_STAMP', 'action BIP-322 signature did not verify');
    }

    // 3. Authority chain — leaf-binding (action cites the leaf of the chain,
    //    which is the root delegation when no subdelegation chain is present).
    if (a.delegation_id !== leaf.id) {
        return err('E_DELEGATION_MISMATCH', `action.delegation_id (${a.delegation_id}) != leaf.id (${leaf.id})`);
    }
    if (a.signer.address !== leaf.agent.address) {
        return err('E_AGENT_MISMATCH', `action signer (${a.signer.address}) != leaf.agent (${leaf.agent.address})`);
    }

    // 4. Window — against the leaf.
    const issued = new Date(leaf.issued_at).getTime();
    const expires = new Date(leaf.expires_at).getTime();
    const signed = new Date(a.signed_at).getTime();
    if (Number.isNaN(issued) || Number.isNaN(expires) || Number.isNaN(signed)) {
        return err('E_MALFORMED', 'unparseable ISO 8601 timestamp');
    }
    if (signed < issued || signed >= expires) {
        return err('E_OUT_OF_WINDOW', `action.signed_at ${a.signed_at} is outside leaf window [${leaf.issued_at}, ${leaf.expires_at})`);
    }

    // 4b. Live: every link is in force now, not only at the claimed signed_at.
    if (now) {
        const t = now.getTime();
        for (const link of [rootHydrated, ...hydratedChain]) {
            if (t < new Date(link.issued_at).getTime()) {
                return err('E_NOT_YET_VALID', `${link.id} is not valid until ${link.issued_at}`);
            }
            if (t >= new Date(link.expires_at).getTime()) {
                return err('E_EXPIRED', `${link.id} expired at ${link.expires_at}`);
            }
        }
    }

    // 5. Scope containment — against the leaf's granted set.
    //    Leaf is post-hydration, so `scopes` is guaranteed populated. The
    //    runtime guard satisfies the type checker and would only fire if a
    //    caller bypassed the hydration path.
    if (!leaf.scopes) {
        return err('E_SCOPES_NEITHER_PROVIDED', 'leaf has no plaintext scopes after hydration');
    }
    let exercised, accepted;
    try {
        exercised = canonicalizeScope(parseScope(a.scope_exercised));
        const granted = leaf.scopes.map((s) => parseScope(s));
        const exercisedParsed = parseScope(a.scope_exercised);
        validateScope(exercisedParsed, { mode: input.scopeMode ?? 'strict' });
        accepted = granted.some((g) => isSubScope(exercisedParsed, g));
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }
    if (!accepted) return err('E_SCOPE_DENIED', `scope_exercised (${exercised}) not a sub-scope of any granted scope`);

    // 6. Revocation check — applies per-link to ALL envelopes in the chain
    //    (root + every subdelegation). Per SUB-DELEGATION.md §2.2 step 5, a
    //    revocation against ANY link invalidates the action.
    if (!input.skipRevocationCheck && !input.revocations) {
        return err(
            'E_MALFORMED',
            'verifyAction requires `revocations` (query kind 30085 with "#t": [id of every link ' +
                'in the chain], SPEC §9.4) or an explicit skipRevocationCheck:true',
        );
    }
    // Anchor heights only count once the proof is verified against the
    // envelope's own id; `ots` is outside the signature.
    let actionAnchor: number | null;
    try {
        actionAnchor = await verifiedAnchorHeight(a, a.id, input);
    } catch (e) {
        return err('E_MALFORMED', `anchor verifier threw: ${(e as Error).message}`);
    }
    // A revocation that is not an object, or cites a link and fails its own
    // check, affects nothing; it is skipped and counted.
    const revocations = (input.revocations ?? []).filter(isPlainObject) as RevocationEnvelope[];
    let revocationsSkipped = (input.revocations ?? []).length - revocations.length;
    if (revocations.length > 0) {
        const allLinks: ChainLink[] = [rootHydrated, ...hydratedChain];
        for (const link of allLinks) {
            for (const rev of revocations) {
                if (rev.delegation_id !== link.id) continue;
                // Verify the revocation itself (signature + canonical + signer
                // authorization). verifyRevocation accepts ChainLink, so the
                // call shape is identical for root vs sub.
                const rr = await verifyRevocation({
                    envelope: rev,
                    delegation: link,
                    verifyBip322: input.verifyBip322,
                    skipSignatureVerification: input.skipSignatureVerification,
                });
                if (!rr.ok) {
                    revocationsSkipped++;
                    continue;
                }
                let revAnchor: number | null;
                try {
                    revAnchor = await verifiedAnchorHeight(rev, rr.id, input);
                } catch (e) {
                    return err('E_MALFORMED', `anchor verifier threw: ${(e as Error).message}`);
                }
                if (revocationPrecedes(rev, revAnchor, a, actionAnchor)) {
                    return err('E_REVOKED', `chain link ${link.id} was revoked by ${rr.id} before action was signed`);
                }
                // Live: a revocation already in effect refuses the action, however
                // early its signed_at claims to be.
                if (now && (revAnchor !== null || new Date(rev.signed_at).getTime() <= now.getTime())) {
                    return err('E_REVOKED', `chain link ${link.id} was revoked by ${rr.id}`);
                }
            }
        }
    }

    // 6b. Live: signed_at is the agent's claim; only a bound on it makes the
    //     action recent.
    if (now) {
        const maxSkew = input.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
        if (Math.abs(now.getTime() - signed) > maxSkew) {
            return err(
                'E_STALE',
                `action.signed_at ${a.signed_at} is more than ${maxSkew} ms from the time of verification ${now.toISOString()}`
            );
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
        anchor = (
            actionAnchor !== null
                ? { status: 'confirmed', blockHeight: h, blockHash: hash, verified: true }
                : { status: 'claimed', blockHeight: h, blockHash: hash, verified: false }
        ) as typeof anchor;
    }

    return {
        ok: true,
        envelope: a,
        canonicalMessage: reconstructedMessage,
        id: a.id,
        delegation: rootHydrated,
        chain: hydratedChain,
        scopeExercised: exercised,
        anchor,
        asOf: now
            ? { basis: 'now', now: now.toISOString() }
            : { basis: 'signed_at', signedAt: a.signed_at, anchored: actionAnchor !== null },
        revocationsSkipped,
    };
}

/**
 * Remembers the ids of accepted actions, so one signed action is acted on
 * once. An action passes the freshness bound for `maxSkewMs` either side of
 * its signed_at, so its id is kept until signed_at + maxSkewMs. In-memory and
 * per process: a server on several instances keeps the same record in a
 * shared store. Two identical calls signed in the same second share an id.
 */
export function createReplayGuard(maxSkewMs: number = DEFAULT_MAX_SKEW_MS): {
    firstUse(action: Pick<ActionEnvelope, 'id' | 'signed_at'>, now?: Date): boolean;
} {
    const keepUntil = new Map<string, number>();
    return {
        firstUse(action, now = new Date()) {
            // Without a text id there is nothing to remember it by, so it is never a first use.
            if (!isPlainObject(action) || !isText(action.id) || nowProblem(now)) return false;
            const t = now.getTime();
            for (const [id, until] of keepUntil) if (until <= t) keepUntil.delete(id);
            if (keepUntil.has(action.id)) return false;
            const signed = isIsoUtc(action.signed_at) ? Date.parse(action.signed_at) : t;
            keepUntil.set(action.id, signed + maxSkewMs);
            return true;
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// v1.2 chain-link hydration — decrypt scopes_encrypted on subdelegations
// before passing them to the chain walker so all containment checks operate
// on plaintext.
// ─────────────────────────────────────────────────────────────────────────────

async function hydrateSubdelegationScopes(
    sub: SubdelegationEnvelope,
    input: VerifyBase & {
        decryptScopesWith?: { device_id: string; secretKey: Uint8Array };
    }
): Promise<{ ok: true; envelope: SubdelegationEnvelope } | VerifyErrResult> {
    if (sub.scopes !== undefined && sub.scopes_encrypted !== undefined) {
        return err(
            'E_SCOPES_BOTH_PROVIDED',
            'subdelegation carries both scopes and scopes_encrypted'
        );
    }
    if (sub.scopes === undefined && sub.scopes_encrypted === undefined) {
        return err(
            'E_SCOPES_NEITHER_PROVIDED',
            'subdelegation carries neither scopes nor scopes_encrypted'
        );
    }
    if (sub.scopes_encrypted === undefined) {
        return { ok: true, envelope: sub };
    }
    if (!isPlainObject(sub.scopes_encrypted) || !isPlainObject(sub.principal)) {
        return err('E_MALFORMED', 'subdelegation scopes_encrypted and principal must be objects');
    }
    if (sub.scopes_encrypted.from?.address !== sub.principal.address) {
        return err(
            'E_MALFORMED',
            `subdelegation.scopes_encrypted.from.address (${shown(sub.scopes_encrypted.from?.address)}) does not match principal.address (${shown(sub.principal.address)})`
        );
    }
    if (!input.decryptScopesWith) {
        return err(
            'E_SCOPES_UNREADABLE',
            'subdelegation carries scopes_encrypted; no decryption key provided for the chain'
        );
    }
    try {
        const r = await unsealScopes({
            envelope: sub.scopes_encrypted,
            device: input.decryptScopesWith,
            ...(input.verifyBip322 ? { verifyBip322: input.verifyBip322 } : {}),
            skipSenderVerification: !!input.skipSignatureVerification,
        });
        return { ok: true, envelope: { ...sub, scopes: r.scopes } };
    } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (/no matching recipient|no recipient|device_id/i.test(msg)) {
            return err('E_SCOPES_UNREADABLE', msg);
        }
        return err('E_BAD_LOCK_ENVELOPE', msg);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Revocation (SPEC §9, §8 transitive)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyRevocationInput extends VerifyBase {
    envelope: RevocationEnvelope;
    /**
     * The envelope targeted by the revocation. Required to check signer is
     * authorized. May be a v1.0 root delegation OR a v1.1 sub-delegation —
     * both have identical `principal`, `agent`, `id`, and `revocation.holders`
     * field shapes per SUB-DELEGATION.md §3.
     */
    delegation: ChainLink;
}

export async function verifyRevocation(input: VerifyRevocationInput): Promise<VerifyRevocationResult> {
    if (!isPlainObject(input)) return err('E_MALFORMED', 'verifyRevocation takes an options object');
    const env = input.envelope;
    const d = input.delegation;
    if (!isPlainObject(env)) return err('E_MALFORMED', 'the revocation must be an object');

    // Only the signed bytes decide: `v`, `sig.pubkey` and the reason's content
    // are not read (SPEC §9.1), so no copy defect keeps a revoked delegation alive.
    const shape = checkRevocationShape(env);
    if (shape) return shape;
    const target = checkChainLinkShape(d, 'the revoked delegation');
    if (target) return target;

    if (env.delegation_id !== d.id) {
        return err('E_DELEGATION_MISMATCH', `revocation.delegation_id (${env.delegation_id}) != delegation.id (${d.id})`);
    }

    // The principal and the agent may always revoke (SPEC §9.5). Revoking only
    // removes authority, and `revocation.holders` is outside the delegation's
    // signature, so no copy of it decides who may.
    if (env.signer.address !== d.principal.address && env.signer.address !== d.agent.address) {
        return err(
            'E_REVOKER_UNAUTHORIZED',
            `revocation signer ${env.signer.address} is neither the principal nor the agent`
        );
    }

    const canonInput = {
        address: env.signer.address,
        delegation_id: env.delegation_id,
        reason: env.reason ?? '',
        signed_at: env.signed_at,
    };
    const reconstructedMessage = revocationCanonicalMessage(canonInput);
    // The signature is over the id of the signed fields; the envelope's `id` and
    // `kind` are copies, noted when they differ and never read to decide.
    const reconstructedId = hexEncode(sha256(revocationCanonicalBytes(canonInput)));

    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return err('E_BAD_SIG', 'no BIP-322 verifier supplied');
        const ok = await signatureVerifies(input.verifyBip322, reconstructedId, env.sig.value, env.signer.address);
        if (!ok) return err('E_BAD_SIG', 'revocation BIP-322 signature did not verify');
    }

    return {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructedMessage,
        id: reconstructedId,
        flags: revocationFlags(env, reconstructedId),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape checks
// ─────────────────────────────────────────────────────────────────────────────

function checkDelegationShape(env: DelegationEnvelope): VerifyDelegationResult | null {
    if (env.kind !== 'agent-delegation') return err('E_MALFORMED', 'kind must be "agent-delegation"');
    if (!isHex64(env.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!isText(env.principal?.address) || env.principal.alg !== 'bip322') return err('E_MALFORMED', 'principal invalid');
    if (!isText(env.agent?.address) || env.agent.alg !== 'bip322') return err('E_MALFORMED', 'agent invalid');
    // v1.2: scopes OR scopes_encrypted (exactly one). Mutual exclusion +
    // presence checks are performed by the verify-time PRE-VERIFICATION block
    // (PRIVATE-SCOPE.md §2 steps P1–P2) so they can return their own error
    // codes (E_SCOPES_BOTH_PROVIDED / E_SCOPES_NEITHER_PROVIDED) rather than
    // collapsing into E_MALFORMED.
    if (env.scopes !== undefined) {
        if (!Array.isArray(env.scopes) || env.scopes.length === 0)
            return err('E_MALFORMED', 'scopes must be non-empty array');
    }
    if (env.scopes_encrypted !== undefined && !isPlainObject(env.scopes_encrypted))
        return err('E_MALFORMED', 'scopes_encrypted must be an object');
    if (env.bond !== null) {
        if (!isPlainObject(env.bond)) return err('E_MALFORMED', 'bond must be an object or null');
        if (!Number.isInteger(env.bond.sats) || env.bond.sats < 0) return err('E_MALFORMED', 'bond.sats must be non-negative integer');
        if (!isHex64(env.bond.attestation_id)) return err('E_MALFORMED', 'bond.attestation_id must be 64-hex');
    }
    if (!isIsoUtc(env.issued_at)) return err('E_MALFORMED', 'issued_at must be ISO 8601 UTC');
    if (!isIsoUtc(env.expires_at)) return err('E_MALFORMED', 'expires_at must be ISO 8601 UTC');
    const windowError = delegationWindowError(env.issued_at, env.expires_at);
    if (windowError) return err('E_MALFORMED', windowError);
    if (!isNonce(env.nonce)) return err('E_MALFORMED', 'nonce must be 32 lowercase hex chars');
    if (env.sig?.alg !== 'bip322' || typeof env.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (env.sig.pubkey !== env.principal.address) return err('E_MALFORMED', 'sig.pubkey must equal principal.address');
    return null;
}

function isNonce(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
}

/**
 * A delegation or sub-delegation handed in beside the envelope being checked
 * (a parent, a revoked delegation): it must have its kind's shape before any
 * of it is read, and the scopes a chain walk reads must be text.
 */
function checkChainLinkShape(link: unknown, what: string): VerifyErrResult | null {
    if (!isPlainObject(link)) return err('E_MALFORMED', `${what} must be an object`);
    const shape =
        link.kind === 'agent-delegation'
            ? checkDelegationShape(link as unknown as DelegationEnvelope)
            : link.kind === 'agent-subdelegation'
              ? checkSubdelegationShape(link as unknown as SubdelegationEnvelope)
              : err('E_MALFORMED', `${what} must be a delegation or a sub-delegation`);
    if (shape && !shape.ok) return err(shape.code, `${what}: ${shape.message}`);
    if (link.scopes !== undefined && !(link.scopes as unknown[]).every(isText)) {
        return err('E_MALFORMED', `${what}: every scope must be text`);
    }
    return null;
}

const MAX_DELEGATION_MS = 365 * 86_400_000;

/** SPEC §4.4 window, checked at §8.1 step 2 whatever the clock says: issued < expires, at most 365 days. */
export function delegationWindowError(issuedAt: string, expiresAt: string): string | null {
    const issued = Date.parse(issuedAt);
    const expires = Date.parse(expiresAt);
    if (Number.isNaN(issued) || Number.isNaN(expires)) return 'issued_at / expires_at must be real UTC times';
    if (expires <= issued) return 'expires_at must be after issued_at';
    if (expires - issued > MAX_DELEGATION_MS) return 'expires_at is more than 365 days after issued_at (SPEC §4.4)';
    return null;
}

function checkActionShape(a: ActionEnvelope): VerifyActionResult | null {
    if (a.kind !== 'agent-action') return err('E_MALFORMED', 'kind must be "agent-action"');
    if (!isHex64(a.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!a.content || typeof a.content.hash !== 'string' || !a.content.hash.startsWith('sha256:')) {
        return err('E_MALFORMED', 'content.hash must start with "sha256:"');
    }
    if (!Number.isInteger(a.content.length) || a.content.length < 0) return err('E_MALFORMED', 'content.length invalid');
    if (typeof a.content.mime !== 'string') return err('E_MALFORMED', 'content.mime must be text');
    if (!a.signer?.address || a.signer.alg !== 'bip322') return err('E_MALFORMED', 'signer invalid');
    if (!isIsoUtc(a.signed_at)) return err('E_MALFORMED', 'signed_at must be ISO 8601 UTC');
    if (!isHex64(a.delegation_id)) return err('E_MALFORMED', 'delegation_id must be 64-hex');
    if (typeof a.scope_exercised !== 'string' || a.scope_exercised.length === 0) return err('E_MALFORMED', 'scope_exercised required');
    if (a.sig?.alg !== 'bip322' || typeof a.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (a.sig.pubkey !== a.signer.address) return err('E_MALFORMED', 'sig.pubkey must equal signer.address');
    // ots sits outside the action id, so a copy can carry any; it is read only in this shape.
    const ots: unknown = a.ots;
    if (ots !== null) {
        if (!isPlainObject(ots)) return err('E_MALFORMED', 'ots must be null or an object');
        if (ots.status !== 'pending' && ots.status !== 'confirmed') {
            return err('E_MALFORMED', 'ots.status must be "pending" or "confirmed"');
        }
        if (typeof ots.proof !== 'string') return err('E_MALFORMED', 'ots.proof must be text');
        if (ots.block_height !== null && !Number.isInteger(ots.block_height)) {
            return err('E_MALFORMED', 'ots.block_height must be an integer or null');
        }
        if (ots.block_hash !== null && typeof ots.block_hash !== 'string') {
            return err('E_MALFORMED', 'ots.block_hash must be text or null');
        }
    }
    return null;
}

function checkRevocationShape(env: RevocationEnvelope): VerifyRevocationResult | null {
    if (!isHex64(env.delegation_id)) return err('E_MALFORMED', 'delegation_id must be 64-hex');
    if (!isText(env.signer?.address)) return err('E_MALFORMED', 'signer.address must be text');
    // "" when omitted or null; any text otherwise, whatever it holds (SPEC §9.1).
    if (env.reason != null && typeof env.reason !== 'string') return err('E_MALFORMED', 'reason must be text');
    if (!isIsoUtc(env.signed_at)) return err('E_MALFORMED', 'signed_at must be ISO 8601 UTC');
    if (typeof env.sig?.value !== 'string') return err('E_MALFORMED', 'sig.value must be text');
    return null;
}

function checkSubdelegationShape(env: SubdelegationEnvelope): VerifySubdelegationResult | null {
    if (env.kind !== 'agent-subdelegation') return err('E_MALFORMED', 'kind must be "agent-subdelegation"');
    if (!isHex64(env.id)) return err('E_MALFORMED', 'id must be 64 lowercase hex chars');
    if (!isHex64(env.parent_id)) return err('E_MALFORMED', 'parent_id must be 64-hex');
    if (!isText(env.principal?.address) || env.principal.alg !== 'bip322') return err('E_MALFORMED', 'principal invalid');
    if (!isText(env.agent?.address) || env.agent.alg !== 'bip322') return err('E_MALFORMED', 'agent invalid');
    // v1.2: scopes OR scopes_encrypted (post-hydration the chain walker
    // always sees `scopes` populated). Mutual exclusion + presence checked
    // by hydrateSubdelegationScopes.
    if (env.scopes !== undefined) {
        if (!Array.isArray(env.scopes) || env.scopes.length === 0)
            return err('E_MALFORMED', 'scopes must be non-empty array');
    }
    if (env.scopes_encrypted !== undefined && !isPlainObject(env.scopes_encrypted))
        return err('E_MALFORMED', 'scopes_encrypted must be an object');
    // Sub-delegations MUST NOT carry a bond field (SUB-DELEGATION.md §1.3).
    if ('bond' in env && (env as { bond?: unknown }).bond !== undefined) {
        return err('E_MALFORMED', 'sub-delegation envelopes MUST NOT carry a bond field');
    }
    if (!isIsoUtc(env.issued_at)) return err('E_MALFORMED', 'issued_at must be ISO 8601 UTC');
    if (!isIsoUtc(env.expires_at)) return err('E_MALFORMED', 'expires_at must be ISO 8601 UTC');
    if (!isNonce(env.nonce)) return err('E_MALFORMED', 'nonce must be 32 lowercase hex chars');
    if (env.sig?.alg !== 'bip322' || typeof env.sig.value !== 'string') return err('E_MALFORMED', 'sig invalid');
    if (env.sig.pubkey !== env.principal.address) return err('E_MALFORMED', 'sig.pubkey must equal principal.address');
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-delegation chain link (SUB-DELEGATION.md §2.2 step 3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a single sub-delegation envelope as a chain link from `parent`.
 * Performs steps 3a–3g in order; returns the corresponding VerifyErr on
 * failure or `{ ok: true, envelope: s }` on success.
 *
 * Skips the standalone temporal-validity check (SUB-DELEGATION.md §2.2 step
 * 3d) — for action verification, the action-window check (step 4c) on the
 * leaf is the binding temporal constraint. Callers that want a current-time
 * "is this subdelegation active right now" check can use `verifySubdelegation`.
 */
async function verifyChainLink(
    s: SubdelegationEnvelope,
    parent: ChainLink,
    input: VerifyBase
): Promise<VerifySubdelegationResult> {
    if (s.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `subdelegation version ${shown(s.v)} not supported`);
    }
    const shape = checkSubdelegationShape(s);
    if (shape) return shape;

    // verifyChainLink expects post-hydration scopes (callers run
    // hydrateSubdelegationScopes upfront). The runtime guard makes the
    // type-checker happy and protects against bypass.
    if (!s.scopes) {
        return err(
            'E_SCOPES_NEITHER_PROVIDED',
            'subdelegation has no plaintext scopes — caller must hydrate v1.2 envelopes before invoking verifyChainLink'
        );
    }

    // Step 3a: canonical id.
    let canonicalScopesList: string[];
    try {
        canonicalScopesList = canonicalizeScopes(s.scopes);
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }
    const canonInput = {
        parent_id: s.parent_id,
        principal: s.principal.address,
        agent: s.agent.address,
        scopes: canonicalScopesList,
        issued_at: s.issued_at,
        expires_at: s.expires_at,
        nonce: s.nonce,
    };
    const reconstructedId = computeSubdelegationId(canonInput);
    if (reconstructedId !== s.id) {
        return err('E_BAD_ID', `reconstructed subdelegation id (${reconstructedId}) does not match envelope id (${s.id})`);
    }

    // Step 3b: scope grammar validation (registry-aware).
    let parsedScopes;
    try {
        parsedScopes = s.scopes.map((str) => parseScope(str));
        for (const p of parsedScopes) validateScope(p, { mode: input.scopeMode ?? 'strict' });
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', msg);
    }

    // Step 3c: BIP-322 signature.
    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) return err('E_BAD_SIG', 'no BIP-322 verifier supplied for subdelegation');
        const ok = await signatureVerifies(input.verifyBip322, s.id, s.sig.value, s.principal.address);
        if (!ok) return err('E_BAD_SIG', 'subdelegation BIP-322 signature did not verify');
    }

    // Step 3e: linkage.
    if (s.parent_id !== parent.id) {
        return err(
            'E_SUBDELEGATION_PRINCIPAL_MISMATCH',
            `subdelegation.parent_id (${s.parent_id}) does not match parent envelope id (${parent.id})`
        );
    }
    if (s.principal.address !== parent.agent.address) {
        return err(
            'E_SUBDELEGATION_PRINCIPAL_MISMATCH',
            `subdelegation.principal (${s.principal.address}) does not match parent.agent (${parent.agent.address})`
        );
    }

    // Step 3f: temporal containment.
    const sIssued = new Date(s.issued_at).getTime();
    const sExpires = new Date(s.expires_at).getTime();
    const pIssued = new Date(parent.issued_at).getTime();
    const pExpires = new Date(parent.expires_at).getTime();
    if (Number.isNaN(sIssued) || Number.isNaN(sExpires) || Number.isNaN(pIssued) || Number.isNaN(pExpires)) {
        return err('E_MALFORMED', 'unparseable ISO 8601 timestamp in chain');
    }
    if (sExpires <= sIssued) {
        return err('E_MALFORMED', 'subdelegation expires_at must be > issued_at');
    }
    if (sIssued < pIssued || sExpires > pExpires) {
        return err(
            'E_SUBDELEGATION_EXPIRES_EXTENDED',
            `subdelegation window [${s.issued_at}, ${s.expires_at}) is not contained in parent's [${parent.issued_at}, ${parent.expires_at})`
        );
    }

    // Step 3g: scope containment (transitive narrowing).
    if (!parent.scopes) {
        return err(
            'E_SCOPES_NEITHER_PROVIDED',
            'parent has no plaintext scopes — caller must hydrate v1.2 parents before invoking verifyChainLink'
        );
    }
    let parentScopesParsed;
    try {
        parentScopesParsed = parent.scopes.map((str) => parseScope(str));
    } catch (e) {
        const msg = e instanceof ScopeParseError ? e.message : (e as Error).message;
        return err('E_BAD_SCOPE_GRAMMAR', `parent scope: ${msg}`);
    }
    for (let i = 0; i < parsedScopes.length; i++) {
        const childScope = parsedScopes[i]!;
        const containedBySomeParentScope = parentScopesParsed.some((p) => isSubScope(childScope, p));
        if (!containedBySomeParentScope) {
            return err(
                'E_SUBDELEGATION_SCOPE_ESCALATED',
                `subdelegation scope ${canonicalizeScope(childScope)} is not a sub-scope of any granted scope on the parent`
            );
        }
    }

    return {
        ok: true,
        envelope: s,
        canonicalMessage: '', // not populated for chain links; computeSubdelegationId is the binding form
        id: s.id,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone subdelegation verification (no action context)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifySubdelegationInput extends VerifyBase {
    envelope: SubdelegationEnvelope;
    /**
     * The immediate parent envelope. Required for linkage / containment checks.
     * If the parent is itself v1.2 private-mode (`scopes_encrypted`) the caller
     * MUST pre-hydrate it (e.g., via verifyDelegation's returned envelope) —
     * the chain walker reads `parent.scopes` directly.
     */
    parent: ChainLink;
    /** Skip the "now ∈ [issued, expires)" check. Useful for inspection. */
    skipTemporalCheck?: boolean;
    /** Defaults to new Date(). */
    now?: Date;
    /**
     * v1.2 private-scope decryption key for the subdelegation envelope itself.
     * Not used for the parent — the caller hydrates the parent.
     */
    decryptScopesWith?: {
        device_id: string;
        secretKey: Uint8Array;
    };
}

/**
 * Verify a single sub-delegation envelope against its immediate parent.
 * Includes the standalone temporal-validity check (`now ∈ [issued, expires)`)
 * unless `skipTemporalCheck` is set. Useful for pre-flighting a chain link
 * outside of action verification.
 */
export async function verifySubdelegation(
    input: VerifySubdelegationInput
): Promise<VerifySubdelegationResult> {
    if (!isPlainObject(input)) return err('E_MALFORMED', 'verifySubdelegation takes an options object');
    if (!isPlainObject(input.envelope)) return err('E_MALFORMED', 'the sub-delegation must be an object');
    const parentShape = checkChainLinkShape(input.parent, 'the parent');
    if (parentShape) return parentShape;
    const badNow = nowProblem(input.now);
    if (badNow) return err('E_MALFORMED', badNow);
    // v1.2: hydrate private-mode envelopes before chain-link checks so
    // the walker uniformly reads plaintext scopes.
    const hydrated = await hydrateSubdelegationScopes(input.envelope, input);
    if (!hydrated.ok) return hydrated;
    const r = await verifyChainLink(hydrated.envelope, input.parent, input);
    if (!r.ok) return r;

    if (!input.skipTemporalCheck) {
        const now = (input.now ?? new Date()).getTime();
        const issued = new Date(input.envelope.issued_at).getTime();
        const expires = new Date(input.envelope.expires_at).getTime();
        if (now < issued) return err('E_NOT_YET_VALID', `subdelegation issued_at ${input.envelope.issued_at} is in the future`);
        if (now >= expires) return err('E_EXPIRED', `subdelegation expires_at ${input.envelope.expires_at} is past`);
    }

    return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// Time comparison for revocation vs action (SPEC §9.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The block height of an envelope's OTS anchor, or null unless the proof has
 * been verified to commit `id`, the id of its signed fields, at that height.
 */
async function verifiedAnchorHeight(
    env: ActionEnvelope | RevocationEnvelope,
    id: string,
    input: Pick<VerifyActionInput, 'verifyOtsAnchor' | 'resolveAnchorBlockHeight'>
): Promise<number | null> {
    if (env.ots?.status !== 'confirmed' || !input.verifyOtsAnchor) return null;
    const h = input.resolveAnchorBlockHeight ? input.resolveAnchorBlockHeight(env) : env.ots.block_height;
    const hash = env.ots.block_hash;
    if (h === null || h === undefined || !Number.isInteger(h) || !hash) return null;
    return (await input.verifyOtsAnchor(env.ots.proof, h, hash, id)) ? h : null;
}

/**
 * True when the revocation takes effect at or before the action (SPEC §9.3).
 * Only verified anchors count for priority. An action without one cannot prove
 * priority over a revocation that claims an anchor; an anchored action against
 * an unanchored revocation falls back to the signed times.
 */
function revocationPrecedes(
    rev: RevocationEnvelope,
    revAnchor: number | null,
    action: ActionEnvelope,
    actionAnchor: number | null
): boolean {
    if (revAnchor !== null && actionAnchor !== null) return revAnchor <= actionAnchor;
    if (actionAnchor === null && rev.ots?.status === 'confirmed') return true;
    return new Date(rev.signed_at).getTime() <= new Date(action.signed_at).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────

function err(code: AgentErrorCode, message: string): VerifyErrResult {
    return { ok: false, code, message };
}

type VerifyErrResult = { ok: false; code: AgentErrorCode; message: string };

