/**
 * readAttestations says when its list is not the whole answer. A relay that
 * refuses, stays silent past the deadline or drops the socket may hold
 * attestations, so an empty list from it is not "none", and a partial list may
 * miss newer copies. `unread` is 'attestation_unread' on any read short of
 * subjectReadComplete, the rule check() answers by. By id, an envelope of that
 * id whose signature verifies answers the read on its own: the id is the hash
 * of the one message. Copies whose signature fails do not.
 *
 * Four in-memory relays that serve what they hold, answering per `mode`; the
 * signature check is stubbed: a signature reading 'forged' does not verify.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope, discoverAttestations, readAttestations } from '../index';
import { createAttestationEvent } from '../nostr';
import type { AttestationEnvelope, NostrEvent } from '../types';

vi.mock('../verify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../verify')>()),
    signatureIsValid: vi.fn(async ({ sig }: { sig: string }) => sig !== 'forged'),
}));

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const RELAYS = ['wss://r1.example', 'wss://r2.example', 'wss://r3.example', 'wss://r4.example'];

/**
 * ok: what it holds that matches, then EOSE. closed: CLOSED, nothing sent.
 * drop: what it holds, then the socket closes with no EOSE. lie: everything it
 * holds, whatever the filter asked, then EOSE.
 */
let mode: Record<string, 'ok' | 'closed' | 'drop' | 'lie'> = {};
let held: Record<string, NostrEvent[]> = {};

function matches(ev: NostrEvent, f: Record<string, unknown>): boolean {
    if (Array.isArray(f.kinds) && !f.kinds.includes(ev.kind)) return false;
    if (typeof f.until === 'number' && ev.created_at > f.until) return false;
    for (const [k, v] of Object.entries(f)) {
        if (!k.startsWith('#')) continue;
        if (!ev.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1] ?? ''))) return false;
    }
    return true;
}

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
        const m = mode[this.url] ?? 'ok';
        queueMicrotask(() => {
            if (m === 'closed') {
                this.onmessage?.({ data: JSON.stringify(['CLOSED', sub, 'rate-limited: slow down']) });
                return;
            }
            const answer = (held[this.url] ?? []).filter((e) => m === 'lie' || matches(e, filter));
            for (const ev of answer) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
            if (m === 'drop') return this.onclose?.();
            this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
        });
    }
    close(): void {
        this.readyState = 3;
    }
}

let n = 0;
async function attestation(sig: string, nonce = '0011223344556677889900aabbccddee'): Promise<AttestationEnvelope> {
    const message = buildCanonicalMessage(
        { address: ADDR, identities: [{ protocol: 'github', identifier: 'alice' }] },
        {},
        { nonce, issuedAt: '2026-10-30T12:00:00Z' }
    );
    return createAttestationEnvelope(message, sig, 'bip322', ADDR, [{ protocol: 'github', identifier: 'alice' }]);
}
function eventFor(envelope: AttestationEnvelope): NostrEvent {
    const id = (++n).toString(16).padStart(64, '0');
    return { ...createAttestationEvent(envelope, 'b'.repeat(64)), id, sig: 'c'.repeat(128), created_at: 1000 + n };
}

const all = (m: 'closed' | 'drop') => Object.fromEntries(RELAYS.map((r) => [r, m]));
const onEvery = (...events: NostrEvent[]) => {
    held = Object.fromEntries(RELAYS.map((r) => [r, events]));
};
const byAddress = () => readAttestations({ address: ADDR, relays: RELAYS });
const byId = (id: string) => readAttestations({ attestationId: id, relays: RELAYS });
const ids = (list: AttestationEnvelope[]) => list.map((e) => e.attestation_id);

let realWs: typeof globalThis.WebSocket;
beforeEach(() => {
    mode = {};
    held = {};
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('readAttestations: a list is the whole answer only on a finished read', () => {
    it('every relay finished with nothing: an empty list that counts, unread null', async () => {
        const r = await byAddress();
        expect(r).toEqual({
            attestations: [],
            unread: null,
            relays: RELAYS.map((relay) => ({ relay, state: 'complete' })),
        });
    });

    it('one relay refusing, three finished (the floor is 3 of 4): still a finished answer', async () => {
        const a = await attestation('genuine');
        onEvery(eventFor(a));
        mode = { [RELAYS[0]!]: 'closed' };
        const r = await byAddress();
        expect(r.unread).toBeNull();
        expect(ids(r.attestations)).toEqual([a.attestation_id]);
        expect(r.relays[0]).toEqual({ relay: RELAYS[0], state: 'no_answer' });
    });

    it.each(['closed', 'drop'] as const)('every relay %s: attestation_unread beside the empty list', async (m) => {
        mode = all(m);
        const r = await byAddress();
        expect(r.attestations).toEqual([]);
        expect(r.unread).toBe('attestation_unread');
    });

    it('two relays cut off after sending one attestation: unread, and the one found is listed', async () => {
        const a = await attestation('genuine');
        held = { [RELAYS[0]!]: [eventFor(a)], [RELAYS[1]!]: [eventFor(a)] };
        mode = { [RELAYS[0]!]: 'drop', [RELAYS[1]!]: 'drop' };
        const r = await byAddress();
        expect(r.unread).toBe('attestation_unread');
        expect(ids(r.attestations)).toEqual([a.attestation_id]);
        expect(r.relays.slice(0, 2).map((x) => x.state)).toEqual(['cut_off', 'cut_off']);
    });

    it('one relay cut off, though the floor finished: unread, newer copies may sit behind it', async () => {
        const a = await attestation('genuine');
        const b = await attestation('genuine', 'ffeeddccbbaa99887766554433221100');
        held = { [RELAYS[0]!]: [eventFor(a), eventFor(b)], [RELAYS[1]!]: [eventFor(a)], [RELAYS[2]!]: [eventFor(a)] };
        mode = { [RELAYS[0]!]: 'drop' };
        const r = await byAddress();
        expect(r.unread).toBe('attestation_unread');
        expect(ids(r.attestations).sort()).toEqual([a.attestation_id, b.attestation_id].sort());
    });

    it('an identity read no relay answered: unread', async () => {
        mode = all('closed');
        const r = await readAttestations({ identity: { protocol: 'github', identifier: 'alice' }, relays: RELAYS });
        expect(r.unread).toBe('attestation_unread');
    });

    it('discoverAttestations returns the same list, without the signal', async () => {
        const a = await attestation('genuine');
        held = { [RELAYS[0]!]: [eventFor(a)] };
        mode = { [RELAYS[0]!]: 'drop', [RELAYS[1]!]: 'closed', [RELAYS[2]!]: 'closed', [RELAYS[3]!]: 'closed' };
        expect(ids(await discoverAttestations({ address: ADDR, relays: RELAYS }))).toEqual([a.attestation_id]);
    });
});

describe('readAttestations by id: one envelope that verifies answers the read', () => {
    it('found on one relay of four, the others refusing: a finished answer', async () => {
        const a = await attestation('genuine');
        held = { [RELAYS[0]!]: [eventFor(a)] };
        mode = { [RELAYS[1]!]: 'closed', [RELAYS[2]!]: 'closed', [RELAYS[3]!]: 'closed' };
        const r = await byId(a.attestation_id);
        expect(r.unread).toBeNull();
        expect(r.attestations.map((e) => e.signature)).toEqual(['genuine']);
    });

    it('only copies whose signature fails, on a read that did not finish: unread, the copy still listed', async () => {
        const forged = await attestation('forged');
        held = { [RELAYS[0]!]: [eventFor(forged)] };
        mode = { [RELAYS[1]!]: 'closed', [RELAYS[2]!]: 'closed', [RELAYS[3]!]: 'closed' };
        const r = await byId(forged.attestation_id);
        expect(r.unread).toBe('attestation_unread');
        expect(r.attestations.map((e) => e.signature)).toEqual(['forged']);
    });

    it('two copies that both fail, one relay cut off: unread', async () => {
        const forged = await attestation('forged');
        const other = { ...forged, signature: 'forged', scheme: 'legacy' as const };
        held = { [RELAYS[0]!]: [eventFor(forged), eventFor(other)], [RELAYS[1]!]: [eventFor(forged)] };
        mode = { [RELAYS[0]!]: 'drop' };
        expect((await byId(forged.attestation_id)).unread).toBe('attestation_unread');
    });

    it('only a copy whose signature fails, on a read every relay finished: a finished answer', async () => {
        const forged = await attestation('forged');
        onEvery(eventFor(forged));
        expect((await byId(forged.attestation_id)).unread).toBeNull();
    });

    it('nothing found, no relay answering: unread', async () => {
        mode = all('closed');
        const r = await byId('ab'.repeat(32));
        expect(r).toMatchObject({ attestations: [], unread: 'attestation_unread' });
    });

    it('a relay answering an id read with another attestation that verifies: unread', async () => {
        const asked = await attestation('genuine');
        const another = await attestation('genuine', 'ffeeddccbbaa99887766554433221100');
        held = { [RELAYS[0]!]: [eventFor(another)] };
        mode = { [RELAYS[0]!]: 'lie', [RELAYS[1]!]: 'closed', [RELAYS[2]!]: 'closed', [RELAYS[3]!]: 'closed' };
        const r = await byId(asked.attestation_id);
        expect(ids(r.attestations)).toEqual([another.attestation_id]);
        expect(r.unread).toBe('attestation_unread');
    });
});
