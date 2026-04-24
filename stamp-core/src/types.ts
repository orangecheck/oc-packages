// Wire types for OC Stamp v1 envelopes. See SPEC.md §4.

export const ENVELOPE_VERSION = 1 as const;

export type EnvelopeKind = 'stamp';

export interface StampContent {
    /** "sha256:<64-hex>" */
    hash: string;
    length: number;
    /** RFC 6838 media type. "application/octet-stream" if unknown. */
    mime: string;
    /** Optional pointer — not cryptographic. */
    ref: string | null;
}

export interface StampSigner {
    address: string;
    alg: 'bip322';
}

export interface StampStake {
    /** SHA-256 hex of an OrangeCheck canonical message. */
    attestation_id: string;
    sats_bonded: number;
    days_unspent: number;
}

export type OtsStatus = 'pending' | 'confirmed';

export interface StampOts {
    status: OtsStatus;
    /** Base64-encoded OpenTimestamps proof. */
    proof: string;
    calendars: string[];
    block_height: number | null;
    block_hash: string | null;
    /** ISO 8601 UTC of the upgrade; null while pending. */
    upgraded_at: string | null;
}

export interface StampSignature {
    alg: 'bip322';
    pubkey: string; // MUST equal signer.address
    value: string; // base64 BIP-322 signature over hex(id)
}

export interface StampEnvelope {
    v: typeof ENVELOPE_VERSION;
    kind: EnvelopeKind;
    id: string; // 64-hex of sha256(canonical_message)
    content: StampContent;
    signer: StampSigner;
    signed_at: string; // ISO 8601 UTC
    stake: StampStake | null;
    ots: StampOts | null;
    sig: StampSignature;
}

// Inputs to stamp() / verify().

export interface CanonicalMessageInput {
    address: string;
    /** "sha256:<64-hex>" */
    content_hash: string;
    content_length: number;
    /** "application/octet-stream" if unknown. */
    content_mime: string;
    /** ISO 8601 UTC. */
    signed_at: string;
}

export interface StampInput {
    /** The bytes being stamped, or their pre-computed hash. Exactly one is required. */
    content: Uint8Array | { hash: string; length: number };
    mime: string;
    ref?: string | null;
    signer: {
        address: string;
        /**
         * Returns a BIP-322 base64 signature of the given message bytes as UTF-8.
         * The caller supplies the wallet adapter. Called once per stamp() invocation.
         */
        signMessage: (msg: string) => Promise<string>;
    };
    stake?: StampStake | null;
    /** Defaults to now. */
    signedAt?: Date;
}

export interface VerifyInput {
    envelope: StampEnvelope;
    /**
     * Optional: the content bytes. If present, verify() additionally checks that
     * sha256(content) matches envelope.content.hash.
     */
    content?: Uint8Array;
    /**
     * Verifier for BIP-322. Plugged in by the caller because signature verification
     * libraries differ across Node, browser, and CLI environments.
     */
    verifyBip322?: (msg: string, signatureB64: string, address: string) => Promise<boolean>;
    /**
     * Optional hook for OTS anchor verification. If present and ots.status === "confirmed",
     * the caller-supplied function walks the proof and returns true iff it chains to a
     * real Bitcoin block header at the declared height.
     *
     * The default behavior (anchor hook omitted) is to ACCEPT a confirmed envelope on
     * shape alone — useful for preview UIs. Callers that attach legal or economic
     * weight MUST supply this hook.
     */
    verifyOtsAnchor?: (proofB64: string, blockHeight: number, blockHash: string) => Promise<boolean>;
    /**
     * Skip the BIP-322 signature verification. Default false. Useful for test vectors
     * where signatures are placeholders, or for preview UIs that re-verify separately.
     */
    skipSignatureVerification?: boolean;
}

export type VerifyErrorCode =
    | 'E_UNSUPPORTED_VERSION'
    | 'E_MALFORMED'
    | 'E_BAD_ID'
    | 'E_BAD_SIG'
    | 'E_BAD_ANCHOR'
    | 'E_NO_ANCHOR'
    | 'E_BAD_CONTENT'
    | 'E_STAKE_UNMET'
    | 'E_CALENDAR_UNREACHABLE';

export interface VerifyOk {
    ok: true;
    envelope: StampEnvelope;
    canonicalMessage: string;
    id: string;
    anchor:
        | { status: 'none' }
        | { status: 'pending' }
        | { status: 'confirmed'; blockHeight: number; blockHash: string; verified: boolean };
}

export interface VerifyErr {
    ok: false;
    code: VerifyErrorCode;
    message: string;
}

export type VerifyResult = VerifyOk | VerifyErr;
