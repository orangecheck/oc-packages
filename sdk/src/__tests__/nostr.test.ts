/**
 * Relay wire-protocol tests.
 *
 * The SDK talks to Nostr relays over WebSocket. These tests substitute a
 * minimal in-memory WebSocket so we can drive the exact protocol frames
 * (EVENT / OK / EOSE / timeout) deterministically and verify the SDK's
 * state machine reacts correctly.
 *
 * What this pins:
 *   - publishToRelays: OK true → success; OK false → failure; timeout
 *     covers connect + ack together (audit-fixed: the outer deadline is
 *     no longer cleared on onopen).
 *   - queryByAttestationId: EVENT frames accumulate, EOSE resolves.
 *   - malformed JSON from a relay doesn't crash the SDK.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publishToRelays, queryByAttestationId } from '../nostr';
import type { NostrEvent } from '../types';

const OPEN = 1;
const CLOSED = 3;

class MockSocket {
    static instances: MockSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 0;
    url: string;
    sent: string[] = [];

    constructor(url: string) {
        this.url = url;
        MockSocket.instances.push(this);
    }

    simulateOpen(): void {
        this.readyState = OPEN;
        this.onopen?.();
    }

    simulateMessage(frame: unknown): void {
        this.onmessage?.({ data: JSON.stringify(frame) });
    }

    simulateRawMessage(data: string): void {
        this.onmessage?.({ data });
    }

    simulateClose(): void {
        this.readyState = CLOSED;
        this.onclose?.();
    }

    simulateError(err: unknown): void {
        this.onerror?.(err);
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        this.readyState = CLOSED;
    }
}

let realWebSocket: typeof globalThis.WebSocket;

beforeEach(() => {
    MockSocket.instances = [];
    realWebSocket = globalThis.WebSocket;
    // The SDK's finally-block compares ws.readyState against WebSocket.CLOSED;
    // attach the static so that comparison works.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MockSocket as any).CLOSED = CLOSED;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = MockSocket as any;
});

afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function mintEvent(): NostrEvent {
    return {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['d', 'a'.repeat(64)]],
        content: '{}',
        sig: 'c'.repeat(128),
    };
}

describe('publishToRelays', () => {
    it('resolves as success when the relay returns OK true', async () => {
        const event = mintEvent();
        const promise = publishToRelays(event, ['wss://relay.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;

        ws.simulateOpen();
        expect(ws.sent).toHaveLength(1);
        expect(JSON.parse(ws.sent[0]!)[0]).toBe('EVENT');

        ws.simulateMessage(['OK', event.id, true]);

        const result = await promise;
        expect(result.success).toEqual(['wss://relay.test']);
        expect(result.failed).toEqual([]);
    });

    it('records failure when the relay returns OK false', async () => {
        const event = mintEvent();
        const promise = publishToRelays(event, ['wss://reject.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();
        ws.simulateMessage(['OK', event.id, false, 'invalid: bad signature']);

        const result = await promise;
        expect(result.success).toEqual([]);
        expect(result.failed).toEqual(['wss://reject.test']);
    });

    it('times out when the relay opens but never sends OK — audit fix', async () => {
        // Audit regression: the outer 5s deadline used to be cleared on
        // `onopen`, so a relay that opened but hung on OK would leak the
        // promise forever. Now one 10s deadline covers connect + ack.
        vi.useFakeTimers();

        const event = mintEvent();
        const promise = publishToRelays(event, ['wss://slow.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen(); // opens, then never sends OK

        await vi.advanceTimersByTimeAsync(15_000);

        const result = await promise;
        expect(result.failed).toEqual(['wss://slow.test']);
        expect(result.success).toEqual([]);
    });

    it('splits results across multiple relays', async () => {
        const event = mintEvent();
        const promise = publishToRelays(event, [
            'wss://a.test',
            'wss://b.test',
            'wss://c.test',
        ]);

        await Promise.resolve();
        expect(MockSocket.instances).toHaveLength(3);

        MockSocket.instances[0]!.simulateOpen();
        MockSocket.instances[0]!.simulateMessage(['OK', event.id, true]);

        MockSocket.instances[1]!.simulateOpen();
        MockSocket.instances[1]!.simulateMessage(['OK', event.id, false, 'bad']);

        MockSocket.instances[2]!.simulateOpen();
        MockSocket.instances[2]!.simulateMessage(['OK', event.id, true]);

        const result = await promise;
        expect(result.success.sort()).toEqual(['wss://a.test', 'wss://c.test']);
        expect(result.failed).toEqual(['wss://b.test']);
    });
});

describe('queryByAttestationId', () => {
    it('sends a REQ frame on open with the attestation id as the d-tag filter', async () => {
        const promise = queryByAttestationId('a'.repeat(64), ['wss://r.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();

        expect(ws.sent).toHaveLength(1);
        const [verb, subId, filter] = JSON.parse(ws.sent[0]!);
        expect(verb).toBe('REQ');
        expect(typeof subId).toBe('string');
        expect(filter.kinds).toEqual([30078]);
        expect(filter['#d']).toEqual(['a'.repeat(64)]);

        ws.simulateMessage(['EOSE', subId]);
        await promise;
    });

    it('accumulates EVENT frames until EOSE', async () => {
        const promise = queryByAttestationId('a'.repeat(64), ['wss://r.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();
        const subId = JSON.parse(ws.sent[0]!)[1];

        const event = mintEvent();
        ws.simulateMessage(['EVENT', subId, event]);
        ws.simulateMessage(['EVENT', subId, { ...event, id: 'd'.repeat(64) }]);
        ws.simulateMessage(['EOSE', subId]);

        const results = await promise;
        expect(results).toHaveLength(2);
    });

    it('survives malformed JSON from a relay without crashing', async () => {
        const promise = queryByAttestationId('a'.repeat(64), ['wss://r.test']);

        await Promise.resolve();
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();

        ws.simulateRawMessage('not valid json at all');

        const subId = JSON.parse(ws.sent[0]!)[1];
        ws.simulateMessage(['EOSE', subId]);

        const results = await promise;
        expect(results).toEqual([]);
    });

    it('returns events collected from multiple relays', async () => {
        const promise = queryByAttestationId('a'.repeat(64), [
            'wss://a.test',
            'wss://b.test',
        ]);

        await Promise.resolve();
        expect(MockSocket.instances).toHaveLength(2);

        for (const ws of MockSocket.instances) {
            ws.simulateOpen();
            const subId = JSON.parse(ws.sent[0]!)[1];
            ws.simulateMessage(['EVENT', subId, mintEvent()]);
            ws.simulateMessage(['EOSE', subId]);
        }

        const results = await promise;
        expect(results.length).toBeGreaterThanOrEqual(1);
    });
});
