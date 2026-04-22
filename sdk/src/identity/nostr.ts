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

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bech32 } from '@scure/base';

import { DEFAULT_RELAYS } from '../nostr';
import { createLogger } from '../utils/logger';

const log = createLogger('identity-verification/nostr');

const HEX_64_RE = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

function fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error('odd-length hex');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

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
    const trimmed = npub.trim();
    if (HEX_64_RE.test(trimmed.toLowerCase())) {
        return trimmed.toLowerCase();
    }
    if (!trimmed.toLowerCase().startsWith('npub1')) {
        throw new Error(`not an npub: ${trimmed.slice(0, 12)}…`);
    }
    // `@scure/base` bech32 decoder; unlimited length is fine for NIP-19.
    const decoded = bech32.decode(trimmed.toLowerCase() as `${string}1${string}`, 1023);
    if (decoded.prefix !== 'npub') {
        throw new Error(`bech32 prefix mismatch: expected npub, got ${decoded.prefix}`);
    }
    const bytes = bech32.fromWords(decoded.words);
    if (bytes.length !== 32) {
        throw new Error(`invalid npub payload length: ${bytes.length}`);
    }
    return toHex(Uint8Array.from(bytes));
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
 * return from this function is the ONLY thing that should be treated as
 * proof the event really came from the claimed pubkey.
 */
async function verifyNostrEventSignature(event: NostrEvent): Promise<boolean> {
    try {
        if (
            !event.id ||
            !event.sig ||
            !event.pubkey ||
            typeof event.id !== 'string' ||
            typeof event.sig !== 'string' ||
            typeof event.pubkey !== 'string' ||
            event.sig.length !== 128 ||
            !HEX_64_RE.test(event.id) ||
            !HEX_64_RE.test(event.pubkey)
        ) {
            return false;
        }

        // Recompute the event id from the canonical NIP-01 preimage. If the
        // relay (or an attacker) altered any field since signing, id won't
        // match and we reject.
        const preimage = JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags ?? [],
            event.content ?? '',
        ]);
        const computedId = toHex(sha256(new TextEncoder().encode(preimage)));
        if (computedId !== event.id.toLowerCase()) {
            log.warn(
                { eventId: event.id, computedId },
                'nostr event id does not match its content'
            );
            return false;
        }

        return schnorr.verify(fromHex(event.sig), fromHex(event.id), fromHex(event.pubkey));
    } catch (err) {
        log.warn({ err }, 'schnorr verify threw');
        return false;
    }
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
