/**
 * @orangecheck/nostr-core
 *
 * Browser-compatible Nostr client used by every OrangeCheck family web
 * app. Raw NIP-01 over WebSocket against a list of relays. Every operation
 * races all relays in parallel and reports per-relay status so the caller
 * can distinguish "nobody replied" from "one relay rejected." Retries with
 * exponential backoff on transport errors only.
 *
 * No dependencies — uses the platform `WebSocket` global. Works in any
 * runtime that ships a WHATWG WebSocket (browser, Node 22+, Deno, Bun,
 * Cloudflare Workers).
 *
 * Source-of-truth `DEFAULT_RELAYS` for the OC family. Co-publishes to four
 * public relays plus `wss://relay.ochk.io` (the family's first-party
 * kind-allowlisted relay — see https://github.com/orangecheck/oc-relay-infra).
 *
 * **Hard invariant:** `DEFAULT_RELAYS` MUST contain at least two entries,
 * and MUST NOT be `relay.ochk.io` alone. Enforced at the type level — a
 * future engineer simplifying to ours-only fails `tsc`. See `_validate`
 * below.
 */

// ─────────────────────────────────────────────────────────────────────────
// Build-time invariants + default relay set.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Family-relay invariants applied to `DEFAULT_RELAYS`. The relay set must:
 *   1. Contain at least two relays — single-relay defaults are always wrong
 *      because the family's BYPASS principle requires public-relay co-publish.
 *   2. Not be `wss://relay.ochk.io` alone — relay.ochk.io is additive, never
 *      a single point of failure. See oc-relay-infra/BYPASS.md.
 *
 * If `T` violates either rule, this resolves to `never` and the assignment
 * below fails at `tsc` time.
 */
type ValidRelaySet<T extends readonly string[]> =
    T['length'] extends 0 | 1 ? never :
    T extends readonly ['wss://relay.ochk.io'] ? never :
    T;

const _RELAYS: ValidRelaySet<readonly [
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://offchain.pub',
    'wss://relay.ochk.io',
]> = [
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.primal.net',
    'wss://offchain.pub',
    // First-party family relay — kind allowlist 30078–30086 + canonical
    // OC d-tag prefixes. Always co-published with public relays; never
    // the only copy. See https://github.com/orangecheck/oc-relay-infra.
    'wss://relay.ochk.io',
] as const;

/**
 * Default relay set for OrangeCheck family Nostr publishes + queries.
 *
 * Frozen at runtime; consumers MAY pass an explicit `relays` arg to any
 * function in this package to override.
 */
export const DEFAULT_RELAYS: readonly string[] = Object.freeze([..._RELAYS]);

// ─────────────────────────────────────────────────────────────────────────
// Wire types — NIP-01 event + filter + result shapes.
// ─────────────────────────────────────────────────────────────────────────

export interface NostrEvent {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    content: string;
    tags: string[][];
    sig: string;
}

export interface PublishResult {
    relay: string;
    ok: boolean;
    reason?: string;
    attempts: number;
}

export interface Filter {
    kinds?: number[];
    authors?: string[];
    ids?: string[];
    limit?: number;
    since?: number;
    until?: number;
    /** NIP-12 indexable `d`-tag filter. */
    '#d'?: string[];
    /** NIP-12 indexable single-letter tag filter. */
    '#t'?: string[];
    /** Used by OC Vote (kind 30081 ballots). */
    '#poll_id'?: string[];
    /** Used by OC Vote (kind 30081 ballots). */
    '#voter'?: string[];
    /** Used by OC Vote (kind 30080 polls). */
    '#creator'?: string[];
    /** Other indexable single-letter tags clients may filter on. */
    [key: `#${string}`]: string[] | undefined;
}

export interface QueryResult {
    events: NostrEvent[];
    relayStatus: { relay: string; ok: boolean; reason?: string; events: number }[];
}

// ─────────────────────────────────────────────────────────────────────────
// Internal — frame parsing + retry config.
// ─────────────────────────────────────────────────────────────────────────

type FrameType = 'OK' | 'EVENT' | 'EOSE' | 'NOTICE' | 'CLOSED';
interface RelayFrame {
    type: FrameType;
    payload: unknown[];
}

function parseFrame(raw: string): RelayFrame | null {
    try {
        const arr = JSON.parse(raw) as unknown[];
        if (!Array.isArray(arr) || arr.length === 0) return null;
        const type = arr[0];
        if (
            type === 'OK' ||
            type === 'EVENT' ||
            type === 'EOSE' ||
            type === 'NOTICE' ||
            type === 'CLOSED'
        ) {
            return { type: type as FrameType, payload: arr.slice(1) };
        }
        return null;
    } catch {
        return null;
    }
}

interface RetryOptions {
    attempts: number;
    timeoutMs: number;
    initialBackoffMs: number;
    maxBackoffMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
    attempts: 3,
    timeoutMs: 5000,
    initialBackoffMs: 500,
    maxBackoffMs: 4000,
};

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────
// Publish — write an event to one or more relays in parallel, with retry.
// ─────────────────────────────────────────────────────────────────────────

async function publishOne(
    url: string,
    event: NostrEvent,
    retry: RetryOptions
): Promise<PublishResult> {
    let attempts = 0;
    let backoff = retry.initialBackoffMs;
    let lastReason: string | undefined;

    while (attempts < retry.attempts) {
        attempts++;
        const attempt = await attemptPublish(url, event, retry.timeoutMs);
        if (attempt.ok) {
            return {
                relay: url,
                ok: true,
                attempts,
                ...(attempt.reason ? { reason: attempt.reason } : {}),
            };
        }
        lastReason = attempt.reason;
        if (attempt.retryable && attempts < retry.attempts) {
            await delay(backoff);
            backoff = Math.min(backoff * 2, retry.maxBackoffMs);
            continue;
        }
        break;
    }
    return {
        relay: url,
        ok: false,
        attempts,
        ...(lastReason ? { reason: lastReason } : {}),
    };
}

function attemptPublish(
    url: string,
    event: NostrEvent,
    timeoutMs: number
): Promise<{ ok: boolean; reason?: string; retryable: boolean }> {
    return new Promise((resolve) => {
        let settled = false;
        let ws: WebSocket | null = null;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
                ws?.close();
            } catch {}
            resolve({ ok: false, reason: 'timeout', retryable: true });
        }, timeoutMs);
        try {
            ws = new WebSocket(url);
            ws.onopen = () => ws?.send(JSON.stringify(['EVENT', event]));
            ws.onmessage = (msg) => {
                const frame = parseFrame(msg.data as string);
                if (!frame) return;
                if (frame.type === 'OK' && frame.payload[0] === event.id) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    try {
                        ws?.close();
                    } catch {}
                    const ok = frame.payload[1] === true;
                    const reason = frame.payload[2] as string | undefined;
                    resolve({
                        ok,
                        ...(reason ? { reason } : {}),
                        retryable: false,
                    });
                }
            };
            ws.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ ok: false, reason: 'websocket_error', retryable: true });
            };
            ws.onclose = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ ok: false, reason: 'closed_early', retryable: true });
            };
        } catch (err) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({
                ok: false,
                reason: err instanceof Error ? err.message : 'unknown',
                retryable: true,
            });
        }
    });
}

/**
 * Publish a NIP-01 event to all `relays` in parallel. Returns one
 * `PublishResult` per relay. Default timeout 5000ms.
 */
export async function publishEvent(
    event: NostrEvent,
    relays: readonly string[] = DEFAULT_RELAYS,
    timeoutMs = 5000
): Promise<PublishResult[]> {
    const retry: RetryOptions = { ...DEFAULT_RETRY, timeoutMs };
    return Promise.all(relays.map((r) => publishOne(r, event, retry)));
}

// ─────────────────────────────────────────────────────────────────────────
// Query — REQ → EOSE → close. Races all relays; first to EOSE wins.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Issue a NIP-01 REQ across all `relays` in parallel. Returns deduplicated
 * events sorted newest-first plus per-relay status.
 *
 * Default timeout 1500ms — short enough that a momentary blip on any one
 * relay (including relay.ochk.io) never holds up the racing reads. Pass an
 * explicit `timeoutMs` for slow filters or for use cases where waiting on
 * the slowest relay matters.
 */
export async function queryEvents(
    filter: Filter,
    relays: readonly string[] = DEFAULT_RELAYS,
    timeoutMs = 1500
): Promise<QueryResult> {
    const subId = 'ocnc-' + Math.random().toString(36).slice(2, 10);
    const byId = new Map<string, NostrEvent>();
    const status: QueryResult['relayStatus'] = [];

    await Promise.all(
        relays.map(
            (url) =>
                new Promise<void>((resolve) => {
                    let settled = false;
                    let count = 0;
                    let reason: string | undefined;
                    let ws: WebSocket | null = null;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        try {
                            ws?.close();
                        } catch {}
                        status.push({
                            relay: url,
                            ok: count > 0,
                            reason: reason ?? 'timeout',
                            events: count,
                        });
                        resolve();
                    }, timeoutMs);
                    try {
                        ws = new WebSocket(url);
                        ws.onopen = () => ws?.send(JSON.stringify(['REQ', subId, filter]));
                        ws.onmessage = (msg) => {
                            const frame = parseFrame(msg.data as string);
                            if (!frame) return;
                            if (frame.type === 'EVENT' && frame.payload[0] === subId) {
                                const event = frame.payload[1] as NostrEvent | undefined;
                                if (event && event.id) {
                                    byId.set(event.id, event);
                                    count++;
                                }
                            } else if (frame.type === 'EOSE' && frame.payload[0] === subId) {
                                if (settled) return;
                                settled = true;
                                clearTimeout(timer);
                                try {
                                    ws?.send(JSON.stringify(['CLOSE', subId]));
                                    ws?.close();
                                } catch {}
                                status.push({ relay: url, ok: true, events: count });
                                resolve();
                            } else if (frame.type === 'NOTICE') {
                                reason = String(frame.payload[0] ?? 'notice');
                            }
                        };
                        ws.onerror = () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            status.push({
                                relay: url,
                                ok: false,
                                reason: 'ws_error',
                                events: count,
                            });
                            resolve();
                        };
                        ws.onclose = () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            status.push({
                                relay: url,
                                ok: count > 0,
                                reason: reason ?? 'closed_early',
                                events: count,
                            });
                            resolve();
                        };
                    } catch (err) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        status.push({
                            relay: url,
                            ok: false,
                            reason: err instanceof Error ? err.message : 'unknown',
                            events: count,
                        });
                        resolve();
                    }
                })
        )
    );

    return {
        events: Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at),
        relayStatus: status,
    };
}
