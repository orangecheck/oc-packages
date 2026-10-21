// A wallet-signed revocation retires a device wherever it is seen, whichever key
// carried it; relay replacement is not needed.
import { describe, expect, it } from 'vitest';

import {
    buildBindingStatement,
    buildRevocationStatement,
    liveDevices,
    parseDeviceEvent,
    signedTime,
    type ParsedDeviceEvent,
} from './index.js';

const ADDR = 'bc1qowner00000000000000000000000000000000';
const OTHER_ADDR = 'bc1qother00000000000000000000000000000000';
const K1 = '1'.repeat(64); // the device's own Nostr key
const K2 = '2'.repeat(64); // a fresh key, from another device or the wallet

function bind(device_id: string, created_at: string, pubkey = K1, address = ADDR): ParsedDeviceEvent {
    const content = buildBindingStatement({ address, device_pk: 'aa'.repeat(32), device_id, created_at, nostr_pk: pubkey });
    return parseDeviceEvent({
        id: `${device_id}-${created_at}`,
        pubkey,
        kind: 30078,
        created_at: 1_780_000_000,
        content,
        tags: [
            ['d', `oc-lock:device:${address}`],
            ['addr', address],
            ['device_id', device_id],
            ['device_pk', 'aa'.repeat(32)],
            ['binding_sig', 'SIG'],
        ],
        sig: 'd'.repeat(128),
    });
}

function revoke(device_id: string, revoked_at: string, pubkey = K2, address = ADDR): ParsedDeviceEvent {
    const content = buildRevocationStatement({ address, device_id, revoked_at });
    return parseDeviceEvent({
        id: `rev-${device_id}-${revoked_at}`,
        pubkey,
        kind: 30078,
        created_at: 1_780_000_100,
        content,
        tags: [
            ['d', `oc-lock:device:${address}`],
            ['addr', address],
            ['device_id', device_id],
            ['device_pk', 'revoked'],
            ['binding_sig', 'SIG'],
        ],
        sig: 'd'.repeat(128),
    });
}

const ids = (rs: ParsedDeviceEvent[]) => rs.map((r) => r.device_id).sort();

describe('liveDevices', () => {
    it('keeps every bind when there is no revocation', () => {
        expect(ids(liveDevices([bind('laptop', '2026-09-01T00:00:00Z'), bind('phone', '2026-09-02T00:00:00Z')]))).toEqual(['laptop', 'phone']);
    });

    it('a revocation carried by another key retires the device bound under K1', () => {
        const live = liveDevices([bind('laptop', '2026-09-01T00:00:00Z', K1), revoke('laptop', '2026-10-01T00:00:00Z', K2)]);
        expect(live).toEqual([]);
    });

    it('retires the bind even while other relays still serve it (partial acceptance)', () => {
        // Three relays returned the bind, two the revocation; the query dedupes by id.
        const b = bind('laptop', '2026-09-01T00:00:00Z');
        const live = liveDevices([b, b, b, revoke('laptop', '2026-10-01T00:00:00Z'), bind('phone', '2026-09-03T00:00:00Z')]);
        expect(ids(live)).toEqual(['phone']);
    });

    it('a bind signed after the revocation stays live', () => {
        const live = liveDevices([revoke('laptop', '2026-10-01T00:00:00Z'), bind('laptop', '2026-10-02T00:00:00Z')]);
        expect(ids(live)).toEqual(['laptop']);
    });

    it('a bind signed at the same instant as the revocation is retired', () => {
        expect(liveDevices([bind('laptop', '2026-10-01T00:00:00Z'), revoke('laptop', '2026-10-01T00:00:00Z')])).toEqual([]);
    });

    it('a revocation reaches only its own address and device', () => {
        const live = liveDevices([
            bind('laptop', '2026-09-01T00:00:00Z', K1, ADDR),
            bind('laptop', '2026-09-01T00:00:00Z', K1, OTHER_ADDR),
            bind('phone', '2026-09-01T00:00:00Z', K1, ADDR),
            revoke('laptop', '2026-10-01T00:00:00Z', K2, ADDR),
        ]);
        expect(live.map((r) => `${r.address === ADDR ? 'A' : 'B'}:${r.device_id}`).sort()).toEqual(['A:phone', 'B:laptop']);
    });

    it('the latest revocation of a device decides', () => {
        const live = liveDevices([
            revoke('laptop', '2026-09-10T00:00:00Z'),
            bind('laptop', '2026-09-20T00:00:00Z'),
            revoke('laptop', '2026-10-01T00:00:00Z'),
        ]);
        expect(live).toEqual([]);
    });

    it('never returns a revocation record itself', () => {
        expect(liveDevices([revoke('laptop', '2026-10-01T00:00:00Z')])).toEqual([]);
    });
});

describe('signedTime', () => {
    it('reads a timestamp line from a signed statement', () => {
        const s = buildRevocationStatement({ address: ADDR, device_id: 'x', revoked_at: '2026-10-01T00:00:00Z' });
        expect(signedTime(s, 'revoked_at')).toBe(Date.parse('2026-10-01T00:00:00Z'));
        expect(signedTime(s, 'created_at')).toBeNull();
    });
});
