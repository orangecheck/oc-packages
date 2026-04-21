/**
 * Attestation Manager
 *
 * High-level API for creating, publishing, and discovering OrangeCheck attestations
 */

import type { AttestationEnvelope, IdentityBinding, NostrEvent, Scheme } from './types';

import { createAttestationEnvelope, parseIdentities } from './canonical';
import {
    createAttestationEvent,
    DEFAULT_RELAYS,
    parseAttestationFromEvent,
    publishToRelays,
    queryByAddress,
    queryByAttestationId,
    queryByIdentity,
    verifyAttestationEnvelope,
} from './nostr';
import { isNip07Available, signNostrEvent } from './nostr-crypto';
import { createLogger } from './utils/logger';

const log = createLogger('ocp/attestation');

/**
 * Options for creating an attestation
 */
export interface CreateAttestationOptions {
    /** Canonical message */
    message: string;
    /** BIP-322 or legacy signature */
    signature: string;
    /** Signature scheme used */
    scheme: Scheme;
    /** Bitcoin address */
    address: string;
    /** Optional identity bindings */
    identities?: IdentityBinding[];
    /** Optional extension key-value pairs */
    extensions?: Record<string, string | undefined>;
}

/**
 * Options for publishing an attestation to Nostr
 */
export interface PublishAttestationOptions {
    /** Attestation envelope to publish */
    envelope: AttestationEnvelope;
    /** Nostr public key (npub or hex) for signing the event */
    npub: string;
    /** Optional relay URLs (defaults to DEFAULT_RELAYS) */
    relays?: string[];
}

/**
 * Options for discovering attestations
 */
export interface DiscoverAttestationOptions {
    /** Search by attestation ID */
    attestationId?: string;
    /** Search by Bitcoin address */
    address?: string;
    /** Search by identity binding */
    identity?: { protocol: string; identifier: string };
    /** Optional relay URLs to query */
    relays?: string[];
}

/**
 * Result of publishing an attestation
 */
export interface PublishResult {
    /** Relays that successfully received the event */
    success: string[];
    /** Relays that failed to receive the event */
    failed: string[];
}

/**
 * Custom error for attestation operations
 */
export class AttestationError extends Error {
    constructor(
        message: string,
        public readonly code?: string
    ) {
        super(message);
        this.name = 'AttestationError';
    }
}

/**
 * Create an attestation envelope from a signed message
 *
 * @param options - Attestation creation options
 * @returns Attestation envelope ready for publishing
 * @throws {AttestationError} If envelope integrity check fails
 *
 * @example
 * ```typescript
 * const envelope = await createAttestation({
 *   message: canonicalMessage,
 *   signature: 'AkcwRAIg...',
 *   scheme: 'bip322',
 *   address: 'bc1q...',
 *   identities: [{ protocol: 'nostr', identifier: 'npub1...' }],
 * });
 * ```
 */
export async function createAttestation(
    options: CreateAttestationOptions
): Promise<AttestationEnvelope> {
    const { message, signature, scheme, address, identities = [], extensions = {} } = options;

    log.info({ address, identityCount: identities.length }, 'Creating attestation');

    const envelope = await createAttestationEnvelope(
        message,
        signature,
        scheme,
        address,
        identities,
        extensions
    );

    // Verify envelope integrity
    const isValid = await verifyAttestationEnvelope(envelope);
    if (!isValid) {
        throw new AttestationError(
            'Attestation envelope integrity check failed',
            'INTEGRITY_CHECK_FAILED'
        );
    }

    log.info({ attestationId: envelope.attestation_id }, 'Attestation created successfully');

    return envelope;
}

/**
 * Publish an attestation to Nostr relays
 *
 * Uses NIP-07 if available, falls back to ephemeral key for demo
 *
 * @param options - Publishing options
 * @returns Object with successful and failed relay URLs
 * @throws {AttestationError} If signing fails
 *
 * @example
 * ```typescript
 * const result = await publishAttestation({
 *   envelope,
 *   npub: 'npub1...',
 *   relays: ['wss://relay.damus.io'],
 * });
 * console.log('Published to:', result.success);
 * ```
 */
export async function publishAttestation(
    options: PublishAttestationOptions
): Promise<PublishResult> {
    const { envelope, npub, relays = DEFAULT_RELAYS } = options;

    log.info(
        { attestationId: envelope.attestation_id, relayCount: relays.length },
        'Publishing attestation'
    );

    // Create unsigned event
    const unsignedEvent = createAttestationEvent(envelope, npub);

    // Nostr publishing requires a valid schnorr signature. Only NIP-07
    // (window.nostr) is supported. If no signer is present we refuse to
    // publish rather than emit an invalid-sig event that every relay will
    // silently reject — which would make the caller think it had succeeded.
    if (!isNip07Available()) {
        log.warn('NIP-07 unavailable — skipping Nostr publish');
        throw new Error(
            'nostr_signer_unavailable: install a NIP-07 extension (e.g. nos2x, Alby) to publish'
        );
    }

    log.info('Using NIP-07 to sign event');
    const signedEvent = await signNostrEvent(unsignedEvent);
    if (!signedEvent) {
        throw new Error('nostr_signing_failed: NIP-07 extension rejected or errored');
    }

    const result = await publishToRelays(signedEvent, relays);

    log.info(
        {
            attestationId: envelope.attestation_id,
            successCount: result.success.length,
            failedCount: result.failed.length,
        },
        'Publishing complete'
    );

    return result;
}

/**
 * Discover attestations from Nostr relays
 */
export async function discoverAttestations(
    options: DiscoverAttestationOptions
): Promise<AttestationEnvelope[]> {
    const { attestationId, address, identity, relays = DEFAULT_RELAYS } = options;

    let events: NostrEvent[] = [];

    if (attestationId) {
        log.info({ attestationId }, 'Discovering by attestation ID');
        events = await queryByAttestationId(attestationId, relays);
    } else if (address) {
        log.info({ address }, 'Discovering by Bitcoin address');
        events = await queryByAddress(address, relays);
    } else if (identity) {
        log.info({ identity }, 'Discovering by identity');
        events = await queryByIdentity(identity.protocol, identity.identifier, relays);
    } else {
        throw new Error('Must provide attestationId, address, or identity');
    }

    // Parse and verify envelopes
    const envelopes: AttestationEnvelope[] = [];
    for (const event of events) {
        const envelope = parseAttestationFromEvent(event);
        if (envelope) {
            // Verify envelope integrity
            const isValid = await verifyAttestationEnvelope(envelope);
            if (isValid) {
                envelopes.push(envelope);
            } else {
                log.warn(
                    { attestationId: envelope.attestation_id },
                    'Skipping invalid attestation envelope'
                );
            }
        }
    }

    log.info({ eventCount: events.length, validCount: envelopes.length }, 'Discovery complete');

    return envelopes;
}

/**
 * Verify an attestation by fetching it from Nostr and checking integrity
 */
export async function verifyAttestationById(
    attestationId: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<AttestationEnvelope | null> {
    log.info({ attestationId }, 'Verifying attestation by ID');

    const envelopes = await discoverAttestations({ attestationId, relays });

    if (envelopes.length === 0) {
        log.warn({ attestationId }, 'Attestation not found on any relay');
        return null;
    }

    if (envelopes.length > 1) {
        log.warn(
            { attestationId, count: envelopes.length },
            'Multiple attestations found with same ID - using first'
        );
    }

    return envelopes[0] || null;
}

/**
 * Get all attestations for a Bitcoin address
 */
export async function getAttestationsForAddress(
    address: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<AttestationEnvelope[]> {
    log.info({ address }, 'Getting all attestations for address');
    return discoverAttestations({ address, relays });
}

/**
 * Get all attestations for an identity
 */
export async function getAttestationsForIdentity(
    protocol: string,
    identifier: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<AttestationEnvelope[]> {
    log.info({ protocol, identifier }, 'Getting all attestations for identity');
    return discoverAttestations({ identity: { protocol, identifier }, relays });
}

/**
 * Parse identities from a comma-separated string
 * Helper for UI integration
 */
export function parseIdentitiesFromString(identitiesStr: string): IdentityBinding[] {
    return parseIdentities(identitiesStr);
}

/**
 * Format identities for display
 */
export function formatIdentitiesForDisplay(identities: IdentityBinding[]): string {
    return identities.map((id) => `${id.protocol}:${id.identifier}`).join(', ');
}

/**
 * Get verification URL for an attestation
 */
export function getVerificationUrl(attestationId: string, baseUrl = 'https://ochk.io'): string {
    return `${baseUrl}/verify?id=${attestationId}`;
}

/**
 * Extract attestation ID from verification URL
 */
export function extractAttestationIdFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('id');
    } catch {
        return null;
    }
}
