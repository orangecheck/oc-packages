/**
 * Canonical message builder per SPEC.md §2
 *
 * - LF line endings, exactly one trailing LF
 * - 7 fixed core lines in strict order and wording
 * - Optional extensions appended as key: value with lexicographically sorted lowercase keys
 */

import type { AttestationEnvelope, IdentityBinding, Network, Scheme } from './types';

import { decodeAddress } from '@orangecheck/bip322';

import { isOneLineValue } from './one-line';

/** The network a message selects (SPEC §7.1 step 3): testnet or signet only by that exact value. */
export function selectedNetwork(value: string | undefined): Network {
    return value === 'testnet' || value === 'signet' ? value : 'mainnet';
}

/** False for an address that decodes as another network's; signet's addresses are testnet's. */
export function onNetwork(address: string, network: Network): boolean {
    const decoded = decodeAddress(address);
    return !decoded || decoded.network === (network === 'mainnet' ? 'mainnet' : 'testnet');
}

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

    // No silent Math.random fallback: a nonce is a load-bearing security
    // primitive. A deployment without `crypto.getRandomValues` MUST fix its
    // environment rather than sign with weak randomness.
    throw new Error('crypto.getRandomValues unavailable — refusing to mint a weak nonce');
}

/**
 * Reject characters that would break the line-oriented canonical grammar
 * or the comma-separated identities list. If any of these slipped through,
 * an attacker could smuggle a forged `address:` or extension line into the
 * signed payload: `identities: alice\naddress: bc1qEVIL…` would parse as a
 * second address line. Catch it at the boundary, not at verification time.
 *
 * Also rejects a colon in the identifier so a bad actor can't turn
 * `github:alice:extra` into a different protocol binding on parse.
 */
const IDENTITY_PROTOCOL_RE = /^[a-z][a-z0-9_-]*$/;
const IDENTITY_FORBIDDEN_CHARS = /[\r\n,]/;

function assertSafeIdentity({ protocol, identifier }: IdentityBinding): void {
    if (!IDENTITY_PROTOCOL_RE.test(protocol)) {
        throw new Error(
            `invalid identity protocol: ${JSON.stringify(protocol)} — must match /^[a-z][a-z0-9_-]*$/`
        );
    }
    if (
        !identifier ||
        identifier !== identifier.trim() ||
        IDENTITY_FORBIDDEN_CHARS.test(identifier) ||
        !isOneLineValue(identifier)
    ) {
        throw new Error(
            `invalid identity identifier: ${JSON.stringify(identifier)} — must be non-empty, contain no commas, start and end with no space, and be one line with no newline or other control character`
        );
    }
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
    for (const id of identities) assertSafeIdentity(id);

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
    // The identities field lives on one line of the canonical message. If it
    // contains a raw LF/CR, it's either corrupt or an attempt to smuggle a
    // fake core line into the parser. Refuse instead of trying to recover.
    if (IDENTITY_FORBIDDEN_CHARS.test(identitiesStr.replace(/,/g, ''))) {
        throw new Error('identities field contains forbidden characters (newline)');
    }

    const bindings = identitiesStr.split(',').map((binding) => {
        const colonIndex = binding.indexOf(':');
        if (colonIndex === -1) {
            throw new Error(`Invalid identity binding format: ${binding}`);
        }
        return {
            protocol: binding.substring(0, colonIndex).trim(),
            identifier: binding.substring(colonIndex + 1).trim(),
        };
    });

    for (const b of bindings) {
        if (!b.protocol || !b.identifier) {
            throw new Error(`Invalid identity binding: ${b.protocol}:${b.identifier}`);
        }
        assertSafeIdentity(b);
    }
    return bindings;
}

/**
 * Optional deterministic overrides for message building. Only intended for
 * tests / conformance vectors; production callers should let the builder
 * mint a fresh nonce + timestamp per message.
 */
export interface BuildOptions {
    /** 32-char lowercase hex. Default: freshly-generated cryptographic nonce. */
    nonce?: string;
    /** RFC-3339 UTC. Default: `new Date().toISOString()`. */
    issuedAt?: string;
}

/**
 * The amount a `bond:` value gives, or null when SPEC §2.2 does not allow it:
 * base-10 ASCII digits only, at most 2^53 - 1. parseInt would read "5000abc"
 * as 5000 and "1e9" as 1.
 */
export function readBondExtension(value: string): number | null {
    if (!/^[0-9]+$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
}

const HEADER = 'orangecheck';
const PURPOSE = 'portable reputation attestation (non-custodial)';
const ACK = 'I attest control of this address and bind it to my identities.';
/** The keyed core lines after the header, in SPEC §2.1 order. */
const CORE_KEYS = ['identities', 'address', 'purpose', 'nonce', 'issued_at', 'ack'];
/** An extension key: printable ASCII with no colon, in lowercase (SPEC §2.2). */
export const EXTENSION_KEY = /^[!-9;-@[-~]+$/;

/**
 * Whether `message` is an attestation in canonical form (SPEC §7.1 step 1):
 * LF line ends with exactly one trailing LF, the header and the six core lines
 * in order with their exact literals, a 32-hex nonce, identities that parse
 * and are written sorted, then extensions with lowercase keys in ascending
 * order, each with a value. Nothing else is an attestation, however validly
 * signed. The address, issue time, expiry and bond are verify()'s own checks.
 */
export function isCanonicalAttestation(message: string): boolean {
    if (!message.endsWith('\n') || message.includes('\r')) return false;
    const [header, ...rest] = message.slice(0, -1).split('\n');
    if (header !== HEADER || rest.length < CORE_KEYS.length) return false;
    const fields: Array<[string, string]> = [];
    for (const line of rest) {
        const at = line.indexOf(': ');
        if (at < 1 || !isOneLineValue(line.slice(at + 2))) return false;
        fields.push([line.slice(0, at), line.slice(at + 2)]);
    }
    const core = Object.fromEntries(fields.slice(0, CORE_KEYS.length));
    if (fields.slice(0, CORE_KEYS.length).some(([key], i) => key !== CORE_KEYS[i])) return false;
    if (core.purpose !== PURPOSE || core.ack !== ACK || !core.address || !core.issued_at) return false;
    if (!/^[0-9a-f]{32}$/.test(core.nonce!)) return false;
    try {
        if (formatIdentities(parseIdentities(core.identities!)) !== core.identities) return false;
    } catch {
        return false;
    }
    let previous = '';
    for (const [key, value] of fields.slice(CORE_KEYS.length)) {
        if (!EXTENSION_KEY.test(key) || key <= previous || CORE_KEYS.includes(key) || !value) {
            return false;
        }
        previous = key;
    }
    return true;
}

/**
 * Build a canonical message following OrangeCheck Protocol v0 specification
 * @param input - Canonical input with address and identities
 * @param extensions - Optional extension key-value pairs
 * @param options - Optional deterministic overrides (testing only)
 * @returns Canonical message string with LF line endings
 */
export function buildCanonicalMessage(
    { address, identities }: CanonicalInput,
    extensions: Extensions = {},
    options: BuildOptions = {}
): string {
    const nonce = options.nonce ?? randomNonce16BHexLower();
    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        throw new Error(`invalid nonce: must be 32 lowercase hex chars`);
    }
    const issuedAt = options.issuedAt ?? new Date().toISOString();
    if (!isOneLineValue(address) || !isOneLineValue(issuedAt)) {
        throw new Error('invalid address or issued_at: each must be one line');
    }

    // Format identities
    const identitiesStr = formatIdentities(identities);

    // Core (strict wording + order per SPEC.md §2)
    const core = [
        HEADER,
        `identities: ${identitiesStr}`,
        `address: ${address}`,
        `purpose: ${PURPOSE}`,
        `nonce: ${nonce}`,
        `issued_at: ${issuedAt}`,
        `ack: ${ACK}`,
    ];

    // Normalize and sort extensions
    const normExt: Record<string, string> = {};
    for (const [k, v] of Object.entries(extensions)) {
        if (v == null || v === '') {
            continue;
        }
        const key = k.toLowerCase();
        // Each extension is one line verify() reads: a key it takes and a one-line value (SPEC §2.2).
        if (!EXTENSION_KEY.test(key) || CORE_KEYS.includes(key) || !isOneLineValue(String(v))) {
            throw new Error(`invalid extension ${JSON.stringify(k)}: a lowercase ASCII key that is not a core key, a value on one line`);
        }
        // A bond is written as SPEC §2.2 reads it, so no verifier refuses it as bond_malformed.
        if (key === 'bond' && readBondExtension(String(v)) === null) {
            throw new Error(`invalid bond: ${String(v)} is not a whole number of sats up to 2^53 - 1`);
        }
        normExt[key] = String(v);
    }
    // The address is on the network the message selects, so no verifier refuses it as bad_request.
    const network = normExt['network'];
    if (network !== undefined && !['mainnet', 'testnet', 'signet'].includes(network)) {
        throw new Error(`invalid network ${JSON.stringify(network)}: mainnet, testnet or signet`);
    }
    if (!onNetwork(address, selectedNetwork(network))) {
        throw new Error(`invalid network: ${address} is not a ${selectedNetwork(network)} address`);
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
 * Each line's key and value as verify() reads them: split at its first ": ",
 * neither trimmed (SPEC §2.2). A line with no key before a ": " has neither.
 * Not exported from the package.
 */
export function messageFields(message: string): Array<[key: string, value: string]> {
    return message.split('\n').flatMap((line): Array<[string, string]> => {
        const at = line.indexOf(': ');
        return at < 1 ? [] : [[line.slice(0, at), line.slice(at + 2)]];
    });
}

/** The value of the first line whose key is `key`, as written. Not exported from the package. */
export function readMessageValue(message: string, key: string): string | undefined {
    return messageFields(message).find(([k]) => k === key)?.[1];
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

    // The signed line verify() reads, not the first "issued_at: " anywhere in the text.
    const issued_at = readMessageValue(message, 'issued_at') ?? new Date().toISOString();

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
    const verification_url = `https://attest.ochk.io/attest/${attestation_id}`;

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
