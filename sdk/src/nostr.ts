/**
 * Nostr Integration for OrangeCheck Protocol
 *
 * Implements NIP-78 (Application-specific data) for attestation publishing
 */

import type { AttestationEnvelope, IdentityBinding, NostrEvent } from './types';

import { nostrEventSignatureValid } from './nostr-crypto';
import { nostrIdentifierForms } from './nostr-pubkey';
import { createLogger } from './utils/logger';
import { rfc3339Ms } from './utils/time';
import { parseCanonicalMessage, signatureIsValid } from './verify';

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
    // relay.snort.social sat here until 2026-10-21. It now runs in memory: it
    // answered OK true to family events and served none of them back.
    'wss://nostr.oxtr.dev',
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

/** Events asked for per page: relays commonly cap one REQ at 500. */
const PAGE_LIMIT = 500;
/**
 * Pages read per relay for one subject. Anyone can publish events under a
 * subject's tags, so a lookup reads every event a relay holds for it up to
 * PAGE_LIMIT × MAX_PAGES (2,000), newest first, and leaves the choice to the
 * signatures. An older event goes unread only when every queried relay holds
 * more than that many newer events for the same subject.
 */
const MAX_PAGES = 4;

/**
 * How one relay's read of a subject ended. complete: its last page came back
 * short, so it sent every event it holds there. cut_off: it sent a full page
 * that could not be read past (a page that added nothing, which is stuck on one
 * second, or the page bound), or it stopped (a timeout, a CLOSED, a dropped
 * socket) after sending something. no_answer: it sent nothing.
 *
 * Anyone can publish under a subject's tags, and relays answer newest first up
 * to their cap, so only a complete read says what a relay does not hold.
 */
export type SubjectReadState = 'complete' | 'cut_off' | 'no_answer';

export interface SubjectRead {
    /** Every event any relay sent, as sent (one entry per relay that sent it). */
    events: NostrEvent[];
    relays: { relay: string; state: SubjectReadState }[];
}

/** Relays a write is in effect on, as OC Chat SPEC §8.7 and oc-lock-web count it. */
const WRITE_QUORUM = 2;

/**
 * Whether an absence in `read` counts: at least the read floor of the relays
 * asked (those asked, less the write quorum, plus one) finished with a short
 * page, and none was cut off. The rule oc-lock-web and oc-www read revocations by.
 */
export function subjectReadComplete(read: Pick<SubjectRead, 'relays'>): boolean {
    const floor = Math.max(1, read.relays.length - WRITE_QUORUM + 1);
    const complete = read.relays.filter((r) => r.state === 'complete').length;
    return complete >= floor && !read.relays.some((r) => r.state === 'cut_off');
}

/** Every event matching `filter` on each relay, paged by `until`, with how each relay's read ended. */
export async function readSubject(
    filter: Record<string, unknown>,
    relays: string[],
    label: string
): Promise<SubjectRead> {
    const events: NostrEvent[] = [];
    const deadlineAt = Date.now() + FANOUT_DEADLINE_MS;

    const states = await Promise.all(
        relays.map(async (relayUrl): Promise<SubjectReadState> => {
            let ws: WebSocket | null = null;
            let sent = 0;
            const stopped = (): SubjectReadState => (sent > 0 ? 'cut_off' : 'no_answer');
            try {
                ws = new WebSocket(relayUrl);
                const wsRef = ws;
                return await new Promise<SubjectReadState>((resolve) => {
                    let settled = false;
                    const finish = (state: SubjectReadState) => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeout);
                        try {
                            wsRef.close();
                        } catch {
                            // already closed
                        }
                        resolve(state);
                    };
                    const timeout = setTimeout(() => finish(stopped()), budgetFor(deadlineAt));
                    const seen = new Set<string>();
                    let page = 0;
                    let inPage = 0;
                    let newInPage = 0;
                    let oldest = Infinity;
                    let sub = '';

                    const ask = () => {
                        page++;
                        inPage = 0;
                        newInPage = 0;
                        sub = `ochk_${label}_${Date.now()}_${page}`;
                        // `until` is inclusive; events already read are skipped by id.
                        const until = Number.isFinite(oldest) ? { until: oldest } : {};
                        wsRef.send(JSON.stringify(['REQ', sub, { ...filter, ...until, limit: PAGE_LIMIT }]));
                    };

                    wsRef.onopen = ask;
                    wsRef.onmessage = (msg) => {
                        try {
                            const data = JSON.parse(msg.data);
                            if (data[1] !== sub) return;
                            if (data[0] === 'EVENT') {
                                const event = data[2] as NostrEvent;
                                const key = event.id ?? JSON.stringify(event);
                                inPage++;
                                sent++;
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    newInPage++;
                                    events.push(event);
                                }
                                if (typeof event.created_at === 'number') {
                                    oldest = Math.min(oldest, event.created_at);
                                }
                            } else if (data[0] === 'CLOSED') {
                                // Refused or ended (a rate limit, too many filters): not an answer.
                                finish(stopped());
                            } else if (data[0] === 'EOSE') {
                                wsRef.send(JSON.stringify(['CLOSE', sub]));
                                // A short page is the end of the subject on this relay.
                                if (inPage < PAGE_LIMIT) return finish('complete');
                                // A full page that added nothing is stuck on one second; the
                                // page bound leaves older events unread. Either is cut off.
                                if (newInPage === 0 || page >= MAX_PAGES) return finish('cut_off');
                                ask();
                            }
                        } catch (err) {
                            log.error({ relay: relayUrl, error: err }, 'Failed to parse event');
                        }
                    };
                    wsRef.onerror = (err) => {
                        log.error({ relay: relayUrl, error: err }, 'WebSocket error during query');
                        finish(stopped());
                    };
                    wsRef.onclose = () => finish(stopped());
                });
            } catch (err) {
                log.error({ relay: relayUrl, error: err }, 'Failed to query relay');
                return stopped();
            } finally {
                if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
            }
        })
    );

    log.info({ label, eventCount: events.length }, 'Query complete');
    return { events, relays: relays.map((relay, i) => ({ relay, state: states[i]! })) };
}

/** Every event matching `filter` on each relay, paged by `until`, within the shared deadline. */
async function querySubject(
    filter: Record<string, unknown>,
    relays: string[],
    label: string
): Promise<NostrEvent[]> {
    return (await readSubject(filter, relays, label)).events;
}

/**
 * Query relays for every event under an attestation id's `d` tag. Anyone can
 * publish an event with that tag, so the copies are read and the signature
 * decides between them (see collectSignedEnvelopes).
 */
export async function queryByAttestationId(
    attestationId: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    log.info({ attestationId, relayCount: relays.length }, 'Querying relays for attestation');
    return querySubject({ kinds: [30078], '#d': [attestationId] }, relays, 'id');
}

/**
 * Query relays for attestations by Bitcoin address. Relays index
 * single-letter tags only, so the address is the `t` tag, not `address`.
 */
export async function queryByAddress(
    address: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    return (await readByAddress(address, relays)).events;
}

/**
 * queryByAddress, with how each relay's read ended: what a decision resting on
 * an attestation NOT being there reads, under subjectReadComplete.
 */
export async function readByAddress(
    address: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<SubjectRead> {
    log.info({ address, relayCount: relays.length }, 'Querying relays for address');
    return readSubject({ kinds: [30078], '#t': [address] }, relays, 'addr');
}

/**
 * Query relays for attestations by identity (any protocol)
 */
export async function queryByIdentity(
    protocol: string,
    identifier: string,
    relays: string[] = DEFAULT_RELAYS
): Promise<NostrEvent[]> {
    const identityTags =
        protocol === 'nostr'
            ? nostrIdentifierForms(identifier).map((f) => `nostr:${f}`)
            : [`${protocol}:${identifier}`];
    log.info({ protocol, identifier, relayCount: relays.length }, 'Querying relays for identity');
    return querySubject({ kinds: [30078], '#i': identityTags }, relays, 'identity');
}

/**
 * Query relays for the most recent attestations across every publisher.
 *
 * For aggregate views (network stats, a recent-activity feed), not per-subject
 * lookups. Filters on the `#t=["oc-attest"]` family marker because kind 30078
 * is shared by every NIP-78 app: an unfiltered window fills with other apps'
 * data. Each event is checked under NIP-01 before anything is merged (OC Attest
 * §7.2). Returns one envelope per attestation_id: the first copy whose
 * signature verifies for the address its message names (§6.1 rule 4). An id
 * with no such copy is left out, so a copy with a junk signature is never
 * counted. Bond and score are not checked: call check() before acting on one.
 */
export async function queryRecent(
    relays: string[] = DEFAULT_RELAYS,
    limit: number = 200
): Promise<AttestationEnvelope[]> {
    const events: NostrEvent[] = [];

    log.info({ relayCount: relays.length, limit }, 'Querying relays for recent attestations');

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
                    const subscriptionId = `ochk_recent_${Date.now()}`;
                    ws.send(
                        JSON.stringify([
                            'REQ',
                            subscriptionId,
                            { kinds: [ATTESTATION_EVENT_KIND], '#t': ['oc-attest'], limit },
                        ])
                    );
                };

                ws.onmessage = (msg) => {
                    try {
                        const data = JSON.parse(msg.data);
                        if (data[0] === 'EVENT') {
                            const ev = data[2] as NostrEvent;
                            // A relay can send anything under any id: only an event that is
                            // what it claims, of the kind and marker asked for, is kept.
                            if (
                                !nostrEventSignatureValid(ev) ||
                                ev.kind !== ATTESTATION_EVENT_KIND ||
                                !ev.tags.some((t) => t[0] === 't' && t[1] === 'oc-attest')
                            )
                                return;
                            const scheme = ev.tags?.find((t) => t[0] === 'scheme')?.[1];
                            const dTag = ev.tags?.find((t) => t[0] === 'd')?.[1];
                            if ((scheme === 'bip322' || scheme === 'legacy') && dTag) {
                                events.push(ev);
                            }
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

    const envelopes = await collectSignedEnvelopes(events, undefined, { validOnly: true });

    log.info({ eventCount: events.length, unique: envelopes.length }, 'Recent query complete');

    return envelopes;
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

function base64Url(text: string): string {
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * The envelope with every field the signature covers read from its message.
 *
 * Only `message` and `signature` are signed. `address`, `identities`,
 * `issued_at`, `expires_at` and `message_b64url` are copies beside them, so
 * they are taken from the message here. Null when the message names no address
 * or no RFC 3339 `issued_at`, or signs any key twice.
 */
export function signedEnvelope(envelope: AttestationEnvelope): AttestationEnvelope | null {
    let parsed: ReturnType<typeof parseCanonicalMessage>;
    try {
        parsed = parseCanonicalMessage(envelope.message);
    } catch {
        return null;
    }
    if (!parsed.core.address || rfc3339Ms(parsed.core.issued_at) === null) return null;
    if (parsed.repeated.length > 0) return null;
    const { expires_at: _copy, ...rest } = envelope;
    return {
        ...rest,
        address: parsed.core.address,
        identities: parsed.core.identities,
        issued_at: parsed.core.issued_at,
        ...(parsed.expires !== undefined ? { expires_at: parsed.expires } : {}),
        message_b64url: base64Url(envelope.message),
    };
}

/**
 * One envelope per attestation id, its fields read from its signed message.
 *
 * Anyone can publish a copy of an attestation under their own Nostr key, with
 * any signature beside the message. When copies of one id disagree on the
 * signature, the first whose signature is valid is kept. With `validOnly`,
 * every id's copy is checked, and an id with no valid copy is left out.
 */
export async function collectSignedEnvelopes(
    events: NostrEvent[],
    accept: (event: NostrEvent, envelope: AttestationEnvelope) => boolean = () => true,
    opts: { validOnly?: boolean } = {}
): Promise<AttestationEnvelope[]> {
    const copies = new Map<string, AttestationEnvelope[]>();
    for (const event of events) {
        const raw = parseAttestationFromEvent(event);
        if (!raw || !(await verifyAttestationEnvelope(raw))) continue;
        const envelope = signedEnvelope(raw);
        if (!envelope || !accept(event, envelope)) continue;
        const same = copies.get(envelope.attestation_id) ?? [];
        if (!same.some((e) => e.signature === envelope.signature && e.scheme === envelope.scheme)) {
            same.push(envelope);
        }
        copies.set(envelope.attestation_id, same);
    }
    const kept: AttestationEnvelope[] = [];
    for (const same of copies.values()) {
        if (same.length === 1 && !opts.validOnly) {
            kept.push(same[0]!);
            continue;
        }
        let valid: AttestationEnvelope | undefined;
        for (const e of same) {
            if (await signatureIsValid({ addr: e.address, msg: e.message, sig: e.signature, scheme: e.scheme })) {
                valid = e;
                break;
            }
        }
        if (valid) kept.push(valid);
        else if (!opts.validOnly) kept.push(same[0]!);
    }
    return kept;
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
