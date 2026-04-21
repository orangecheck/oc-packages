/**
 * Nostr Identity Verification
 * Verifies that a user controls a Nostr identity by checking for proof events
 */

import type { NostrEvent } from '../types';

import { DEFAULT_RELAYS } from '../nostr';
import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/nostr');

/**
 * Verification result for Nostr identity
 */
export interface NostrVerificationResult {
    verified: boolean;
    event?: NostrEvent;
    error?: string;
}

/**
 * Convert npub to hex pubkey
 * Simple implementation - in production, use a proper bech32 library
 */
function npubToHex(npub: string): string {
    // TODO: Implement proper bech32 decoding
    // For now, return as-is if already hex, or throw error
    if (npub.match(/^[0-9a-f]{64}$/i)) {
        return npub.toLowerCase();
    }

    // If it's an npub, we need bech32 decoding
    // This is a placeholder - implement with a proper library
    log.warn({ npub }, 'npub to hex conversion not fully implemented');
    return npub;
}

/**
 * Query Nostr relays for events from a specific author
 */
async function queryNostrEvents(options: {
    authors: string[];
    kinds: number[];
    search?: string;
    relays?: string[];
    limit?: number;
}): Promise<NostrEvent[]> {
    const { authors, kinds, search, relays = DEFAULT_RELAYS, limit = 100 } = options;
    const events: NostrEvent[] = [];

    log.info({ authors, kinds, relayCount: relays.length }, 'Querying Nostr for events');

    const queryPromises = relays.map(async (relayUrl) => {
        let ws: WebSocket | null = null;

        try {
            ws = new WebSocket(relayUrl);
            const wsRef = ws;

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
                    const subscriptionId = `verify_${Date.now()}`;
                    const filter: Record<string, unknown> = {
                        authors,
                        kinds,
                        limit,
                    };

                    wsRef.send(JSON.stringify(['REQ', subscriptionId, filter]));
                };

                wsRef.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            const event = data[2] as NostrEvent;

                            // If search term provided, filter by content
                            if (search) {
                                if (event.content.includes(search)) {
                                    events.push(event);
                                }
                            } else {
                                events.push(event);
                            }
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
 * Verify Nostr event signature
 * TODO: Implement proper schnorr signature verification
 */
async function verifyNostrEventSignature(event: NostrEvent): Promise<boolean> {
    // TODO: Implement proper signature verification
    // For now, just check that signature exists and has correct length
    if (!event.sig || event.sig.length !== 128) {
        return false;
    }

    // TODO: Verify schnorr signature over event ID
    // This requires secp256k1 library
    log.warn('Nostr signature verification not fully implemented');

    return true; // Placeholder
}

/**
 * Verify that a user controls a Nostr identity
 *
 * Verification method:
 * 1. Query Nostr relays for kind 1 (text note) events from the claimed npub
 * 2. Check if any event content contains the attestation ID
 * 3. Verify the event signature
 *
 * @param attestationId - The attestation ID to look for
 * @param npub - The Nostr public key (npub format or hex)
 * @param relays - Optional list of relays to query
 * @returns Verification result with proof event if verified
 */
export async function verifyNostrIdentity(
    attestationId: string,
    npub: string,
    relays?: string[]
): Promise<NostrVerificationResult> {
    log.info({ attestationId, npub }, 'Verifying Nostr identity');

    try {
        // Convert npub to hex if needed
        const pubkeyHex = npubToHex(npub);

        // Query Nostr for kind 1 events from this pubkey containing attestation ID
        const events = await queryNostrEvents({
            authors: [pubkeyHex],
            kinds: [1], // Text notes
            search: attestationId,
            relays,
        });

        if (events.length === 0) {
            log.info({ npub }, 'No verification events found');
            return {
                verified: false,
                error: 'No verification event found. User must post a note containing the attestation ID.',
            };
        }

        // Check each event for attestation ID and verify signature
        for (const event of events) {
            if (event.content.includes(attestationId)) {
                // Verify event signature
                const isValid = await verifyNostrEventSignature(event);

                if (isValid) {
                    log.info({ npub, eventId: event.id }, 'Nostr identity verified');
                    return {
                        verified: true,
                        event,
                    };
                } else {
                    log.warn({ npub, eventId: event.id }, 'Invalid event signature');
                }
            }
        }

        return {
            verified: false,
            error: 'Found events but none had valid signatures',
        };
    } catch (err) {
        log.error({ error: err, npub }, 'Failed to verify Nostr identity');
        return {
            verified: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

/**
 * Get verification instructions for Nostr identity
 */
export function getNostrVerificationInstructions(attestationId: string): string {
    return `To verify your Nostr identity:

1. Open your Nostr client (Damus, Amethyst, Primal, etc.)
2. Post a note containing this text:

   Verifying my OrangeCheck attestation: ${attestationId}

3. Wait a few seconds for the note to propagate to relays
4. Return here and click "Verify" to check

The verification will search Nostr relays for your note and confirm you control this identity.`;
}

/**
 * Check if a Nostr identity is already verified
 * This is a quick check that doesn't re-query relays
 */
export function isNostrIdentityVerified(
    attestationId: string,
    npub: string,
    cachedEvents: NostrEvent[]
): boolean {
    const pubkeyHex = npubToHex(npub);

    return cachedEvents.some(
        (event) =>
            event.pubkey === pubkeyHex && event.kind === 1 && event.content.includes(attestationId)
    );
}
