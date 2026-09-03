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
 * Default Nostr relays for OrangeCheck attestation publishing and lookup.
 *
 * Well-known relays with good uptime, plus the first-party family relay.
 * `relay.ochk.io` was missing here while attest.ochk.io's verifier has always
 * read from it, so the SDK and the reference implementation were looking in
 * different places — the SDK could miss a family attestation that the hosted
 * API found. It runs a kind allowlist (30078-30087, 30110-30114) and canonical OC d-tag
 * prefixes, and is always co-published alongside the public relays, never the
 * only copy. See https://github.com/orangecheck/oc-relay-infra.
 *
 * Order matters only for readability; queries fan out to all of them and
 * merge. Pass your own `relays` to any query to override this entirely — the
 * protocol does not require trusting any particular relay.
 *
 * A NOTE ON `relay.damus.io`, deliberately kept. It is reachable from a browser
 * (measured ~391ms, real events returned) and NOT reachable from at least one
 * serverless runtime — Vercel's, where it fails to connect on every attempt,
 * consistently, over hours. Its NIP-11 declares no `auth_required`,
 * `payment_required` or `restricted_writes`, so this reads as datacenter-IP
 * filtering in front of it rather than policy, and it can change in either
 * direction without notice.
 *
 * It stays for three reasons: it is one of the most widely read relays, so an
 * attestation published there is findable by the most people; the browser is
 * the dominant path for this SDK (wallet signing happens there), and it works
 * there; and since FANOUT_DEADLINE_MS below is a SHARED budget, a relay that
 * fails to connect resolves immediately and costs no latency. Removing a relay
 * that works for most callers, to tidy a status field on one runtime, is the
 * wrong trade.
 *
 * If you run this SDK server-side and want certainty about coverage, pass
 * `relays` explicitly. Silent partial coverage — believing you reached four
 * relays when you reached three — is the real hazard here, not latency.
 */
export const DEFAULT_RELAYS: string[] = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.ochk.io',
];

/**
 * Wall-clock budget for a whole relay fan-out, shared by every relay in it.
 *
 * Queries below use Promise.allSettled, so a fan-out used to take as long as
 * its SLOWEST relay — and with a dead relay in DEFAULT_RELAYS that meant the
 * per-relay 10s timeout, every single call. Measured on 1.4.0:
 *
 *     check({ addr })  with the old defaults   10.4s
 *     check({ addr })  with the dead relay out   1.0s
 *
 * That is not merely slow, it broke a dependent outright: @orangecheck/gate
 * races check() against a 5s lookupTimeoutMs, so a 10.4s lookup lost the race
 * every time and no address-based gate decision could ever succeed.
 *
 * A shared deadline fixes the class: whichever relay is dead or slow next, a
 * fan-out costs at most this. Healthy relays answer well inside it (~1s for a
 * cold WebSocket plus a query). QUERY_TIMEOUT_MS remains the per-relay ceiling.
 *
 * The value is deliberately BELOW @orangecheck/gate's 5s default
 * lookupTimeoutMs, so a gate decision can still resolve in the worst case
 * rather than always losing its own race. Raising this above 5000 silently
 * breaks that dependent — change both together, or don't.
 */
export const FANOUT_DEADLINE_MS = 4000;
const QUERY_TIMEOUT_MS = 10000;

/** Remaining budget for a relay, given the fan-out's shared deadline. */
function budgetFor(deadlineAt: number): number {
    return Math.max(0, Math.min(QUERY_TIMEOUT_MS, deadlineAt - Date.now()));
}

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
    // NIP-12 relays index SINGLE-LETTER tags only. A multi-letter tag like
    // `address` is stored verbatim and stays readable in the event, but it is
    // never indexed, so no `#address` filter can ever retrieve it. Without the
    // `t` tags below an attestation published by this SDK is invisible to
    // every by-address query on every relay — including attest.ochk.io's own
    // verifier, which queries `#t`. Keep both: `t` is what makes it findable,
    // `address` is human-readable diagnostics and is not load-bearing.
    const tags: string[][] = [
        ['d', envelope.attestation_id], // Parameterized replaceable event identifier (indexed)
        ['t', envelope.address], // Indexed btc-address tag — query with `#t`
        ['t', 'oc-attest'], // Family marker — `#t=["oc-attest"]` for cross-cut discovery
        ['address', envelope.address], // Diagnostic / legacy — relay won't index this
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

    // One shared deadline for the whole fan-out — see FANOUT_DEADLINE_MS.

    const deadlineAt = Date.now() + FANOUT_DEADLINE_MS;

    const publishPromises = relays.map(async (relayUrl) => {
        let ws: WebSocket | null = null;

        // One outcome per relay, first one wins. Without this a relay that
        // ACKs `OK true` and then emits an error or close event during
        // teardown lands in BOTH arrays, and the caller reports "published
        // to 3 · rejected 3" over the same three relays. The `failed.includes`
        // check this replaces only ever de-duplicated `failed` against
        // itself, so it could not catch a success/failure split.
        // attest.ochk.io's copy of this file has carried the guard for a
        // while; this is the back-port.
        let settled = false;
        const recordSuccess = (): void => {
            if (settled) return;
            settled = true;
            success.push(relayUrl);
        };
        const recordFailure = (): void => {
            if (settled) return;
            settled = true;
            failed.push(relayUrl);
        };

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
                }, budgetFor(deadlineAt));

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
                                recordSuccess();
                                cleanup();
                                resolve();
                            } else {
                                log.warn(
                                    { relay: relayUrl, reason: data[3] },
                                    'Relay rejected event'
                                );
                                recordFailure();
                                cleanup();
                                reject(new Error(data[3] || 'Relay rejected event'));
                            }
                        }
                    } catch (err) {
                        log.error(
                            { relay: relayUrl, error: err },
                            'Failed to parse relay response'
                        );
                        recordFailure();
                        cleanup();
                        reject(err);
                    }
                };

                wsRef.onerror = (err) => {
                    log.error({ relay: relayUrl, error: err }, 'WebSocket error');
                    recordFailure();
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
            recordFailure();
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

    // One shared deadline for the whole fan-out — see FANOUT_DEADLINE_MS.

    const deadlineAt = Date.now() + FANOUT_DEADLINE_MS;

    const queryPromises = relays.map(async (relayUrl) => {
        let ws: WebSocket | null = null;

        try {
            ws = new WebSocket(relayUrl);
            const wsRef = ws; // Capture for closures

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    wsRef.close();
                    reject(new Error('Query timeout'));
                }, budgetFor(deadlineAt));

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

    // One shared deadline for the whole fan-out — see FANOUT_DEADLINE_MS.

    const deadlineAt = Date.now() + FANOUT_DEADLINE_MS;

    const queryPromises = relays.map(async (relayUrl) => {
        try {
            const ws = new WebSocket(relayUrl);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Query timeout'));
                }, budgetFor(deadlineAt));

                ws.onopen = () => {
                    const subscriptionId = `ochk_addr_${Date.now()}`;
                    ws.send(
                        JSON.stringify([
                            'REQ',
                            subscriptionId,
                            {
                                kinds: [30078],
                                // `#t`, NOT `#address`: NIP-12 relays index
                                // single-letter tags only, so `#address`
                                // matched nothing on any relay and this
                                // function returned empty for every real
                                // attestation. attest.ochk.io's verifier has
                                // queried `#t` since the same fix landed
                                // there; this is the back-port.
                                '#t': [address],
                                limit: 50,
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

    // One shared deadline for the whole fan-out — see FANOUT_DEADLINE_MS.

    const deadlineAt = Date.now() + FANOUT_DEADLINE_MS;

    const queryPromises = relays.map(async (relayUrl) => {
        try {
            const ws = new WebSocket(relayUrl);

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('Query timeout'));
                }, budgetFor(deadlineAt));

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
