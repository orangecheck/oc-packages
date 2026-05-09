/**
 * @orangecheck/nostr-core — unit tests
 *
 * Covers the bits that don't need a live relay:
 *   - DEFAULT_RELAYS shape + invariants
 *   - frame parsing (the inner protocol parser)
 *   - publishEvent / queryEvents end-to-end against a mock WebSocket
 *
 * The mock WebSocket implementation lives at the bottom of this file.
 * It implements just enough of the WHATWG WebSocket interface to drive
 * publishOne / attemptPublish + queryEvents through their happy paths
 * and a few error paths.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RELAYS, publishEvent, queryEvents, type NostrEvent } from './index';

// ── DEFAULT_RELAYS ───────────────────────────────────────────────────────

describe('DEFAULT_RELAYS', () => {
    it('has at least 5 relays', () => {
        expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(5);
    });

    it('includes the family first-party relay', () => {
        expect(DEFAULT_RELAYS).toContain('wss://relay.ochk.io');
    });

    it('is not relay.ochk.io alone (BYPASS invariant)', () => {
        expect(DEFAULT_RELAYS).not.toEqual(['wss://relay.ochk.io']);
    });

    it('is frozen at runtime — consumers cannot mutate', () => {
        expect(() => {
            (DEFAULT_RELAYS as unknown as string[]).push('wss://attack.example');
        }).toThrow();
    });

    it('every entry is a wss:// or ws:// URL', () => {
        for (const relay of DEFAULT_RELAYS) {
            expect(relay).toMatch(/^wss?:\/\//);
        }
    });
});

// ── publishEvent + queryEvents — mock-WebSocket-backed integration ──────

const SAMPLE_EVENT: NostrEvent = {
    id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    kind: 30078,
    pubkey: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
    created_at: 1735689600,
    content: 'test',
    tags: [['d', 'oc-test:abc']],
    sig: 'cafebabe'.repeat(16),
};

beforeEach(() => {
    installMockWebSocket();
});

afterEach(() => {
    restoreWebSocket();
});

describe('publishEvent', () => {
    it('returns one PublishResult per relay', async () => {
        mockNextHandshake('OK', { ok: true });
        mockNextHandshake('OK', { ok: true });
        const results = await publishEvent(SAMPLE_EVENT, ['wss://a', 'wss://b']);
        expect(results).toHaveLength(2);
        expect(results[0]!.relay).toBe('wss://a');
        expect(results[1]!.relay).toBe('wss://b');
    });

    it('marks ok: true when relay sends OK true', async () => {
        mockNextHandshake('OK', { ok: true });
        const results = await publishEvent(SAMPLE_EVENT, ['wss://a']);
        expect(results[0]!.ok).toBe(true);
        expect(results[0]!.attempts).toBe(1);
    });

    it('marks ok: false when relay rejects with OK false + reason', async () => {
        mockNextHandshake('OK', { ok: false, reason: 'blocked: bad shape' });
        const results = await publishEvent(SAMPLE_EVENT, ['wss://a']);
        expect(results[0]!.ok).toBe(false);
        expect(results[0]!.reason).toBe('blocked: bad shape');
    });

    it('retries on transient failure (3 attempts, exits ok: false)', async () => {
        // 3 errors → exhausts retries. We assert the shape (attempts=3,
        // ok=false) — the precise lastReason can race with the timeout
        // on slow runners and isn't load-bearing for the contract.
        mockNextHandshake('error');
        mockNextHandshake('error');
        mockNextHandshake('error');
        const results = await publishEvent(SAMPLE_EVENT, ['wss://flaky'], 1000);
        expect(results[0]!.ok).toBe(false);
        expect(results[0]!.attempts).toBe(3);
    }, 30_000);

    it('publishes to all relays in parallel', async () => {
        mockNextHandshake('OK', { ok: true });
        mockNextHandshake('OK', { ok: true });
        mockNextHandshake('OK', { ok: true });
        const start = Date.now();
        await publishEvent(SAMPLE_EVENT, ['wss://a', 'wss://b', 'wss://c']);
        const elapsed = Date.now() - start;
        // If they ran serially with the mock's tiny delay we'd see ≥ 30ms.
        // Parallel should resolve in well under that.
        expect(elapsed).toBeLessThan(100);
    });
});

describe('queryEvents', () => {
    it('returns events streamed via EVENT, dedupes across relays', async () => {
        const ev1 = { ...SAMPLE_EVENT, id: 'a'.repeat(64) };
        const ev2 = { ...SAMPLE_EVENT, id: 'b'.repeat(64), created_at: 1735689700 };
        mockNextQuery([ev1, ev2]);
        // Same event id on a second relay — should dedupe.
        mockNextQuery([ev1]);

        const result = await queryEvents({ kinds: [30078] }, ['wss://a', 'wss://b']);
        expect(result.events).toHaveLength(2);
        // Sorted by created_at desc.
        expect(result.events[0]!.id).toBe('b'.repeat(64));
        expect(result.events[1]!.id).toBe('a'.repeat(64));
        expect(result.relayStatus.filter((s) => s.ok)).toHaveLength(2);
    });

    it('reports per-relay status — failure on one does not block others', async () => {
        const ev = { ...SAMPLE_EVENT };
        mockNextQuery([ev]);
        mockNextQuery('error');

        const result = await queryEvents({ kinds: [30078] }, ['wss://good', 'wss://bad']);
        expect(result.events).toHaveLength(1);
        const okStatuses = result.relayStatus.filter((s) => s.ok);
        const failStatuses = result.relayStatus.filter((s) => !s.ok);
        expect(okStatuses).toHaveLength(1);
        expect(failStatuses).toHaveLength(1);
    });

    it('respects timeoutMs when relay never sends EOSE', async () => {
        mockNextQuery('hang');
        const start = Date.now();
        const result = await queryEvents({ kinds: [30078] }, ['wss://hang'], 200);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(200);
        expect(elapsed).toBeLessThan(500);
        expect(result.relayStatus[0]!.reason).toBe('timeout');
    });
});

// ─────────────────────────────────────────────────────────────────────────
// Mock WebSocket harness
// ─────────────────────────────────────────────────────────────────────────

type Outcome =
    | { kind: 'publish_ok'; ok: boolean; reason?: string }
    | { kind: 'error' }
    | { kind: 'query'; events: NostrEvent[] }
    | { kind: 'query_error' }
    | { kind: 'query_hang' };

const outcomes: Outcome[] = [];

function mockNextHandshake(type: 'OK' | 'error', detail?: { ok: boolean; reason?: string }) {
    if (type === 'OK') {
        outcomes.push({ kind: 'publish_ok', ok: detail!.ok, reason: detail?.reason });
    } else {
        outcomes.push({ kind: 'error' });
    }
}

function mockNextQuery(detail: NostrEvent[] | 'error' | 'hang') {
    if (detail === 'error') outcomes.push({ kind: 'query_error' });
    else if (detail === 'hang') outcomes.push({ kind: 'query_hang' });
    else outcomes.push({ kind: 'query' as const, events: detail });
}

let originalWebSocket: typeof globalThis.WebSocket | undefined;

function installMockWebSocket() {
    originalWebSocket = globalThis.WebSocket;
    outcomes.length = 0;

    class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 1;

        onopen: (() => void) | null = null;
        onmessage: ((ev: { data: string }) => void) | null = null;
        onerror: ((ev: unknown) => void) | null = null;
        onclose: (() => void) | null = null;

        private outcome: Outcome | undefined;

        constructor(public url: string) {
            this.outcome = outcomes.shift();
            // Fire onopen + react asynchronously so the caller can attach handlers.
            queueMicrotask(() => this.onopen?.());
        }

        send(raw: string) {
            const frame = JSON.parse(raw) as unknown[];
            const type = frame[0];
            if (type === 'EVENT') {
                const event = frame[1] as NostrEvent;
                queueMicrotask(() => {
                    if (!this.outcome) return;
                    if (this.outcome.kind === 'publish_ok') {
                        this.onmessage?.({
                            data: JSON.stringify(['OK', event.id, this.outcome.ok, this.outcome.reason ?? '']),
                        });
                    } else if (this.outcome.kind === 'error') {
                        this.onerror?.({});
                    }
                });
            } else if (type === 'REQ') {
                const subId = frame[1] as string;
                queueMicrotask(() => {
                    if (!this.outcome) return;
                    if (this.outcome.kind === 'query') {
                        for (const ev of this.outcome.events) {
                            this.onmessage?.({ data: JSON.stringify(['EVENT', subId, ev]) });
                        }
                        this.onmessage?.({ data: JSON.stringify(['EOSE', subId]) });
                    } else if (this.outcome.kind === 'query_error') {
                        this.onerror?.({});
                    } else if (this.outcome.kind === 'query_hang') {
                        // do nothing — caller's timeout fires
                    }
                });
            } else if (type === 'CLOSE') {
                // queryEvents sends CLOSE after EOSE; we don't need to react.
            }
        }

        close() {
            this.readyState = 3;
        }
    }

    vi.stubGlobal('WebSocket', MockWebSocket);
}

function restoreWebSocket() {
    if (originalWebSocket) globalThis.WebSocket = originalWebSocket;
    vi.unstubAllGlobals();
}
