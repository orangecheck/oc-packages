/**
 * Nostr Integration for OrangeCheck Protocol
 *
 * Implements NIP-78 (Application-specific data) for attestation publishing
 */

import type { AttestationEnvelope, IdentityBinding, NostrEvent } from './types';

import { createLogger } from './utils/logger';

const log = createLogger('ocp/nostr');

/**
 * NIP-78 event kind for OrangeCheck attestations
 */
export const ATTESTATION_EVENT_KIND = 30078;

/**
 * Default Nostr relays for OrangeCheck attestation publishing
 *
 * These are well-known, reliable relays with good uptime
 */
export const DEFAULT_RELAYS: string[] = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
];

/**
 * Create a NIP-78 event for an OrangeCheck attestation
 *
 * Kind: 30078 (Parameterized Replaceable Event)
 * d-tag: attestation_id (makes it replaceable by attestation ID)
 *
 * @param envelope - Attestation envelope
 * @param pubkey - Nostr public key (hex format)
 * @returns Unsigned Nostr event
 */
export function createAttestationEvent(
    envelope: AttestationEnvelope,
    pubkey: string
): Omit<NostrEvent, 'id' | 'sig'> {
    const tags: string[][] = [
        ['d', envelope.attestation_id], // Parameterized replaceable event identifier
        ['address', envelope.address], // Bitcoin address
        ['scheme', envelope.scheme], // Signature scheme (bip322 or legacy)
        ['issued_at', envelope.issued_at], // ISO timestamp
    ];

    // Add identity tags
    for (const identity of envelope.identities) {
        tags.push(['i', `${identity.protocol}:${identity.identifier}`]);
    }

    // Add expiration if present
    if (envelope.expires_at) {
        tags.push(['expires', envelope.expires_at]);
    }

    // Add relay hints if present
    if (envelope.relay_hints?.length) {
        for (const relay of envelope.relay_hints) {
            tags.push(['relay', relay]);
        }
    }

    // Content is the full attestation envelope as JSON
    const content = JSON.stringify(envelope, null, 2);

    return {
        kind: ATTESTATION_EVENT_KIND,
        tags,
        content,
        created_at: Math.floor(Date.parse(envelope.issued_at) / 1000),
        pubkey,
    };
}

/**
 * Parse identity bindings from Nostr event tags
 *
 * @param event - Nostr event
 * @returns Array of identity bindings
 */
export function parseIdentitiesFromEvent(event: NostrEvent): IdentityBinding[] {
    const identities: IdentityBinding[] = [];

    for (const tag of event.tags) {
        if (tag[0] === 'i' && tag[1]) {
            const colonIndex = tag[1].indexOf(':');
            if (colonIndex !== -1) {
                identities.push({
                    protocol: tag[1].substring(0, colonIndex),
                    identifier: tag[1].substring(colonIndex + 1),
                });
            }
        }
    }

    return identities;
}

/**
 * Extract attestation ID from Nostr event d-tag
 *
 * @param event - Nostr event
 * @returns Attestation ID or undefined if not found
 */
export function getAttestationIdFromEvent(event: NostrEvent): string | undefined {
    const dTag = event.tags.find((tag) => tag[0] === 'd');
    return dTag?.[1];
}

/**
 * Extract Bitcoin address from Nostr event tags
 *
 * @param event - Nostr event
 * @returns Bitcoin address or undefined if not found
 */
export function getAddressFromEvent(event: NostrEvent): string | undefined {
    const addressTag = event.tags.find((tag) => tag[0] === 'address');
    return addressTag?.[1];
}

/**
 * Publish a Nostr event to multiple relays
 * Returns array of relay URLs that successfully accepted the event
 */
export async function publishToRelays(
    event: NostrEvent,
    relays: string[] = DEFAULT_RELAYS
): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    log.info({ eventId: event.id, relayCount: relays.length }, 'Publishing event to relays');

    const publishPromises = relays.map(async (relayUrl) => {
        let ws: WebSocket | null = null;

        try {
            // Connect to relay
            ws = new WebSocket(relayUrl);
            const wsRef = ws; // Capture for closures

            await new Promise<void>((resolve, reject) => {
                // One outer deadline covers connect + OK round-trip. The old
                // code cleared this on `onopen`, which meant a relay that
                // opened but never sent OK would hang the promise forever.
                const deadline = setTimeout(() => {
                    wsRef.close();
                    reject(new Error('Relay publish timeout'));
                }, 10_000);

                const cleanup = () => {
                    clearTimeout(deadline);
                    wsRef.close();
                };

                wsRef.onopen = () => {
                    // Do NOT clear the deadline — we still need it in case
                    // the relay never responds with OK.
                    wsRef.send(JSON.stringify(['EVENT', event]));
                };

                wsRef.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        // Check for OK response
                        if (data[0] === 'OK' && data[1] === event.id) {
                            if (data[2] === true) {
                                success.push(relayUrl);
                                cleanup();
                                resolve();
                            } else {
                                log.warn(
                                    { relay: relayUrl, reason: data[3] },
                                    'Relay rejected event'
                                );
                                failed.push(relayUrl);
                                cleanup();
                                reject(new Error(data[3] || 'Relay rejected event'));
                            }
                        }
                    } catch (err) {
                        log.error(
                            { relay: relayUrl, error: err },
                            'Failed to parse relay response'
                        );
                        failed.push(relayUrl);
                        cleanup();
                        reject(err);
                    }
                };

                wsRef.onerror = (err) => {
                    log.error({ relay: relayUrl, error: err }, 'WebSocket error');
                    failed.push(relayUrl);
                    cleanup();
                    reject(err);
                };

                wsRef.onclose = () => {
                    // Socket closed before we resolved/rejected — counts as
                    // failure. clearTimeout here is safe (cleanup handles both).
                    clearTimeout(deadline);
                };
            });
        } catch (err) {
            log.error({ relay: relayUrl, error: err }, 'Failed to publish to relay');
            if (!failed.includes(relayUrl)) {
                failed.push(relayUrl);
            }
        } finally {
            // Ensure WebSocket is closed
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
        }
    });

    await Promise.allSettled(publishPromises);

    log.info({ successCount: success.length, failedCount: failed.length }, 'Publishing complete');

    return { success, failed };
}

/**
 * Query relays for attestations by attestation ID
 */
export async function queryByAttestationId(
    attestationId: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    log.info({ attestationId, relayCount: relays.length }, 'Querying relays for attestation');

    const queryPromises = relays.map(async (relayUrl) => {
        let ws: WebSocket | null = null;

        try {
            ws = new WebSocket(relayUrl);
            const wsRef = ws; // Capture for closures

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    wsRef.close();
                    reject(new Error('Query timeout'));
                }, 10000);

                const cleanup = () => {
                    clearTimeout(timeout);
                    wsRef.close();
                };

                wsRef.onopen = () => {
                    // Send REQ message for kind 30078 with d-tag = attestation_id
                    const subscriptionId = `ochk_${Date.now()}`;
                    wsRef.send(
                        JSON.stringify([
                            'REQ',
                            subscriptionId,
                            {
                                kinds: [30078],
                                '#d': [attestationId],
                                limit: 1,
                            },
                        ])
                    );
                };

                wsRef.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            events.push(data[2]);
                        } else if (data[0] === 'EOSE') {
                            cleanup();
                            resolve();
                        }
                    } catch (err) {
                        log.error({ relay: relayUrl, error: err }, 'Failed to parse event');
                    }
                };

                wsRef.onerror = (err) => {
                    log.error({ relay: relayUrl, error: err }, 'WebSocket error during query');
                    cleanup();
                    reject(err);
                };

                wsRef.onclose = () => {
                    clearTimeout(timeout);
                };
            });
        } catch (err) {
            log.error({ relay: relayUrl, error: err }, 'Failed to query relay');
        } finally {
            // Ensure WebSocket is closed
            if (ws && ws.readyState !== WebSocket.CLOSED) {
                ws.close();
            }
        }
    });

    await Promise.allSettled(queryPromises);

    log.info({ eventCount: events.length }, 'Query complete');

    return events;
}

/**
 * Query relays for attestations by Bitcoin address
 */
export async function queryByAddress(
    address: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];

    log.info({ address, relayCount: relays.length }, 'Querying relays for address');

    const queryPromises = relays.map(async (relayUrl) => {
        try {
            const ws = new WebSocket(relayUrl);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Query timeout'));
                }, 10000);

                ws.onopen = () => {
                    const subscriptionId = `ochk_addr_${Date.now()}`;
                    ws.send(
                        JSON.stringify([
                            'REQ',
                            subscriptionId,
                            {
                                kinds: [30078],
                                '#address': [address],
                                limit: 10,
                            },
                        ])
                    );
                };

                ws.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            events.push(data[2]);
                        } else if (data[0] === 'EOSE') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    } catch (err) {
                        log.error({ relay: relayUrl, error: err }, 'Failed to parse event');
                    }
                };

                ws.onerror = (err) => {
                    clearTimeout(timeout);
                    log.error({ relay: relayUrl, error: err }, 'WebSocket error during query');
                    reject(err);
                };
            });
        } catch (err) {
            log.error({ relay: relayUrl, error: err }, 'Failed to query relay');
        }
    });

    await Promise.allSettled(queryPromises);

    log.info({ eventCount: events.length }, 'Query complete');

    return events;
}

/**
 * Query relays for attestations by identity (any protocol)
 */
export async function queryByIdentity(
    protocol: string,
    identifier: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];
    const identityTag = `${protocol}:${identifier}`;

    log.info({ protocol, identifier, relayCount: relays.length }, 'Querying relays for identity');

    const queryPromises = relays.map(async (relayUrl) => {
        try {
            const ws = new WebSocket(relayUrl);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Query timeout'));
                }, 10000);

                ws.onopen = () => {
                    const subscriptionId = `ochk_identity_${Date.now()}`;
                    ws.send(
                        JSON.stringify([
                            'REQ',
                            subscriptionId,
                            {
                                kinds: [30078],
                                '#i': [identityTag],
                                limit: 10,
                            },
                        ])
                    );
                };

                ws.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            events.push(data[2]);
                        } else if (data[0] === 'EOSE') {
                            clearTimeout(timeout);
                            ws.close();
                            resolve();
                        }
                    } catch (err) {
                        log.error({ relay: relayUrl, error: err }, 'Failed to parse event');
                    }
                };

                ws.onerror = (err) => {
                    clearTimeout(timeout);
                    log.error({ relay: relayUrl, error: err }, 'WebSocket error during query');
                    reject(err);
                };
            });
        } catch (err) {
            log.error({ relay: relayUrl, error: err }, 'Failed to query relay');
        }
    });

    await Promise.allSettled(queryPromises);

    log.info({ eventCount: events.length }, 'Query complete');

    return events;
}

/**
 * Verify attestation envelope integrity
 * Checks that the attestation ID matches the message hash
 */
export async function verifyAttestationEnvelope(envelope: AttestationEnvelope): Promise<boolean> {
    try {
        // Re-compute attestation ID from message
        const encoder = new TextEncoder();
        const data = encoder.encode(envelope.message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedId = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

        return computedId === envelope.attestation_id;
    } catch (err) {
        log.error({ error: err }, 'Failed to verify attestation envelope');
        return false;
    }
}

/**
 * Parse attestation envelope from Nostr event content
 */
export function parseAttestationFromEvent(event: NostrEvent): AttestationEnvelope | null {
    try {
        const envelope = JSON.parse(event.content) as AttestationEnvelope;
        return envelope;
    } catch (err) {
        log.error({ eventId: event.id, error: err }, 'Failed to parse attestation from event');
        return null;
    }
}
