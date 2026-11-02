/**
 * Nostr Identity Verification
 * Verifies that a user controls a Nostr identity by checking for proof events
 *
 * Two previous bugs in this file made verification a lie:
 *   1. `npubToHex` returned the bech32 string unchanged when given an npub
 *      (only the already-hex branch worked). Downstream authors filters used
 *      "npub1…" as a literal Nostr pubkey, which no relay indexes — so the
 *      search *always* returned zero events and fell through to "no proof".
 *      Benign false-negative, except combined with (2).
 *   2. `verifyNostrEventSignature` returned `true` for any event with a
 *      128-char-hex-looking `sig`. No actual schnorr check. An attacker
 *      could publish a note from any pubkey, drop someone else's attestation
 *      ID into its content, and the verifier would accept.
 *
 * Fixed by decoding npubs with @scure/base's bech32 and verifying the event
 * signature with @noble/curves' schnorr over sha256(id-preimage).
 */

import type { NostrEvent } from '../types';


import { DEFAULT_RELAYS } from '../nostr';
import { nostrEventSignatureValid } from '../nostr-crypto';
import { nostrPubkeyToHex } from '../nostr-pubkey';
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
 * Decode a Nostr public key in `npub1…` bech32 form (or pass through if
 * already 64-char hex). Throws on invalid input — callers should treat a
 * throw as "not a valid npub" and fail closed.
 */
function npubToHex(npub: string): string {
    const hex = nostrPubkeyToHex(npub);
    if (!hex) throw new Error(`not an npub: ${npub.trim().slice(0, 12)}…`);
    return hex;
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
 * Verify a Nostr event's schnorr signature per NIP-01:
 *
 *   id    = sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))
 *   sig   = schnorr_sign(id, secret_key)
 *   check = schnorr_verify(id, pubkey, sig)
 *
 * Fails closed on any shape problem, decoding error, or mismatch. A true
 * return proves the event came from its own `pubkey`, not from the identity
 * being verified: the caller still checks that `pubkey` is that identity.
 */
async function verifyNostrEventSignature(event: NostrEvent): Promise<boolean> {
    return nostrEventSignatureValid(event);
}


/**
 * Verify that a user controls a Nostr identity
 *
 * Verification method:
 * 1. Query Nostr relays for kind 1 (text note) events from the claimed npub
 * 2. Keep only kind 1 events whose pubkey is the claimed npub's: a relay may
 *    return notes by other keys
 * 3. Check if any event content contains the attestation ID
 * 4. Verify the event signature
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

        // A relay can answer with any author's note, whatever the filter asked
        // for; only this npub's own kind-1 counts (as oc-attest-web's verifier).
        for (const event of events) {
            if (
                event.pubkey === pubkeyHex &&
                event.kind === 1 &&
                event.content.includes(attestationId)
            ) {
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
 * This is a quick check that doesn't re-query relays. Each cached note's id and
 * signature are still checked, since the cache holds what a relay sent.
 */
export function isNostrIdentityVerified(
    attestationId: string,
    npub: string,
    cachedEvents: NostrEvent[]
): boolean {
    const pubkeyHex = npubToHex(npub);

    return cachedEvents.some(
        (event) =>
            event.pubkey === pubkeyHex &&
            event.kind === 1 &&
            event.content.includes(attestationId) &&
            nostrEventSignatureValid(event)
    );
}
