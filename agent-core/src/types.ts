// Wire types for OC Agent v1 envelopes. See SPEC.md §4, §5, §9.

export const ENVELOPE_VERSION = 1 as const;

export type EnvelopeKind =
    | 'agent-delegation'
    | 'agent-action'
    | 'agent-revocation'
    | 'agent-subdelegation';

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks
// ─────────────────────────────────────────────────────────────────────────────

export interface ActorRef {
    /** mainnet Bitcoin address (P2WPKH, P2TR, or P2PKH). */
    address: string;
    alg: 'bip322';
}

export interface Signature {
    alg: 'bip322';
    pubkey: string; // equals the producing actor's address
    value: string; // base64 BIP-322 signature over hex(id)
}

export type RevocationHolder = 'principal' | 'agent';

// ─────────────────────────────────────────────────────────────────────────────
// Delegation (SPEC §4)
// ─────────────────────────────────────────────────────────────────────────────

export interface DelegationBond {
    /** Non-negative sats declared as bonded at issuance time. */
    sats: number;
    /** SHA-256 hex of the OrangeCheck canonical message signed by principal.address. */
    attestation_id: string;
}

export interface DelegationRevocationRef {
    /** Who MAY publish a revocation. Default ["principal"]. */
    holders: RevocationHolder[];
    /** Optional Nostr-addressable pointer to a published revocation. Non-cryptographic. */
    ref: string | null;
}

export interface DelegationEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'agent-delegation';
    id: string; // 64-hex sha256(canonical_message)
    principal: ActorRef;
    agent: ActorRef;
    /** Sorted lexicographically in the canonical message; stored in sorted order on the envelope too. */
    scopes: string[];
    bond: DelegationBond | null;
    issued_at: string; // ISO 8601 UTC
    expires_at: string; // ISO 8601 UTC
    nonce: string; // 32-hex random
    revocation: DelegationRevocationRef;
    sig: Signature;
}

export interface DelegationCanonicalInput {
    principal: string;
    agent: string;
    scopes: string[]; // pre-canonicalized, pre-sorted
    bond_sats: number;
    /** 64-hex attestation id or the literal string "none". */
    bond_attestation: string;
    issued_at: string;
    expires_at: string;
    nonce: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent-action (SPEC §5) — strict extension of OC Stamp
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionContent {
    hash: string; // "sha256:<64-hex>"
    length: number;
    mime: string;
    ref: string | null;
}

export interface ActionOts {
    status: 'pending' | 'confirmed';
    proof: string;
    calendars: string[];
    block_height: number | null;
    block_hash: string | null;
    upgraded_at: string | null;
}

export interface ActionEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'agent-action';
    id: string;
    content: ActionContent;
    signer: ActorRef; // agent
    signed_at: string;
    delegation_id: string; // 64-hex
    scope_exercised: string; // a sub-scope of some granted scope
    ots: ActionOts | null;
    sig: Signature;
}

export interface ActionCanonicalInput {
    address: string; // agent address
    content_hash: string;
    content_length: number;
    content_mime: string;
    signed_at: string;
    delegation_id: string;
    scope_exercised: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-delegation (SUB-DELEGATION.md, v1.1)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubdelegationEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'agent-subdelegation';
    id: string; // 64-hex sha256(canonical_message)
    parent_id: string; // 64-hex; the immediate parent envelope's id
    /** The sub-principal — equal to parent.agent.address. */
    principal: ActorRef;
    /** The recipient sub-agent. */
    agent: ActorRef;
    /** Each scope MUST be a sub-scope of some scope on the parent. */
    scopes: string[];
    issued_at: string; // ISO 8601 UTC; >= parent.issued_at
    expires_at: string; // ISO 8601 UTC; <= parent.expires_at
    nonce: string; // 32-hex random
    revocation: DelegationRevocationRef;
    sig: Signature;
}

export interface SubdelegationCanonicalInput {
    parent_id: string;
    principal: string;
    agent: string;
    scopes: string[]; // pre-canonicalized, pre-sorted
    issued_at: string;
    expires_at: string;
    nonce: string;
}

/** Either a root or a sub envelope; chain links walk up to a root delegation. */
export type ChainLink = DelegationEnvelope | SubdelegationEnvelope;

// ─────────────────────────────────────────────────────────────────────────────
// Revocation (SPEC §9)
// ─────────────────────────────────────────────────────────────────────────────

export interface RevocationEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: 'agent-revocation';
    id: string;
    delegation_id: string;
    signer: ActorRef;
    /** Short ASCII rationale, <= 128 bytes. Empty string if omitted. */
    reason: string;
    signed_at: string;
    ots: ActionOts | null;
    sig: Signature;
}

export interface RevocationCanonicalInput {
    address: string;
    delegation_id: string;
    reason: string;
    signed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error codes (SPEC §11)
// ─────────────────────────────────────────────────────────────────────────────

export type AgentErrorCode =
    | 'E_UNSUPPORTED_VERSION'
    | 'E_MALFORMED'
    | 'E_BAD_ID'
    | 'E_BAD_SIG'
    | 'E_BAD_SCOPE_GRAMMAR'
    | 'E_NOT_YET_VALID'
    | 'E_EXPIRED'
    | 'E_REVOKED'
    | 'E_DELEGATION_MISMATCH'
    | 'E_AGENT_MISMATCH'
    | 'E_OUT_OF_WINDOW'
    | 'E_SCOPE_DENIED'
    | 'E_BAD_ACTION_STAMP'
    | 'E_NO_BOND'
    | 'E_BOND_UNMET'
    | 'E_BOND_UNVERIFIED'
    | 'E_REVOKER_UNAUTHORIZED'
    | 'E_CALENDAR_UNREACHABLE'
    | 'E_SUBDELEGATION_DEPTH_EXCEEDED'
    | 'E_SUBDELEGATION_PRINCIPAL_MISMATCH'
    | 'E_SUBDELEGATION_EXPIRES_EXTENDED'
    | 'E_SUBDELEGATION_SCOPE_ESCALATED';

export interface VerifyOk<T> {
    ok: true;
    envelope: T;
    canonicalMessage: string;
    id: string;
}

export interface VerifyErr {
    ok: false;
    code: AgentErrorCode;
    message: string;
}

export type VerifyDelegationResult = VerifyOk<DelegationEnvelope> | VerifyErr;
export type VerifyRevocationResult = VerifyOk<RevocationEnvelope> | VerifyErr;
export type VerifySubdelegationResult = VerifyOk<SubdelegationEnvelope> | VerifyErr;

export interface VerifyActionOkExtra {
    /** The ROOT delegation rooting the authority chain. */
    delegation: DelegationEnvelope;
    /**
     * The sub-delegation chain `[S_1, …, S_leaf]`. Empty when the action cites
     * the root directly. The action's authority leaf is
     * `chain[chain.length - 1] ?? delegation`.
     */
    chain: SubdelegationEnvelope[];
    scopeExercised: string;
    anchor:
        | { status: 'none' }
        | { status: 'pending' }
        | { status: 'confirmed'; blockHeight: number; blockHash: string; verified: boolean };
}

export type VerifyActionResult =
    | (VerifyOk<ActionEnvelope> & VerifyActionOkExtra)
    | VerifyErr;
