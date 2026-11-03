/**
 * check() reads an address as an address, checksum included. A typo has the
 * shape of one, so it used to go to the relays and come back `not_found`: an
 * address with no attestation, when it was never an address. It is a bad
 * request now and nothing is asked; a QR code's capitals are read by the one
 * spelling attestations are tagged under.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { check } from '../check';

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const RELAYS = ['wss://r1.example', 'wss://r2.example', 'wss://r3.example', 'wss://r4.example'];

let requests: Array<Record<string, unknown>> = [];

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
        const [type, sub, filter] = JSON.parse(raw) as [string, string, Record<string, unknown>];
        if (type !== 'REQ') return;
        requests.push(filter);
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) }));
    }
    close(): void {
        this.readyState = 3;
    }
}

let realWs: typeof globalThis.WebSocket;
beforeEach(() => {
    requests = [];
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('check() by address', () => {
    it.each([
        ['a bech32 address one character off', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp'],
        ['a base58 address one character off', '1BoatSLRHtKNngkdXEeobR76b53LETtpyX'],
        ['text that is no address', 'notanaddress12345'],
        ['blank text, with nothing beside it', '  \n'],
    ])('answers %s as a bad request and asks no relay', async (_, addr) => {
        const r = await check({ addr, relays: RELAYS });
        expect(r).toEqual({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['bad_request'],
        });
        expect(requests).toEqual([]);
    });

    it.each([
        ['an empty', ''],
        ['a blank', ' \t\n '],
    ])(
        'takes %s addr beside an id as no address, and reads by the id as before',
        async (_, addr) => {
            const id = 'a'.repeat(64);
            const r = await check({ addr, id, relays: RELAYS });
            expect(r.reasons).toEqual(['not_found']);
            expect(requests.length).toBeGreaterThan(0);
            for (const f of requests) expect(f['#d']).toEqual([id]);
        },
    );

    it('refuses a typo beside an id: the id never decides an address it was not asked', async () => {
        const r = await check({
            addr: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp',
            id: 'a'.repeat(64),
            relays: RELAYS,
        });
        expect(r.reasons).toEqual(['bad_request']);
        expect(requests).toEqual([]);
    });

    it.each([
        ['capitalised', ADDR.toUpperCase()],
        ['padded and capitalised', `  ${ADDR.toUpperCase()}\n`],
    ])('reads a %s address by the spelling it is tagged under', async (_, addr) => {
        const r = await check({ addr, relays: RELAYS });
        expect(r.reasons).toEqual(['not_found']);
        expect(requests.length).toBeGreaterThan(0);
        for (const f of requests) expect(f['#t']).toEqual([ADDR]);
    });
});
