/**
 * Canonical message builder per SPEC.md §2
 *
 * - LF line endings, exactly one trailing LF
 * - 7 fixed core lines in strict order and wording
 * - Optional extensions appended as key: value with lexicographically sorted lowercase keys
 */

import type { AttestationEnvelope, IdentityBinding, Scheme } from './types';

/**
 * Input for building a canonical message
 */
export interface CanonicalInput {
    /** Bitcoin address */
    address: string;
    /** Optional identity bindings */
    identities?: IdentityBinding[];
}

/**
 * Extension key-value pairs for canonical message
 */
export type Extensions = Record<string, string | undefined>;

/**
 * Convert bytes to lowercase hex string
 * @param bytes - Byte array to convert
 * @returns Lowercase hex string
 */
function toLowerHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generate a random 16-byte nonce as lowercase hex
 * Uses Web Crypto API when available, falls back to Math.random()
 * @returns 32-character lowercase hex string
 */
export function randomNonce16BHexLower(): string {
    const arr = new Uint8Array(16);

    try {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            crypto.getRandomValues(arr);
            return toLowerHex(arr);
        }
    } catch {
        // Fall through to non-cryptographic fallback
    }

    // Fallback (non-cryptographic) for environments without Web Crypto
    for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
    }
    return toLowerHex(arr);
}

/**
 * Format identities as comma-separated protocol:identifier pairs, sorted lexicographically
 * @param identities - Array of identity bindings
 * @returns Comma-separated string of protocol:identifier pairs
 */
export function formatIdentities(identities: IdentityBinding[] = []): string {
    if (identities.length === 0) {
        return '';
    }

    // Format as protocol:identifier and sort lexicographically
    const formatted = identities
        .map(({ protocol, identifier }) => `${protocol}:${identifier}`)
        .sort();

    return formatted.join(',');
}

/**
 * Parse identities from comma-separated protocol:identifier format
 * @param identitiesStr - Comma-separated identity string
 * @returns Array of identity bindings
 * @throws {Error} If identity format is invalid
 */
export function parseIdentities(identitiesStr: string): IdentityBinding[] {
    if (!identitiesStr || identitiesStr.trim() === '') {
        return [];
    }

    return identitiesStr
        .split(',')
        .map((binding) => {
            const colonIndex = binding.indexOf(':');
            if (colonIndex === -1) {
                throw new Error(`Invalid identity binding format: ${binding}`);
            }
            return {
                protocol: binding.substring(0, colonIndex).trim(),
                identifier: binding.substring(colonIndex + 1).trim(),
            };
        })
        .filter((binding) => binding.protocol && binding.identifier);
}

/**
 * Build a canonical message following OrangeCheck Protocol v0 specification
 * @param input - Canonical input with address and identities
 * @param extensions - Optional extension key-value pairs
 * @returns Canonical message string with LF line endings
 */
export function buildCanonicalMessage(
    { address, identities }: CanonicalInput,
    extensions: Extensions = {}
): string {
    const nonce = randomNonce16BHexLower();
    const issuedAt = new Date().toISOString();

    // Format identities
    const identitiesStr = formatIdentities(identities);

    // Core (strict wording + order per SPEC.md §2)
    const core = [
        'orangecheck',
        `identities: ${identitiesStr}`,
        `address: ${address}`,
        'purpose: portable reputation attestation (non-custodial)',
        `nonce: ${nonce}`,
        `issued_at: ${issuedAt}`,
        'ack: I attest control of this address and bind it to my identities.',
    ];

    // Normalize and sort extensions
    const normExt: Record<string, string> = {};
    for (const [k, v] of Object.entries(extensions)) {
        if (v == null || v === '') {
            continue;
        }
        const key = k.toLowerCase();
        normExt[key] = String(v);
    }

    const extLines = Object.keys(normExt)
        .sort()
        .map((k) => `${k}: ${normExt[k]!}`);

    const all = [...core, ...extLines];

    // Join with LF and ensure exactly one trailing LF
    return all.join('\n') + '\n';
}

/**
 * Generate attestation ID from canonical message
 *
 * attestation_id = SHA-256(canonical_message)
 *
 * @param message - Canonical message string
 * @returns Lowercase hex SHA-256 hash
 */
export async function generateAttestationId(message: string): Promise<string> {
    // Convert message to UTF-8 bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    // Compute SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to lowercase hex
    return toLowerHex(new Uint8Array(hashBuffer));
}

/**
 * Create an attestation envelope for publishing
 *
 * This wraps the canonical message with metadata for Nostr publishing
 *
 * @param message - Canonical message
 * @param signature - BIP-322 or legacy signature
 * @param scheme - Signature scheme used
 * @param address - Bitcoin address
 * @param identities - Identity bindings
 * @param extensions - Optional extensions
 * @returns Attestation envelope ready for publishing
 */
export async function createAttestationEnvelope(
    message: string,
    signature: string,
    scheme: Scheme,
    address: string,
    identities: IdentityBinding[],
    extensions: Extensions = {}
): Promise<AttestationEnvelope> {
    const attestation_id = await generateAttestationId(message);

    // Extract issued_at from message
    const issuedAtMatch = message.match(/issued_at: ([^\n]+)/);
    const issued_at = issuedAtMatch?.[1] ?? new Date().toISOString();

    // Extract expires from extensions if present
    const expires_at = extensions.expires;

    // Extract relay hints from extensions if present
    const relay_hints = extensions.relay_hints?.split(',').map((r) => r.trim());

    // Extract publish targets from extensions if present
    const publish_targets = extensions.publish?.split(',').map((t) => t.trim());

    // Base64url encode the message
    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);
    const base64 = btoa(String.fromCharCode(...messageBytes));
    const message_b64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Construct verification URL
    const verification_url = `https://ochk.io/attest/${attestation_id}`;

    return {
        attestation_id,
        scheme,
        address,
        identities,
        message,
        message_b64url,
        signature,
        issued_at,
        expires_at,
        verification_url,
        publish_targets,
        relay_hints,
    };
}
