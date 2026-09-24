// A v3 bind statement signs the device's Nostr pubkey; a v2 statement does not,
// so a v2 record's event pubkey is only its author's claim.
import { describe, expect, it } from 'vitest';

import { authorizedDevices, buildBindingStatement, parseDeviceEvent } from './index.js';

const ADDR = 'bc1qowner00000000000000000000000000000000';
const DEVICE_PK = 'aa'.repeat(32);
const DEVICE_ID = 'owner-laptop';
const OWNER_NOSTR = '1'.repeat(64);
const OTHER_NOSTR = '2'.repeat(64);

function statement(nostr_pk?: string, device_id = DEVICE_ID) {
    return buildBindingStatement({
        address: ADDR,
        device_pk: DEVICE_PK,
        device_id,
        created_at: '2026-09-01T00:00:00Z',
        ...(nostr_pk ? { nostr_pk } : {}),
    });
}

function event(pubkey: string, content: string, device_id = DEVICE_ID) {
    return {
        id: 'f'.repeat(64),
        pubkey,
        kind: 30078,
        created_at: 1_780_000_000,
        content,
        tags: [
            ['d', `oc-lock:device:${ADDR}`],
            ['addr', ADDR],
            ['device_id', device_id],
            ['device_pk', DEVICE_PK],
            ['binding_sig', 'SIG'],
        ],
        sig: 'd'.repeat(128),
    };
}

describe('v3 bind statement', () => {
    it('is canonical and carries nostr_pk after device_pk', () => {
        expect(statement(OWNER_NOSTR)).toBe(
            'oc-lock:device-bind:v3\n' +
                `address: ${ADDR}\n` +
                `device_pk: ${DEVICE_PK}\n` +
                `nostr_pk: ${OWNER_NOSTR}\n` +
                `device_id: ${DEVICE_ID}\n` +
                'created_at: 2026-09-01T00:00:00Z\n'
        );
    });

    it('parses when the event pubkey is the signed nostr_pk', () => {
        const p = parseDeviceEvent(event(OWNER_NOSTR, statement(OWNER_NOSTR)));
        expect(p.bindingVersion).toBe('v3');
        expect(p.nostrPubkey).toBe(OWNER_NOSTR);
    });

    it('rejects the same statement carried by a different pubkey', () => {
        expect(() => parseDeviceEvent(event(OTHER_NOSTR, statement(OWNER_NOSTR)))).toThrow(
            /signed nostr_pk/
        );
    });

    it('rejects a v3 statement without a well-formed nostr_pk', () => {
        const bad = statement(OWNER_NOSTR).replace(`nostr_pk: ${OWNER_NOSTR}`, 'nostr_pk: xyz');
        expect(() => parseDeviceEvent(event(OWNER_NOSTR, bad))).toThrow();
    });

    it('a v2 statement parses as v2', () => {
        expect(parseDeviceEvent(event(OWNER_NOSTR, statement())).bindingVersion).toBe('v2');
    });
});

describe('authorizedDevices', () => {
    const v2Owner = parseDeviceEvent(event(OWNER_NOSTR, statement()));
    const v2Other = parseDeviceEvent(event(OTHER_NOSTR, statement()));
    const v3Owner = parseDeviceEvent(event(OWNER_NOSTR, statement(OWNER_NOSTR)));

    it('authorizes a v2 device seen under exactly one pubkey', () => {
        expect(authorizedDevices([v2Owner]).map((d) => d.nostrPubkey)).toEqual([OWNER_NOSTR]);
    });

    it('authorizes neither pubkey when one v2 device appears under two', () => {
        expect(authorizedDevices([v2Owner, v2Other])).toEqual([]);
    });

    it('a v3 record for the device supersedes every v2 copy of it', () => {
        expect(authorizedDevices([v2Other, v3Owner, v2Owner]).map((d) => d.nostrPubkey)).toEqual(
            [OWNER_NOSTR]
        );
        expect(authorizedDevices([v2Other, v3Owner])).toEqual([v3Owner]);
    });

    it('scopes the v2 rule per device_id', () => {
        const second = parseDeviceEvent(
            event(OTHER_NOSTR, statement(undefined, 'owner-phone'), 'owner-phone')
        );
        expect(authorizedDevices([v2Owner, second]).map((d) => d.device_id)).toEqual([
            DEVICE_ID,
            'owner-phone',
        ]);
    });
});
