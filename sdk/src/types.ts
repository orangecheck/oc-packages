/**
 * Core type definitions for OrangeCheck Protocol
 */

/**
 * Bitcoin signature scheme
 */
export type Scheme = 'bip322' | 'legacy';

/**
 * Bitcoin network
 */
export type Network = 'mainnet' | 'testnet' | 'signet';

/**
 * Identity protocols we support first-class. Other strings remain valid per
 * the OCP spec ("unknown protocols MUST be preserved but MAY be ignored") —
 * the `| string` fallback keeps parsing open.
 */
export type IdentityProtocol = 'nostr' | 'dns' | 'twitter' | 'github' | string;

/**
 * Identity binding linking a Bitcoin address to an external identity
 */
export interface IdentityBinding {
    /** Protocol identifier (e.g., 'nostr', 'github') */
    protocol: string;
    /** Protocol-specific identifier (e.g., npub, username) */
    identifier: string;
    /** Optional proof URL or reference */
    proof?: string;
}

/**
 * Verification status codes
 */
export type StatusCode =
    | 'sig_ok_bip322' // BIP-322 signature verified
    | 'sig_ok_legacy' // Legacy signature verified
    | 'sig_invalid' // Signature verification failed
    | 'sig_unsupported_script' // Unsupported script type
    | 'bond_confirmed' // Bond amount confirmed
    | 'bond_zero' // No bond amount
    | 'bond_pending' // Bond pending confirmation
    | 'bond_insufficient' // Insufficient bond amount
    | 'aud_mismatch' // Audience mismatch
    | 'expired' // Attestation expired
    | 'network_testmode' // Test network mode
    | 'bad_request' // Invalid request
    | 'decode_error' // Decoding error
    | 'invalid_scheme' // Invalid signature scheme
    | 'invalid_attestation_id'; // Invalid attestation ID

/**
 * Options for signature verification
 */
export interface VerifyOptions {
    /** Allow signet network when true */
    testMode?: boolean;
    /** Short-circuit with demo data */
    demoMode?: boolean;
    /** Expected audience for RP policy */
    expectedAud?: string;
    /** Override mempool.space mainnet base URL */
    esploraMainnetBase?: string;
    /** Override signet base URL */
    esploraSignetBase?: string;
    /** Override testnet base URL */
    esploraTestnetBase?: string;
}

/**
 * Input for signature verification
 */
export interface VerifyInput {
    /** Bitcoin address (optional when using attestation_id) */
    addr?: string;
    /** Canonical message (optional when using attestation_id) */
    msg?: string;
    /** Signature (optional when using attestation_id) */
    sig?: string;
    /** Signature scheme (auto-detected if not provided) */
    scheme?: Scheme;
    /** Attestation ID (alternative to addr/msg/sig) */
    attestation_id?: string;
}

/**
 * Reputation metrics computed from UTXOs
 */
export interface Metrics {
    /** Total sats bonded (confirmed balance) */
    sats_bonded: number;
    /** Days since oldest UTXO */
    days_unspent: number;
    /** Computed reputation score */
    score: number;
}

/**
 * Verification outcome
 */
export interface VerifyOutcome {
    /** Whether verification succeeded */
    ok: boolean;
    /** Status codes from verification */
    codes: StatusCode[];
    /** Detected network */
    network: Network;
    /** Attestation ID (SHA-256 of canonical message) */
    attestation_id?: string;
    /** Identity bindings */
    identities?: IdentityBinding[];
    /** Reputation metrics */
    metrics?: Metrics;
}

/**
 * Attestation envelope for JSON serialization
 */
export interface AttestationEnvelope {
    /** Attestation ID (SHA-256 of canonical message) */
    attestation_id: string;
    /** Signature scheme used */
    scheme: Scheme;
    /** Bitcoin address */
    address: string;
    /** Identity bindings */
    identities: IdentityBinding[];
    /** Canonical message */
    message: string;
    /** Base64URL-encoded message */
    message_b64url: string;
    /** Signature */
    signature: string;
    /** ISO 8601 timestamp */
    issued_at: string;
    /** Optional expiration timestamp */
    expires_at?: string;
    /** Verification URL */
    verification_url: string;
    /** Publish targets (e.g., Nostr relays) */
    publish_targets?: string[];
    /** Relay hints for Nostr */
    relay_hints?: string[];
}

/**
 * Nostr event for NIP-78 publishing
 */
export interface NostrEvent {
    /** Event kind (30078 for OrangeCheck) */
    kind: number;
    /** Event tags */
    tags: string[][];
    /** Event content */
    content: string;
    /** Unix timestamp */
    created_at: number;
    /** Author's public key (hex) */
    pubkey: string;
    /** Event ID (hex) */
    id?: string;
    /** Event signature (hex) */
    sig?: string;
}
