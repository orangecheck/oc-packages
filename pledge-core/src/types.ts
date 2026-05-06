// Wire types for OC Pledge v0.1 envelopes. SPEC.md §3, §4, §5.

export const ENVELOPE_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Resolution mechanism — the closed set of seven, plus refusal of self_proof.
// SPEC §3.4.
// ─────────────────────────────────────────────────────────────────────────────

export type ResolutionMechanism =
    | 'chain_state'
    | 'counterparty_signs'
    | 'nostr_event_exists'
    | 'stamp_published'
    | 'http_get_hash'
    | 'dns_record'
    | 'vote_resolves';

export const RESOLUTION_MECHANISMS: readonly ResolutionMechanism[] = Object.freeze([
    'chain_state',
    'counterparty_signs',
    'nostr_event_exists',
    'stamp_published',
    'http_get_hash',
    'dns_record',
    'vote_resolves',
]);

export type DisputeMechanism = 'vote_resolves' | 'named_oracle';

// ─────────────────────────────────────────────────────────────────────────────
// Pledge envelope (SPEC §3.3)
// ─────────────────────────────────────────────────────────────────────────────

export interface PledgeResolution {
    mechanism: ResolutionMechanism;
    /** Single-line query string in the named mechanism's grammar (≤ 1024 UTF-8 bytes). */
    query: string;
}

/** `resolves_at` is exactly one of `time` or `block`. SPEC §3.1. */
export type PledgeResolvesAt = { time: string } | { block: number };

export interface PledgeBond {
    /** SHA-256 hex of an OrangeCheck attestation canonical message. */
    attestation_id: string;
    /** Non-negative integer. */
    min_sats: number;
    /** Non-negative integer. */
    min_days: number;
}

export interface PledgeDispute {
    mechanism: DisputeMechanism | null;
    /** Single-line params string in the named dispute mechanism's grammar, or null. */
    params: string | null;
}

export interface PledgeSwearer {
    address: string;
    alg: 'bip322';
}

export interface PledgeSignature {
    alg: 'bip322';
    /**
     * MUST equal swearer.address when via_delegation is absent;
     * MUST equal agent_address when via_delegation is present.
     */
    pubkey: string;
    /** base64 BIP-322 signature over the lowercase-hex pledge id. */
    value: string;
}

export interface PledgeEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'pledge';
    /** 64-hex of sha256(canonical_message). */
    id: string;

    swearer: PledgeSwearer;
    proposition: string;
    resolution: PledgeResolution;
    resolves_at: PledgeResolvesAt;
    expires_at: string;
    bond: PledgeBond;
    counterparty: string | null;
    dispute: PledgeDispute;
    /** Fixed at "breach_recorded" in v0.1. */
    remediation: 'breach_recorded';
    sworn_at: string;
    /** 32 lowercase hex chars (16 random bytes). MUST be non-empty. */
    nonce: string;

    /** Optional — present iff the pledge was signed by an agent under OC Agent delegation. */
    via_delegation?: string;
    /** Optional — Bitcoin address of the agent. Required iff via_delegation is present. */
    agent_address?: string;

    sig: PledgeSignature;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome envelope (SPEC §4.2)
// ─────────────────────────────────────────────────────────────────────────────

export type OutcomeKind = 'kept' | 'broken' | 'expired_unresolved' | 'disputed';

export interface OutcomeEvidence {
    /** Same mechanism string as the referenced pledge's resolution.mechanism. */
    mechanism: ResolutionMechanism;
    /** Single-line canonical result string. */
    result: string;
    /** Single-line canonical witness string (mechanism-specific shape — see SPEC §4.1). */
    witness: string;
}

export interface OutcomeSignature {
    alg: 'bip322';
    /** Equals the resolved_by address. */
    pubkey: string;
    /** base64 BIP-322 over the lowercase-hex outcome id. */
    value: string;
}

export interface OutcomeEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'pledge-outcome';
    /** 64-hex of sha256(canonical_message). */
    id: string;

    pledge_id: string;
    outcome: OutcomeKind;
    resolved_at: string;
    /**
     * Either a Bitcoin address (when the resolver is a real party — i.e.
     * counterparty_signs) or the literal string "deterministic" for any of
     * the deterministic mechanisms.
     */
    resolved_by: string;

    evidence: OutcomeEvidence;
    dispute_window_ends_at: string;

    /**
     * null for deterministic mechanisms (resolved_by === "deterministic");
     * required for counterparty_signs (resolved_by === counterparty.address).
     */
    sig: OutcomeSignature | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandonment envelope (SPEC §5.2)
// ─────────────────────────────────────────────────────────────────────────────

export interface AbandonmentSignature {
    alg: 'bip322';
    /** MUST equal the original pledge's swearer.address. Agents MUST NOT sign abandonments in v0.1. */
    pubkey: string;
    /** base64 BIP-322 over the lowercase-hex abandonment id. */
    value: string;
}

export interface AbandonmentEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'pledge-abandonment';
    /** 64-hex of sha256(canonical_message). */
    id: string;

    pledge_id: string;
    abandoned_at: string;
    /** Single-line UTF-8 string, ≤ 280 bytes. Informational only. */
    reason: string;

    sig: AbandonmentSignature;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical-message inputs — exact field set covered by the BIP-322 signature.
// `via_delegation` and `agent_address` are NOT in the canonical message
// (SPEC §3.1) — they're envelope-only claims the verifier reconciles via the
// OC Agent delegation registry.
// ─────────────────────────────────────────────────────────────────────────────

export interface PledgeCanonicalInput {
    swearer: string;
    proposition: string;
    resolution: PledgeResolution;
    resolves_at: PledgeResolvesAt;
    expires_at: string;
    bond: PledgeBond;
    counterparty: string | null;
    dispute: PledgeDispute;
    remediation: 'breach_recorded';
    sworn_at: string;
    nonce: string;
}

export interface OutcomeCanonicalInput {
    pledge_id: string;
    outcome: OutcomeKind;
    resolved_at: string;
    resolved_by: string;
    evidence: OutcomeEvidence;
    dispute_window_ends_at: string;
}

export interface AbandonmentCanonicalInput {
    pledge_id: string;
    abandoned_at: string;
    reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create-side inputs — what callers pass to createPledge / createOutcome /
// createAbandonment. The SDK fills sig.value from the supplied signer adapter
// and computes the id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A signer adapter — the caller wires their wallet of choice. Returns a
 * base64 BIP-322 signature over the UTF-8 bytes of the supplied message.
 * `address` is the Bitcoin address the wallet signs for.
 */
export interface Bip322Signer {
    address: string;
    signMessage: (msg: string) => Promise<string>;
}

export interface CreatePledgeInput extends Omit<PledgeCanonicalInput, 'sworn_at' | 'nonce' | 'remediation'> {
    /** Defaults to "now" (truncated to seconds, ISO 8601 UTC, Z-terminated). */
    swornAt?: Date | string;
    /**
     * 32 lowercase hex chars (16 random bytes). If omitted, a fresh random
     * nonce is generated via crypto.getRandomValues. Pass an explicit value
     * for test-vector reproduction.
     */
    nonce?: string;
    /** Defaults to "breach_recorded" (the only legal value in v0.1). */
    remediation?: 'breach_recorded';
    swearerSigner: Bip322Signer;
    /**
     * If present, pledge is signed by this agent under an OC Agent delegation.
     * `via_delegation` (the delegation id) and `agent_address` (the agent's
     * address) appear in the envelope but are NOT in the canonical message.
     */
    viaDelegation?: { delegation_id: string; agent_signer: Bip322Signer };
}

export interface CreateOutcomeInput extends OutcomeCanonicalInput {
    /**
     * Required when resolved_by !== "deterministic" (i.e. counterparty_signs).
     * For deterministic mechanisms, omit and the SDK leaves sig = null.
     */
    signer?: Bip322Signer;
}

export interface CreateAbandonmentInput extends AbandonmentCanonicalInput {
    swearerSigner: Bip322Signer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify-side inputs and results.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caller-supplied BIP-322 verifier. Returns true iff the signature verifies
 * under the named address over the UTF-8 bytes of `msg`.
 */
export type VerifyBip322 = (
    msg: string,
    signatureB64: string,
    address: string,
) => Promise<boolean>;

export interface VerifyPledgeInput {
    envelope: PledgeEnvelope;
    /** Optional — omit to skip BIP-322 verification (e.g. for test vectors with placeholder sigs). */
    verifyBip322?: VerifyBip322;
    /** Default false. Set true to bypass BIP-322 entirely. */
    skipSignatureVerification?: boolean;
}

export interface VerifyOutcomeInput {
    envelope: OutcomeEnvelope;
    /**
     * Required when the outcome envelope's mechanism requires a signature
     * (counterparty_signs). For deterministic outcomes, sig === null and
     * BIP-322 is not consulted.
     */
    verifyBip322?: VerifyBip322;
    skipSignatureVerification?: boolean;
}

export interface VerifyAbandonmentInput {
    envelope: AbandonmentEnvelope;
    verifyBip322?: VerifyBip322;
    skipSignatureVerification?: boolean;
}

export type PledgeErrorCode =
    | 'E_UNSUPPORTED_VERSION'
    | 'E_PLEDGE_MALFORMED'
    | 'E_PLEDGE_BAD_ID'
    | 'E_PLEDGE_BAD_SIG'
    | 'E_RESOLUTION_UNKNOWN'
    | 'E_RESOLUTION_NONDETERMINISTIC'
    | 'E_BOND_NOT_FOUND'
    | 'E_BOND_ADDRESS_MISMATCH'
    | 'E_BOND_SPENT'
    | 'E_BOND_INSUFFICIENT_SATS'
    | 'E_BOND_INSUFFICIENT_DAYS'
    | 'E_OUTCOME_MALFORMED'
    | 'E_OUTCOME_BAD_ID'
    | 'E_OUTCOME_BAD_SIG'
    | 'E_OUTCOME_EVIDENCE_MISMATCH'
    | 'E_OUTCOME_RESOLVER_UNAUTHORIZED'
    | 'E_ABANDONMENT_MALFORMED'
    | 'E_ABANDONMENT_BAD_ID'
    | 'E_ABANDONMENT_BAD_SIG'
    | 'E_DELEGATION_NOT_FOUND'
    | 'E_DELEGATION_SCOPE_VIOLATED'
    | 'E_DELEGATION_EXPIRED';

export interface VerifyPledgeOk {
    ok: true;
    envelope: PledgeEnvelope;
    canonicalMessage: string;
    id: string;
}

export interface VerifyOutcomeOk {
    ok: true;
    envelope: OutcomeEnvelope;
    canonicalMessage: string;
    id: string;
}

export interface VerifyAbandonmentOk {
    ok: true;
    envelope: AbandonmentEnvelope;
    canonicalMessage: string;
    id: string;
}

export interface VerifyErr {
    ok: false;
    code: PledgeErrorCode;
    message: string;
}

export type VerifyPledgeResult = VerifyPledgeOk | VerifyErr;
export type VerifyOutcomeResult = VerifyOutcomeOk | VerifyErr;
export type VerifyAbandonmentResult = VerifyAbandonmentOk | VerifyErr;

// ─────────────────────────────────────────────────────────────────────────────
// State machine (SPEC §4.4)
// ─────────────────────────────────────────────────────────────────────────────

export type PledgeState =
    | 'pending'
    | 'resolvable'
    | 'kept'
    | 'broken'
    | 'disputed'
    | 'expired_unresolved';

export interface ClassifyStateInput {
    pledge: PledgeEnvelope;
    outcome: OutcomeEnvelope | null;
    abandonment: AbandonmentEnvelope | null;
    /** ISO 8601 UTC. */
    now: string;
    /**
     * Optional — block-height resolutions need a wall-clock timestamp for the
     * resolves_at.block. If the block isn't yet mined or no chain state is
     * supplied, the SDK treats resolves_at as +infinity.
     */
    chain?: {
        /** Highest seen block height. */
        tip_height: number;
        /** Wall-clock ISO 8601 UTC of `tip_height`. */
        tip_time: string;
        /** Optional override mapping a specific block to its mined-time. */
        blockTimes?: Record<number, string>;
    };
    /**
     * Optional list of additional outcome envelopes from authorized resolvers
     * (e.g. swearer + counterparty in a bilateral pledge). Used to detect
     * contradictory outcomes → `disputed`.
     */
    contradictoryOutcomes?: OutcomeEnvelope[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Bond verification (SPEC §8) — the SDK ships the algorithm; the chain
// accessor is injected by the caller.
// ─────────────────────────────────────────────────────────────────────────────

export interface AttestationLookupResult {
    /**
     * Bitcoin address the attestation was signed by — the OrangeCheck
     * attestation's canonical-message `address` field.
     */
    address: string;
    /**
     * Sats currently bonded by the named UTXOs at the verifier's clock.
     * Computed by the caller's chain accessor.
     */
    sats_bonded: number;
    /** Days the named UTXOs have been unspent at the verifier's clock. */
    days_unspent: number;
    /** True if the named UTXO has been spent at or before `now`. */
    utxo_spent_at_or_before_now: boolean;
}

/**
 * Caller-supplied lookup that resolves an OrangeCheck attestation id against
 * live Bitcoin chain state. Returns null if the attestation can't be found.
 *
 * The SDK does not bundle a Bitcoin RPC client by design — the caller (CLI,
 * web, server) wires their accessor of choice (Esplora, mempool.space,
 * bitcoind RPC, oc-attest sdk).
 */
export type AttestationLookup = (
    attestationId: string,
    nowIso: string,
) => Promise<AttestationLookupResult | null>;

export interface VerifyBondInput {
    pledge: PledgeEnvelope;
    /** ISO 8601 UTC. */
    now: string;
    lookup: AttestationLookup;
}

export interface VerifyBondOk {
    ok: true;
    sats_bonded: number;
    days_unspent: number;
}

export interface VerifyBondErr {
    ok: false;
    code: Extract<
        PledgeErrorCode,
        'E_BOND_NOT_FOUND' | 'E_BOND_ADDRESS_MISMATCH' | 'E_BOND_SPENT' | 'E_BOND_INSUFFICIENT_SATS' | 'E_BOND_INSUFFICIENT_DAYS'
    >;
    message: string;
}

export type VerifyBondResult = VerifyBondOk | VerifyBondErr;
