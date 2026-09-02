/**
 * NIP-12 indexed-tag contract.
 *
 * Relays index SINGLE-LETTER tags only. A multi-letter tag is stored and
 * stays readable in the event, but no `#<tag>` filter can ever retrieve it.
 *
 * This SDK got that wrong in both directions at once, and the two bugs hid
 * each other:
 *   - `queryByAddress` filtered on `#address`, so it returned empty for every
 *     real attestation on every relay. `check({ addr })` — the documented
 *     trustless path, the whole "you don't have to trust attest.ochk.io"
 *     claim — answered `not_found` for an address the hosted API scored at
 *     10,000 sats / 307 days.
 *   - `createAttestationEvent` emitted no `t` tag at all, so an attestation
 *     published through this SDK was invisible to every by-address query
 *     anywhere, including attest.ochk.io's own verifier (which queries `#t`).
 *
 * attest.ochk.io fixed its half and the fix was never back-ported here. These
 * tests pin the wire contract on both sides so the two implementations cannot
 * drift apart again silently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAttestationEvent, DEFAULT_RELAYS, publishToRelays, queryByAddress } from '../nostr';
import type { AttestationEnvelope } from '../types';

const ADDRESS = 'bc1pezn5yjxmz9nuahtqprvhfeya2nv4zdfk49u5amquhqptykx695rs60hqa2';

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
    simulateError(err: unknown): void {
        this.onerror?.(err);
    }
    simulateClose(): void {
        this.readyState = CLOSED;
        this.onclose?.();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MockSocket as any).CLOSED = CLOSED;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = MockSocket as any;
});

afterEach(() => {
    globalThis.WebSocket = realWebSocket;
    vi.restoreAllMocks();
});

function envelope(): AttestationEnvelope {
    return {
        version: 'oc-attest:v1',
        attestation_id: 'a'.repeat(64),
        address: ADDRESS,
        scheme: 'bip322',
        issued_at: '2026-09-02T00:00:00Z',
        identities: [{ protocol: 'nostr', identifier: 'npub1test' }],
        sig: { value: 'sig' },
    } as unknown as AttestationEnvelope;
}

describe('createAttestationEvent — indexed tags', () => {
    it('emits an indexed `t` tag carrying the Bitcoin address', () => {
        const tags = createAttestationEvent(envelope()).tags;
        expect(tags).toContainEqual(['t', ADDRESS]);
    });

    it('emits the `oc-attest` family marker for cross-cut discovery', () => {
        const tags = createAttestationEvent(envelope()).tags;
        expect(tags).toContainEqual(['t', 'oc-attest']);
    });

    it('keeps the multi-letter `address` tag as readable diagnostics', () => {
        // Not load-bearing, but attest.ochk.io emits it and dropping it would
        // make the two implementations' events differ for no reason.
        const tags = createAttestationEvent(envelope()).tags;
        expect(tags).toContainEqual(['address', ADDRESS]);
    });

    it('uses the attestation id as the replaceable-event `d` tag', () => {
        const tags = createAttestationEvent(envelope()).tags;
        expect(tags).toContainEqual(['d', 'a'.repeat(64)]);
    });

    it('every filterable tag it emits is single-letter', () => {
        // The invariant behind the whole bug: if a value has to be queryable,
        // its tag name must be one character.
        const tags = createAttestationEvent(envelope()).tags;
        const queryable = tags.filter(([name]) => name === 't' || name === 'd' || name === 'i');
        expect(queryable.length).toBeGreaterThanOrEqual(3);
        for (const [name] of queryable) expect(name).toHaveLength(1);
    });
});

describe('queryByAddress — relay filter', () => {
    it('subscribes with #t, never #address', async () => {
        const pending = queryByAddress(ADDRESS, ['wss://relay.example']);
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();

        const req = JSON.parse(ws.sent[0]!) as [string, string, Record<string, unknown>];
        expect(req[0]).toBe('REQ');
        const filter = req[2];
        expect(filter['#t']).toEqual([ADDRESS]);
        // The bug: a multi-letter filter no relay will ever match.
        expect(filter['#address']).toBeUndefined();
        expect(filter.kinds).toEqual([30078]);

        ws.simulateMessage(['EOSE', req[1]]);
        await expect(pending).resolves.toBeInstanceOf(Array);
    });
});

describe('DEFAULT_RELAYS', () => {
    it('includes the first-party family relay', () => {
        // attest.ochk.io's verifier has always read from relay.ochk.io. While
        // this list omitted it, the SDK and the reference implementation were
        // looking in different places for the same attestation.
        expect(DEFAULT_RELAYS).toContain('wss://relay.ochk.io');
    });

    it('does not rely on the family relay alone', () => {
        // Never the only copy — a single-relay default would make the family
        // relay load-bearing, which is the opposite of the point.
        expect(DEFAULT_RELAYS.filter((r) => !r.includes('ochk.io')).length).toBeGreaterThan(1);
    });
});

describe('publishToRelays — one outcome per relay', () => {
    it('does not count a relay as BOTH published and rejected', async () => {
        // The real shape of the bug: a relay ACKs OK true, then emits an
        // error while the socket is being torn down. Pre-fix the error
        // handler pushed to `failed` unguarded, so the same relay appeared in
        // both arrays and the caller reported "published to 1 · rejected 1".
        const event = { id: 'evt1' } as never;
        const pending = publishToRelays(event, ['wss://relay.example']);
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();
        ws.simulateMessage(['OK', 'evt1', true]);
        ws.simulateError(new Error('socket died during teardown'));
        ws.simulateClose();

        const { success, failed } = await pending;
        expect(success).toEqual(['wss://relay.example']);
        expect(failed).toEqual([]);
    });

    it('records a rejection once, not once per event', async () => {
        const event = { id: 'evt2' } as never;
        const pending = publishToRelays(event, ['wss://relay.example']);
        const ws = MockSocket.instances[0]!;
        ws.simulateOpen();
        ws.simulateMessage(['OK', 'evt2', false, 'blocked: pubkey not allowed']);
        ws.simulateError(new Error('and then an error too'));

        const { success, failed } = await pending;
        expect(success).toEqual([]);
        expect(failed).toEqual(['wss://relay.example']);
    });
});
