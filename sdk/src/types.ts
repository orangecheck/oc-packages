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
    | 'sig_unsupported_script' // A BIP-322 full or proof-of-funds signature, not supported
    | 'bond_confirmed' // Bond amount confirmed
    | 'bond_zero' // No bond amount
    | 'bond_pending' // Bond pending confirmation
    | 'bond_insufficient' // Insufficient bond amount
    | 'bond_malformed' // A bond: value that is not base-10 ASCII digits up to 2^53 - 1
    | 'aud_mismatch' // Audience mismatch
    | 'expired' // Attestation expired
    | 'not_yet_valid' // Signed issued_at is ahead of the verifier's clock
    | 'network_testmode' // Test network mode
    | 'bad_request' // Invalid request
    | 'decode_error' // Decoding error
    | 'invalid_scheme' // Invalid signature scheme
    | 'invalid_attestation_id' // Invalid attestation ID
    // Unread, never a verdict (1.21.0): no chain endpoint listed the address's coins.
    | 'chain_unread' // None answered (429, 5xx, timeout, network). Ask again; beside bad_request
    | 'utxo_cap_unread' // The address holds more coins than the endpoints list (~500). Asking again does not help
    | 'provider_refused_unread'; // An endpoint refused the lookup (a 4xx other than 429); see chain_status

/**
 * Options for signature verification
 */
export interface VerifyOptions {
    /** Allow signet network when true */
    testMode?: boolean;
    /** @deprecated Has no effect. verify() always checks the signature and chain state. */
    demoMode?: boolean;
    /** Expected audience for RP policy */
    expectedAud?: string;
    /** Override mempool.space mainnet base URL */
    esploraMainnetBase?: string;
    /** Override signet base URL */
    esploraSignetBase?: string;
    /** Override testnet base URL */
    esploraTestnetBase?: string;
    /**
     * Without a `bond:` line, age the oldest coins that cover this many sats
     * instead of the single oldest coin, so old dust can't lend its age to a
     * fresh deposit. `check()` sets it to `minSats`.
     */
    coverSats?: number;
    /**
     * Keep each address's UTXO read this many milliseconds in this process,
     * and share a read still in flight, so a server answering many checks of
     * one address reads the chain once a window. Off unless set: a deposit
     * made inside the window is not seen until it ends.
     */
    utxoKeepMs?: number;
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
    /** @deprecated Ignored: the signature's own bytes decide the scheme. */
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
    /** Reputation metrics. Absent whenever the coins were not read. */
    metrics?: Metrics;
    /** The HTTP status an endpoint refused the UTXO lookup with, beside `provider_refused_unread` only. */
    chain_status?: number;
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
