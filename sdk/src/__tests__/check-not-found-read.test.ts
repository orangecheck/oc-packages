/**
 * check() answers not_found only on a read the relays finished: the read floor
 * of them sent a short page and none was cut off. A relay that refuses, stays
 * silent past the deadline or drops the socket leaves the attestation unread,
 * not absent, so check() answers `attestation_unread` and a caller (airdrop-gate, an
 * allowlist) can tell an outage from an address with no attestation.
 *
 * Four in-memory relays; each read of the subject is answered per `mode`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { check } from '../check';

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const RELAYS = ['wss://r1.example', 'wss://r2.example', 'wss://r3.example', 'wss://r4.example'];

let mode: Record<string, 'ok' | 'closed' | 'silent' | 'drop'> = {};

class FakeRelay {
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 0;
    constructor(public url: string) {
        queueMicrotask(() => {
            this.readyState = 1;
            this.onopen?.();
        });
    }
    send(raw: string): void {
        const [type, sub] = JSON.parse(raw) as [string, string];
        if (type !== 'REQ') return;
        const m = mode[this.url] ?? 'ok';
        if (m === 'silent') return;
        queueMicrotask(() => {
            if (m === 'closed') {
                this.onmessage?.({
                    data: JSON.stringify(['CLOSED', sub, 'rate-limited: slow down']),
                });
                return;
            }
            if (m === 'drop') return this.onclose?.();
            // Nothing held for this subject: an empty page, then EOSE.
            this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
        });
    }
    close(): void {
        this.readyState = 3;
    }
}

let realWs: typeof globalThis.WebSocket;
beforeEach(() => {
    mode = {};
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

const all = (m: 'closed' | 'silent' | 'drop') => Object.fromEntries(RELAYS.map((r) => [r, m]));
const reasonsFor = async (params: Parameters<typeof check>[0]) =>
    (await check({ ...params, relays: RELAYS })).reasons;

describe('check(): not_found only on a finished read', () => {
    it('every relay finished with nothing: not_found', async () => {
        expect(await reasonsFor({ addr: ADDR })).toEqual(['not_found']);
    });

    it('one relay refusing, three finished (the floor is 3 of 4): still not_found', async () => {
        mode = { [RELAYS[0]!]: 'closed' };
        expect(await reasonsFor({ addr: ADDR })).toEqual(['not_found']);
    });

    it.each(['closed', 'drop'] as const)(
        'every relay %s: attestation_unread, never not_found',
        async (m) => {
            mode = all(m);
            expect(await reasonsFor({ addr: ADDR })).toEqual(['attestation_unread']);
        },
    );

    it('two of four refusing, below the floor: attestation_unread', async () => {
        mode = { [RELAYS[0]!]: 'closed', [RELAYS[1]!]: 'drop' };
        expect(await reasonsFor({ addr: ADDR })).toEqual(['attestation_unread']);
    });

    it('by attestation id and by identity too', async () => {
        mode = all('closed');
        expect(await reasonsFor({ id: 'ab'.repeat(32) })).toEqual(['attestation_unread']);
        expect(await reasonsFor({ identity: { protocol: 'github', identifier: 'alice' } })).toEqual(
            ['attestation_unread'],
        );
        mode = {};
        expect(await reasonsFor({ id: 'ab'.repeat(32) })).toEqual(['not_found']);
    });
});
