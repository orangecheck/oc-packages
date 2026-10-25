// OC Lock SPEC §3.5: a revocation is read from its signed statement alone. Its
// tags are an index, so odd ones do not stop it, and one that signs no readable
// revoked_at retires every bind of its device. Test vector r03 carries real
// BIP-322 signatures; the cases below it bend one record at a time.
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
    buildBindingStatement,
    buildRevocationStatement,
    computeNostrEventId,
    liveDevices,
    parseDeviceEvent,
    type NostrEvent,
    type ParsedDeviceEvent,
} from './index.js';

const v = JSON.parse(
    readFileSync(
        new URL('../test-vectors/r03-revocation-read-from-statement.json', import.meta.url),
        'utf8'
    )
);
const NAMES = ['b01', 'rebind', 'revocation_bare', 'revocation_misfiled', 'revocation_undated'];
const parsed = (name: string) =>
    Object.assign(
        parseDeviceEvent({ ...v.expected[name].event, id: '0'.repeat(64), sig: '0'.repeat(128) }),
        { name }
    );

describe('test vector r03: a revocation is read from its signed statement', () => {
    it('computes every event id', () => {
        for (const n of NAMES)
            expect(computeNostrEventId(v.expected[n].event)).toBe(v.expected[n].event_id);
    });

    it('reads every revocation as one of (address, device_id) from the signed bytes', () => {
        for (const n of NAMES.filter((n) => n.startsWith('revocation_'))) {
            const r = parsed(n);
            expect(r).toMatchObject({
                address: v.inputs.address,
                device_id: v.inputs.device_id,
                device_pk: 'revoked',
                revoked: true,
                bindingStatement: v.expected[n].statement,
                bindingSigBase64: v.expected[n].binding_sig,
            });
        }
    });

    it.each(v.expected.live.cases as { records: string[]; live: string[] }[])(
        '$records leaves $live live',
        (c) => {
            const now = new Date(v.inputs.reader_time);
            const live = liveDevices(c.records.map(parsed), { now });
            expect(live.map((r) => r.name).sort()).toEqual(c.live);
        }
    );
});

const ADDR = 'bc1qowner00000000000000000000000000000000';
const DEVICE = '0'.repeat(32);

function bind(created_at: string): ParsedDeviceEvent {
    const content = buildBindingStatement({
        address: ADDR,
        device_pk: 'aa'.repeat(32),
        device_id: DEVICE,
        created_at,
    });
    return parseDeviceEvent(
        event(content, [
            ['d', `oc-lock:device:${ADDR}`],
            ['addr', ADDR],
            ['device_id', DEVICE],
            ['device_pk', 'aa'.repeat(32)],
            ['binding_sig', 'SIG'],
        ])
    );
}

function event(content: string, tags: string[][]): NostrEvent {
    return {
        id: 'f'.repeat(64),
        pubkey: 'c'.repeat(64),
        kind: 30078,
        created_at: 1_780_000_000,
        content,
        tags,
        sig: 'd'.repeat(128),
    };
}

const revocation = buildRevocationStatement({
    address: ADDR,
    device_id: DEVICE,
    revoked_at: '2026-10-21T00:00:00.000Z',
});

describe('a revocation whatever its tags say', () => {
    it.each([
        ['only binding_sig', [['binding_sig', 'SIG']]],
        [
            'tags naming another address, device and a live key',
            [
                ['d', 'oc-lock:device:bc1qother'],
                ['addr', 'bc1qother'],
                ['device_id', 'f'.repeat(32)],
                ['device_pk', 'aa'.repeat(32)],
                ['binding_sig', 'SIG'],
            ],
        ],
    ])('retires the earlier bind when it carries %s', (_, tags) => {
        const r = parseDeviceEvent(event(revocation, tags));
        expect(r).toMatchObject({ address: ADDR, device_id: DEVICE, revoked: true });
        expect(liveDevices([bind('2026-10-20T00:00:00.000Z'), r])).toEqual([]);
    });

    it('still needs a binding_sig, its only authority', () => {
        expect(() => parseDeviceEvent(event(revocation, [['d', `oc-lock:device:${ADDR}`]]))).toThrow(
            /binding_sig/
        );
    });
});

describe('a revocation that signs no readable revoked_at', () => {
    const dateless = (line: string | null) =>
        parseDeviceEvent(
            event(
                `oc-lock:device-revoke:v2\naddress: ${ADDR}\ndevice_id: ${DEVICE}\n${line ?? ''}`,
                [['binding_sig', 'SIG']]
            )
        );

    it.each([
        ['no revoked_at line', null],
        ['a revoked_at that is not a time', 'revoked_at: soon\n'],
    ])('with %s retires every bind of its device, a later one too', (_, line) => {
        const binds = [bind('2026-10-20T00:00:00.000Z'), bind('2026-10-23T00:00:00.000Z')];
        const now = new Date('2026-10-24T00:00:00.000Z');
        expect(liveDevices(binds, { now })).toHaveLength(2);
        expect(liveDevices([...binds, dateless(line)], { now })).toEqual([]);
    });
});
