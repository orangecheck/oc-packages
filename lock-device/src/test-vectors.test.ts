// OC Lock test vector a01 (oc-lock-protocol test-vectors/device-binding): the v2 inbox
// sunset and the v3 re-bind of a v2 device, checked byte for byte and case by case.
import { readFileSync } from 'node:fs';

import { x25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';

import {
    authorizedDevices,
    buildBindingStatement,
    buildRevocationStatement,
    computeNostrEventId,
    deriveNostrKey,
    liveDevices,
    parseDeviceEvent,
    V2_INBOX_SUNSET,
    type NostrEvent,
} from './index.js';

interface Case {
    records: string[];
    reader_time: string;
    live: string[];
    authorized: { record: string; pubkey: string }[];
}

const v = JSON.parse(
    readFileSync(new URL('../test-vectors/a01-v2-sunset.json', import.meta.url), 'utf8')
);
const hex = (u: Uint8Array) => Buffer.from(u).toString('hex');
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const NAMES = ['v2', 'v2_copy', 'v3_rebind', 'revocation', 'v3_rebind_later'];
const named: Record<string, NostrEvent> = Object.fromEntries(
    NAMES.map((n) => [n, v.expected[n].event])
);
const parsed = (name: string) =>
    Object.assign(
        parseDeviceEvent({ ...named[name]!, id: '0'.repeat(64), sig: '0'.repeat(128) }),
        { name }
    );

describe('test vector a01: the v2 inbox sunset', () => {
    it('is judged at the sunset this package applies', () => {
        expect(v.inputs.sunset).toBe(V2_INBOX_SUNSET);
    });

    it('derives the keys and builds both statements byte for byte', () => {
        const sk = bytes(v.inputs.device_sk);
        expect(hex(x25519.getPublicKey(sk))).toBe(v.expected.device_pk);
        expect(deriveNostrKey(sk)).toEqual({
            nostrSk: v.expected.nostr_sk,
            nostrPk: v.expected.nostr_pk,
        });
        const base = {
            address: v.inputs.address,
            device_pk: v.expected.device_pk,
            device_id: v.inputs.device_id,
            created_at: v.inputs.created_at,
        };
        expect(buildBindingStatement(base)).toBe(v.expected.v2.statement);
        expect(buildBindingStatement({ ...base, nostr_pk: v.expected.nostr_pk })).toBe(
            v.expected.v3_rebind.statement
        );
        expect(
            buildBindingStatement({
                ...base,
                nostr_pk: v.expected.nostr_pk,
                created_at: v.inputs.rebind_later_created_at,
            })
        ).toBe(v.expected.v3_rebind_later.statement);
        expect(
            buildRevocationStatement({
                address: v.inputs.address,
                device_id: v.inputs.device_id,
                revoked_at: v.inputs.revoked_at,
            })
        ).toBe(v.expected.revocation.statement);
    });

    it('computes every event id', () => {
        for (const n of NAMES) expect(computeNostrEventId(named[n]!)).toBe(v.expected[n].event_id);
    });

    it.each(v.expected.cases.cases as Case[])('$records at $reader_time', (c) => {
        const now = new Date(c.reader_time);
        const live = liveDevices(c.records.map(parsed), { now });
        expect(live.map((r) => r.name).sort()).toEqual(c.live);
        const authorized = authorizedDevices(live, { now }).map((r) => ({
            record: r.name,
            pubkey: r.nostrPubkey,
        }));
        expect(authorized).toEqual(c.authorized);
    });
});
