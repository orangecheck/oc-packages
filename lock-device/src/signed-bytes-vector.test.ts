// OC Lock test vectors s02 and s03 (oc-lock-protocol 2.6.0 test-vectors/device-binding,
// vendored byte for byte): a record written as the bytes its binding_sig covers counts,
// its final LF or not, and so does a BIP-137 binding_sig, which the verifier passed in
// decides; signedBindingText names the text each signature covers.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    bindingSigTexts,
    computeNostrEventId,
    liveDevices,
    signedBindingText,
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
interface Vector {
    inputs: { address: string; reader_time: string };
    expected: Record<string, unknown> & {
        b01: { event: Omit<NostrEvent, 'id' | 'sig'>; event_id: string };
        r01?: { event: Omit<NostrEvent, 'id' | 'sig'>; event_id: string; carrier_nostr_sk: string };
        live: { cases: { records: string[]; live: string[] }[] };
    };
    reject: Record<string, VectorRecord>;
}

const read = (name: string) => JSON.parse(readFileSync(new URL(`../test-vectors/${name}.json`, import.meta.url), 'utf8'));
const b01 = read('b01-bind-v3');
const r01 = read('r01-revoke-k2');

/**
 * One vector's records, Nostr-signed, and a verifier as the vector states it: each
 * accepted record's binding_sig verifies over its signed text, b01's and r01's over
 * their statements, and each rejected record's over its signed text only when
 * `rejectedSign` (s02's do; s03's are by another key or malformed). Nothing else verifies.
 */
function load(name: string, rejectedSign: boolean) {
    const v = read(name) as Vector;
    const address = v.inputs.address;
    const accepted = Object.fromEntries(
        Object.entries(v.expected).filter(([n]) => !['b01', 'r01', 'live'].includes(n))
    ) as Record<string, VectorRecord>;
    const pairs = [
        ...Object.values(accepted),
        ...(rejectedSign ? Object.values(v.reject) : []),
        { signed: b01.expected.statement, binding_sig: b01.expected.binding_sig },
        { signed: r01.expected.revocation.statement, binding_sig: r01.expected.revocation.binding_sig },
    ];
    const verifies = new Set(pairs.map((r) => `${r.signed}\u0000${r.binding_sig}`));
    const verifyBip322 = (a: { address: string; message: string; signature: string }) =>
        a.address === address && verifies.has(`${a.message}\u0000${a.signature}`);
    const signed = (unsigned: Omit<NostrEvent, 'id' | 'sig'>, sk: string, id: string): NostrEvent => {
        expect(computeNostrEventId(unsigned)).toBe(id);
        const e = signNostrEvent(unsigned, sk);
        expect(e.id).toBe(id);
        return e;
    };
    const events: Record<string, NostrEvent> = {
        b01: signed(v.expected.b01.event, b01.expected.nostr_sk, v.expected.b01.event_id),
        ...(v.expected.r01
            ? { r01: signed(v.expected.r01.event, v.expected.r01.carrier_nostr_sk, v.expected.r01.event_id) }
            : {}),
        ...Object.fromEntries(
            Object.entries({ ...accepted, ...v.reject }).map(([n, r]) => [
                n,
                signed(r.event, (r.nostr_sk ?? r.carrier_nostr_sk)!, r.event_id),
            ])
        ),
    };
    return { v, address, now: new Date(v.inputs.reader_time), accepted, rejected: v.reject, verifyBip322, events };
}

for (const [name, rejectedSign, title] of [
    ['s02-content-without-final-lf', true, 's02: a record written as the bytes its binding_sig covers'],
    ['s03-bip137-binding-sig', false, 's03: a BIP-137 binding_sig'],
] as const) {
    const { v, address, now, accepted, rejected, verifyBip322, events } = load(name, rejectedSign);

    describe(`test vector ${title}`, () => {
        it('keeps each expected record, and names the text its signature covers', async () => {
            for (const [n, r] of Object.entries(accepted)) {
                const kept = await verifyDeviceRecords([events[n]!], address, { verifyBip322 });
                expect(kept.map((p) => p.eventId), n).toEqual([r.event_id]);
                expect(kept[0]!.bindingStatement, n).toBe(r.event.content);
                expect(await signedBindingText(r.event.content, address, r.binding_sig, { verifyBip322 }), n).toBe(r.signed);
            }
        });

        it('drops each rejected record, and names no text for it', async () => {
            for (const [n, r] of Object.entries(rejected)) {
                expect(await verifyDeviceRecords([events[n]!], address, { verifyBip322 }), n).toEqual([]);
                expect(await signedBindingText(r.event.content, address, r.binding_sig, { verifyBip322 }), n).toBeNull();
            }
        });

        it.each(v.expected.live.cases.map((c) => [c.records.join(' + '), c] as const))(
            'leaves live what the vector lists: %s',
            async (_, c) => {
                const verified = await verifyDeviceRecords(
                    c.records.map((n) => events[n]!),
                    address,
                    { verifyBip322 }
                );
                const byId = new Map(Object.entries(events).map(([n, e]) => [e.id, n]));
                expect(liveDevices(verified, { now }).map((d) => byId.get(d.eventId)).sort()).toEqual(
                    [...c.live].sort()
                );
            }
        );
    });
}

describe('signedBindingText', () => {
    const address = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
    const statement = 'oc-lock:device-bind:v2\naddress: x\n';
    const over = (text: string) => (a: { address: string; message: string; signature: string }) =>
        a.address === address && a.message === text && a.signature === 'sig';

    it('names the statement, or the statement without its final LF, and no other text', async () => {
        expect(await signedBindingText(statement, address, 'sig', { verifyBip322: over(statement) })).toBe(statement);
        expect(await signedBindingText(statement, address, 'sig', { verifyBip322: over(statement.slice(0, -1)) })).toBe(
            statement.slice(0, -1)
        );
        expect(await signedBindingText(statement, address, 'sig', { verifyBip322: over(`${statement}\n`) })).toBeNull();
        expect(await signedBindingText(statement, address, 'sig', { verifyBip322: over(statement.slice(0, -2)) })).toBeNull();
    });

    it('tries no shorter text for a statement that ends in a second LF', async () => {
        const doubled = `${statement}\n`;
        expect(bindingSigTexts(doubled)).toEqual([doubled]);
        expect(await signedBindingText(doubled, address, 'sig', { verifyBip322: over(statement) })).toBeNull();
        expect(await signedBindingText(doubled, address, 'sig', { verifyBip322: over(doubled) })).toBe(doubled);
    });

    it('names text without a final LF only when the signature covers it as it stands', async () => {
        const bare = statement.slice(0, -1);
        expect(await signedBindingText(bare, address, 'sig', { verifyBip322: over(bare) })).toBe(bare);
        expect(await signedBindingText(bare, address, 'sig', { verifyBip322: over(statement) })).toBeNull();
    });

    it('counts a verifier that throws, or answers anything but true, as no', async () => {
        const throws = () => {
            throw new Error('boom');
        };
        expect(await signedBindingText(statement, address, 'sig', { verifyBip322: throws })).toBeNull();
        expect(
            await signedBindingText(statement, address, 'sig', {
                verifyBip322: (() => 'yes') as unknown as () => boolean,
            })
        ).toBeNull();
    });
});
