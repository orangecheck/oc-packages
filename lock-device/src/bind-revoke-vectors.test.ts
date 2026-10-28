// OC Lock test vectors b01, r01 and r02 (oc-lock-protocol test-vectors/device-binding at
// 103ff4b, vendored byte for byte): this package's builders reproduce each statement, tag
// list and event id, and its readers (verifyDeviceRecords, then liveDevices and
// pendingDevices) judge each case as the vector does.
import { readFileSync } from 'node:fs';

import { x25519 } from '@noble/curves/ed25519';
import { schnorr } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';

import {
    buildBindingStatement,
    buildDeviceEvent,
    buildRevocationStatement,
    computeNostrEventId,
    DEFAULT_BIND_SKEW_MS,
    deriveNostrKey,
    finalizeDeviceEvent,
    liveDevices,
    parseDeviceEvent,
    pendingDevices,
    revokedAtFor,
    signNostrEvent,
    verifyDeviceRecords,
    verifyNostrEvent,
    type NostrEvent,
} from './index.js';

const load = (name: string) =>
    JSON.parse(readFileSync(new URL(`../test-vectors/${name}.json`, import.meta.url), 'utf8'));
const b01 = load('b01-bind-v3');
const r01 = load('r01-revoke-k2');
const r02 = load('r02-bind-ahead');

const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

/** A bind from the device's own secret, as finalizeDeviceEvent publishes it. */
function bindFrom(
    deviceSkHex: string,
    fields: { address: string; device_id: string; created_at: string },
    expected: { device_pk: string; nostr_pk: string; statement: string; binding_sig: string },
    createdAtUnix: number
): NostrEvent {
    const sk = bytes(deviceSkHex);
    expect(hex(x25519.getPublicKey(sk))).toBe(expected.device_pk);
    expect(deriveNostrKey(sk).nostrPk).toBe(expected.nostr_pk);
    const statement = buildBindingStatement({
        ...fields,
        device_pk: expected.device_pk,
        nostr_pk: expected.nostr_pk,
    });
    expect(statement).toBe(expected.statement);
    return finalizeDeviceEvent({
        deviceSk: sk,
        address: fields.address,
        device_id: fields.device_id,
        device_pk: expected.device_pk,
        bindingStatement: statement,
        bindingSigBase64: expected.binding_sig,
        createdAtUnix,
    });
}

/** A revocation carried by a Nostr key that is not the device's (SPEC §3.5). */
function carried(
    carrierSkHex: string,
    fields: { address: string; device_id: string; revoked_at: string },
    expected: { carrier_pubkey: string; statement: string; binding_sig: string },
    createdAtUnix: number
): NostrEvent {
    const pubkey = hex(schnorr.getPublicKey(bytes(carrierSkHex)));
    expect(pubkey).toBe(expected.carrier_pubkey);
    const statement = buildRevocationStatement(fields);
    expect(statement).toBe(expected.statement);
    const unsigned = buildDeviceEvent({
        address: fields.address,
        device_id: fields.device_id,
        device_pk: 'revoked',
        bindingStatement: statement,
        bindingSigBase64: expected.binding_sig,
        createdAtUnix,
    });
    return signNostrEvent({ ...unsigned, pubkey }, carrierSkHex);
}

/** The vector's event fields, so a built event is compared field by field and by id. */
function matches(
    built: NostrEvent,
    expected: { event: Omit<NostrEvent, 'id' | 'sig'>; event_id: string }
) {
    expect({
        pubkey: built.pubkey,
        created_at: built.created_at,
        kind: built.kind,
        tags: built.tags,
        content: built.content,
    }).toEqual(expected.event);
    expect(computeNostrEventId(expected.event)).toBe(expected.event_id);
    expect(built.id).toBe(expected.event_id);
    expect(verifyNostrEvent(built)).toBe(true);
}

// This package takes its BIP-322 verifier from the caller. The vectors name the
// signatures that verify (expected.*), so this one answers yes to exactly those.
const verifies = new Set(
    [
        b01.expected,
        r01.expected.revocation,
        r01.expected.rebind,
        r02.expected.ahead,
        r02.expected.revocation,
        r02.expected.revocation_now,
    ].map((e) => `${e.statement}\u0000${e.binding_sig}`)
);
const verifyBip322 = (a: { address: string; message: string; signature: string }) =>
    a.address === b01.inputs.address && verifies.has(`${a.message}\u0000${a.signature}`);

/** A case as a reader judges it: signed events, verifyDeviceRecords, then live and pending. */
async function judge(events: Record<string, NostrEvent>, records: string[], now: Date) {
    const name = new Map(Object.entries(events).map(([n, e]) => [e.id, n]));
    const verified = await verifyDeviceRecords(
        records.map((r) => events[r]!),
        b01.inputs.address,
        { verifyBip322 }
    );
    const names = (rs: { eventId: string }[]) => rs.map((r) => name.get(r.eventId)!).sort();
    return {
        live: names(liveDevices(verified, { now })),
        pending: names(pendingDevices(verified, { now })),
    };
}

const b01Event = () =>
    bindFrom(b01.inputs.device_sk, b01.inputs, b01.expected, b01.inputs.event_created_at);

describe('test vector b01: a v3 bind', () => {
    it('derives the Nostr key from the device secret', () => {
        expect(deriveNostrKey(bytes(b01.inputs.device_sk))).toEqual({
            nostrSk: b01.expected.nostr_sk,
            nostrPk: b01.expected.nostr_pk,
        });
    });

    it('builds the statement, tags and event id byte for byte', () => {
        const ev = b01Event();
        matches(ev, b01.expected);
        expect(parseDeviceEvent(ev)).toMatchObject({
            address: b01.inputs.address,
            device_id: b01.inputs.device_id,
            device_pk: b01.expected.device_pk,
            revoked: false,
            nostrPubkey: b01.expected.nostr_pk,
            bindingVersion: 'v3',
        });
    });

    it('refuses the same record carried by any other Nostr key', () => {
        const moved = {
            ...b01.expected.event,
            pubkey: b01.reject.other_pubkey,
            id: '0'.repeat(64),
            sig: '0'.repeat(128),
        };
        expect(() => parseDeviceEvent(moved)).toThrow(/does not match the signed nostr_pk/);
    });
});

describe('test vector r01: a revocation carried by another key', () => {
    const fields = { address: r01.inputs.address, device_id: r01.inputs.device_id };
    const revocation = (bindingSig = r01.expected.revocation.binding_sig) =>
        carried(
            r01.inputs.carrier_nostr_sk,
            { ...fields, revoked_at: r01.inputs.revoked_at },
            { ...r01.expected.revocation, binding_sig: bindingSig },
            r01.inputs.revocation_event_created_at
        );
    const rebind = () =>
        bindFrom(
            r01.inputs.rebind_device_sk,
            { ...fields, created_at: r01.inputs.rebind_created_at },
            r01.expected.rebind,
            r01.inputs.rebind_event_created_at
        );

    it('builds the revocation under the carrier key, byte for byte', () => {
        const ev = revocation();
        matches(ev, r01.expected.revocation);
        expect(ev.pubkey).not.toBe(b01.expected.nostr_pk);
        expect(parseDeviceEvent(ev)).toMatchObject({
            device_id: r01.inputs.device_id,
            revoked: true,
        });
    });

    it('builds the re-bind signed after it, byte for byte', () => {
        matches(rebind(), r01.expected.rebind);
    });

    it('computes the id of the record whose signature does not verify', () => {
        const bad = r01.reject.revocation_bad_sig;
        expect(computeNostrEventId(bad.event)).toBe(bad.event_id);
        expect(bad.event.content).toBe(r01.expected.revocation.statement);
        expect(bad.binding_sig).not.toBe(r01.expected.revocation.binding_sig);
    });

    it.each(r01.expected.live.cases as { records: string[]; live: string[] }[])(
        '$records',
        async (c) => {
            const events = {
                b01: b01Event(),
                revocation: revocation(),
                rebind: rebind(),
                // The vector does not give its carrier key, so its statement and
                // binding_sig ride the r01 carrier: a valid event, a signature that is not.
                revocation_bad_sig: revocation(r01.reject.revocation_bad_sig.binding_sig),
            };
            const now = new Date(r01.inputs.rebind_created_at);
            expect((await judge(events, c.records, now)).live).toEqual([...c.live].sort());
        }
    );
});

describe('test vector r02: a bind dated ahead of the clock', () => {
    const fields = { address: r02.inputs.address, device_id: r02.inputs.device_id };
    const ahead = () =>
        bindFrom(
            r02.inputs.ahead_device_sk,
            { ...fields, created_at: r02.inputs.ahead_created_at },
            r02.expected.ahead,
            r02.inputs.event_created_at
        );
    const revocation = () =>
        carried(
            r02.inputs.carrier_nostr_sk,
            { ...fields, revoked_at: r02.inputs.ahead_created_at },
            r02.expected.revocation,
            r02.inputs.event_created_at
        );
    const revocationNow = () =>
        carried(
            r02.inputs.carrier_now_nostr_sk,
            { ...fields, revoked_at: r02.inputs.revoked_now_at },
            r02.expected.revocation_now,
            r02.inputs.event_created_at
        );

    it('builds the bind dated ahead, byte for byte', () => {
        matches(ahead(), r02.expected.ahead);
    });

    it('dates the revocation at the bind, not at the clock, and builds it byte for byte', () => {
        const revokedAt = revokedAtFor(
            [parseDeviceEvent(ahead())],
            r02.inputs.address,
            r02.inputs.device_id,
            new Date(r02.inputs.revoked_now_at)
        );
        expect(revokedAt).toBe(r02.inputs.ahead_created_at);
        const ev = carried(
            r02.inputs.carrier_nostr_sk,
            { ...fields, revoked_at: revokedAt },
            r02.expected.revocation,
            r02.inputs.event_created_at
        );
        matches(ev, r02.expected.revocation);
    });

    it('builds the revocation dated at the clock, byte for byte', () => {
        matches(revocationNow(), r02.expected.revocation_now);
    });

    it('judges with the skew the vector names', () => {
        expect(DEFAULT_BIND_SKEW_MS).toBe(r02.inputs.max_skew_seconds * 1000);
    });

    type Case = { records: string[]; verified_at: string; live: string[]; pending: string[] };
    it.each(r02.expected.live.cases as Case[])('$records at $verified_at', async (c) => {
        const events = {
            b01: b01Event(),
            ahead: ahead(),
            revocation: revocation(),
            revocation_now: revocationNow(),
        };
        expect(await judge(events, c.records, new Date(c.verified_at))).toEqual({
            live: [...c.live].sort(),
            pending: [...c.pending].sort(),
        });
    });
});
