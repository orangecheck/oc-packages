// OC Lock test vector s01 (oc-lock-protocol 2.6.0 test-vectors/device-binding, vendored
// byte for byte): a binding_sig over the statement without its final LF counts, one over
// any other text does not, and the readers judge each case as the vector does.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    bindingSigTexts,
    computeNostrEventId,
    liveDevices,
    signNostrEvent,
    verifyDeviceRecords,
    type NostrEvent,
} from './index.js';

interface VectorRecord {
    signed: string;
    binding_sig: string;
    nostr_sk?: string;
    carrier_nostr_sk?: string;
    event: Omit<NostrEvent, 'id' | 'sig'>;
    event_id: string;
}

const s01 = JSON.parse(
    readFileSync(new URL('../test-vectors/s01-signed-without-final-lf.json', import.meta.url), 'utf8')
);
const b01 = JSON.parse(readFileSync(new URL('../test-vectors/b01-bind-v3.json', import.meta.url), 'utf8'));
const address: string = s01.inputs.address;
const now = new Date(s01.inputs.reader_time);

const live = s01.expected.live as { cases: { records: string[]; live: string[] }[] };
// expected.b01 is b01's own record; every other expected record is signed without its final LF.
const accepted: Record<string, VectorRecord> = Object.fromEntries(
    Object.entries(s01.expected).filter(([n]) => n !== 'b01' && n !== 'live')
) as Record<string, VectorRecord>;
const rejected = s01.reject as Record<string, VectorRecord>;

// A BIP-322 verifier as the vector states it: each binding_sig verifies over its own
// signed text, b01's over its statement, and nothing else verifies.
const verifies = new Set(
    [
        ...Object.values(accepted),
        ...Object.values(rejected),
        { signed: b01.expected.statement, binding_sig: b01.expected.binding_sig },
    ].map((r) => `${r.signed}\u0000${r.binding_sig}`)
);
const verifyBip322 = (a: { address: string; message: string; signature: string }) =>
    a.address === address && verifies.has(`${a.message}\u0000${a.signature}`);

const signed = (r: VectorRecord): NostrEvent => {
    expect(computeNostrEventId(r.event)).toBe(r.event_id);
    const e = signNostrEvent(r.event, (r.nostr_sk ?? r.carrier_nostr_sk)!);
    expect(e.id).toBe(r.event_id);
    return e;
};
const events: Record<string, NostrEvent> = {
    b01: signNostrEvent(s01.expected.b01.event, b01.expected.nostr_sk),
    ...Object.fromEntries(
        Object.entries({ ...accepted, ...rejected }).map(([n, r]) => [n, signed(r)])
    ),
};

describe('test vector s01: a binding_sig over the statement without its final LF', () => {
    it('names the statement and the statement without its final LF, and no other text', () => {
        const statement = b01.expected.statement as string;
        expect(bindingSigTexts(statement)).toEqual([statement, statement.slice(0, -1)]);
        expect(bindingSigTexts(statement.slice(0, -1))).toEqual([statement.slice(0, -1)]);
    });

    it('keeps each record signed without its final LF, its content the statement with it', async () => {
        for (const [name, r] of Object.entries(accepted)) {
            expect(r.event.content.endsWith('\n'), name).toBe(true);
            expect(r.signed, name).toBe(r.event.content.slice(0, -1));
            const kept = await verifyDeviceRecords([events[name]!], address, { verifyBip322 });
            expect(kept.map((p) => p.eventId), name).toEqual([r.event_id]);
            expect(kept[0]!.bindingStatement, name).toBe(r.event.content);
        }
    });

    it('drops each record signed over another text', async () => {
        for (const [name, r] of Object.entries(rejected)) {
            expect(await verifyDeviceRecords([events[name]!], address, { verifyBip322 }), name).toEqual([]);
            expect(r.event.content.endsWith('\n'), name).toBe(true);
        }
    });

    it.each(live.cases.map((c) => [c.records.join(' + '), c] as const))(
        'leaves live what the vector lists: %s',
        async (_, c) => {
            const verified = await verifyDeviceRecords(
                c.records.map((n) => events[n]!),
                address,
                { verifyBip322 }
            );
            const name = new Map(Object.entries(events).map(([n, e]) => [e.id, n]));
            expect(liveDevices(verified, { now }).map((d) => name.get(d.eventId)).sort()).toEqual(
                [...c.live].sort()
            );
        }
    );
});
