import {
    bindingSigTexts,
    buildBindingStatement,
    deriveNostrKey,
    finalizeDeviceEvent,
    generateDeviceKey,
    parseDeviceEvent,
    signNostrEvent,
    verifyDeviceRecords,
    verifyNostrEvent,
    type NostrEvent,
} from '@orangecheck/lock-device';
import {
    buildCanonicalMessage,
    check,
    createAttestationEnvelope,
    createAttestationEvent,
    discoverAttestations,
    queryRecent,
} from '@orangecheck/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { custodyEvents } from '../src/records';

/**
 * Plan §2: a published reader skips a custody record. It is never thrown on, never taken as a
 * device binding or an attestation, and the reader's own events beside it read as before.
 * The relay below is in memory; nothing here reaches the network.
 */

const A = 'bc1q2t7hhwrqwv8s2yqqlfstrljy3eg7j9sy6lkwdx'; // binding, then takeover, then attests
const C = 'bc1quluy8gpgrznz5rx5e0txjmy5wgunnurklk2vkt'; // a retired binding, nothing else
const RELAY = 'wss://relay.test';
const NOW = Math.floor(Date.now() / 1000);

/** A Nostr key pair made for the run. */
const nostrKey = () => deriveNostrKey(crypto.getRandomValues(new Uint8Array(32)));

// Published under orangecheck's service Nostr key (keys README §4); a key made for the run here.
const service = nostrKey();
const records: NostrEvent[] = custodyEvents(NOW - 60).map((e) =>
    signNostrEvent({ ...e, pubkey: service.nostrPk }, service.nostrSk)
);
const recordIds = new Set(records.map((e) => e.id));

/** A's attestation, made after the takeover. Nothing below checks its signature against the chain. */
async function attestationOfA(): Promise<NostrEvent> {
    const message = buildCanonicalMessage({ address: A });
    const envelope = await createAttestationEnvelope(message, 'c3RhbmQtaW4tc2lnbmF0dXJl', 'bip322', A, []);
    const author = nostrKey();
    const unsigned = createAttestationEvent(envelope, author.nostrPk);
    return signNostrEvent({ ...unsigned, created_at: NOW }, author.nostrSk);
}

type Filter = Record<string, unknown> & { kinds?: number[]; limit?: number; since?: number; until?: number };

function matches(f: Filter, e: NostrEvent) {
    if (f.kinds && !f.kinds.includes(e.kind)) return false;
    if (f.since !== undefined && e.created_at < f.since) return false;
    if (f.until !== undefined && e.created_at > f.until) return false;
    for (const [k, want] of Object.entries(f)) {
        if (!k.startsWith('#')) continue;
        if (!e.tags.some((t) => t[0] === k.slice(1) && (want as string[]).includes(t[1]!))) return false;
    }
    return true;
}

/** One relay: it holds `events` and answers every REQ, honestly by filter or with all it holds. */
class Relay {
    sent: NostrEvent[] = [];
    constructor(
        readonly events: NostrEvent[],
        readonly filters = true
    ) {}

    socket() {
        const relay = this;
        return class FakeSocket {
            static readonly CONNECTING = 0;
            static readonly OPEN = 1;
            static readonly CLOSING = 2;
            static readonly CLOSED = 3;
            readyState = 0;
            onopen: ((ev: unknown) => void) | null = null;
            onmessage: ((ev: { data: string }) => void) | null = null;
            onerror: ((ev: unknown) => void) | null = null;
            onclose: ((ev: unknown) => void) | null = null;
            constructor(url: string) {
                if (url !== RELAY) throw new Error(`unexpected relay ${url}`);
                setTimeout(() => {
                    this.readyState = 1;
                    this.onopen?.({});
                });
            }
            send(raw: string) {
                const [type, sub, filter] = JSON.parse(raw) as [string, string, Filter];
                if (type !== 'REQ') return;
                const hits = relay.events
                    .filter((e) => !relay.filters || matches(filter, e))
                    .sort((x, y) => y.created_at - x.created_at)
                    .slice(0, filter.limit ?? Infinity);
                relay.sent.push(...hits);
                setTimeout(() => {
                    for (const e of hits) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, e]) });
                    this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
                });
            }
            close() {
                this.readyState = 3;
            }
        };
    }
}

/** Run `read` against `relay`, answering only its NIP-11 document over HTTP. */
async function against<T>(relay: Relay, read: () => Promise<T>): Promise<T> {
    vi.stubGlobal('WebSocket', relay.socket());
    vi.stubGlobal('fetch', async (input: string | URL) => {
        if (new URL(String(input)).host !== 'relay.test') throw new Error(`unexpected fetch ${String(input)}`);
        return Response.json({ limitation: { max_limit: 500 } });
    });
    try {
        return await read();
    } finally {
        vi.unstubAllGlobals();
    }
}

const sentRecords = (relay: Relay) => relay.sent.filter((e) => recordIds.has(e.id));

describe('lock-device 0.9.0', () => {
    const STANDIN = 'c3RhbmQtaW4tYmlwMzIy';
    let device: NostrEvent;
    let statement: string;
    beforeEach(() => {
        const key = generateDeviceKey();
        statement = buildBindingStatement({
            address: A,
            device_pk: key.device_pk,
            device_id: key.device_id,
            created_at: key.created_at,
            nostr_pk: deriveNostrKey(key.device_sk).nostrPk,
        });
        device = finalizeDeviceEvent({
            deviceSk: key.device_sk,
            address: A,
            device_id: key.device_id,
            device_pk: key.device_pk,
            bindingStatement: statement,
            bindingSigBase64: STANDIN,
            createdAtUnix: NOW,
        });
    });

    it('verifyDeviceRecords skips every custody record and still finds the device beside them', async () => {
        const asked: Array<{ address: string; message: string; signature: string }> = [];
        const opts = {
            verifyBip322: (args: { address: string; message: string; signature: string }) => {
                asked.push(args);
                return args.signature === STANDIN;
            },
        };
        const alone = await verifyDeviceRecords([device], A, opts);
        expect(alone.map((d) => d.eventId)).toEqual([device.id]);
        asked.length = 0;
        const mixed = await verifyDeviceRecords([...records, device], A, opts);
        expect(mixed).toEqual(alone);
        expect(asked.length).toBeGreaterThan(0);
        for (const a of asked) expect(bindingSigTexts(statement)).toContain(a.message);
        for (const r of records) {
            // Skipped as a record, not for a bad signature.
            expect(verifyNostrEvent(r)).toBe(true);
            expect(() => parseDeviceEvent(r)).toThrow();
        }
    });
});

describe('sdk 1.28.0', () => {
    let attestation: NostrEvent;
    beforeEach(async () => {
        attestation = await attestationOfA();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("attest's address query never fetches a custody record", async () => {
        const relay = new Relay([...records, attestation]);
        const found = await against(relay, () => discoverAttestations({ address: A, relays: [RELAY] }));
        expect(found.map((e) => e.address)).toEqual([A]);
        expect(await against(relay, () => check({ addr: C, relays: [RELAY] }))).toEqual({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['not_found'],
        });
        expect(relay.sent).toContainEqual(attestation);
        expect(sentRecords(relay)).toEqual([]);
    });

    it('the recent-attestations query never fetches one', async () => {
        const relay = new Relay([...records, attestation]);
        await against(relay, () => queryRecent([RELAY]));
        expect(relay.sent).toContainEqual(attestation);
        expect(sentRecords(relay)).toEqual([]);
    });

    it('discoverAttestations, check and queryRecent skip the custody records a relay sends anyway', async () => {
        const all = new Relay([...records, attestation], false);
        const only = new Relay([attestation], false);
        const empty = new Relay([], false);
        const mixed = await against(all, () => discoverAttestations({ address: A, relays: [RELAY] }));
        expect(sentRecords(all)).toHaveLength(records.length);
        expect(mixed).toHaveLength(1);
        expect(mixed).toEqual(await against(only, () => discoverAttestations({ address: A, relays: [RELAY] })));
        const onlyRecords = await against(all, () => check({ addr: C, relays: [RELAY] }));
        expect(onlyRecords).toEqual(await against(empty, () => check({ addr: C, relays: [RELAY] })));
        expect(onlyRecords.reasons).toEqual(['not_found']);
        // queryRecent keeps only attestations whose BIP-322 signature holds, and A's is a stand-in.
        const recent = await against(all, () => queryRecent([RELAY]));
        expect(recent).toEqual(await against(only, () => queryRecent([RELAY])));
    });
});
