// The BIP-322 signature covers event.content and nothing else. Tags are an
// index a relay lets anyone write, so a value read from a tag is authenticated
// by nobody.
//
// Before parseDeviceEvent cross-checked them, this was a total confidentiality
// break that needed no key material: republish a victim's device event with
// their REAL content and REAL binding_sig, change only the device_pk tag.
// verifyBip322(content, sig, addr) passes — every signed byte is genuine — and
// the sender seals the content key to the attacker, because the recipient
// record was built from the tag.
import { describe, expect, it } from 'vitest';

import { buildBindingStatement, buildRevocationStatement, parseDeviceEvent } from './index.js';

const VICTIM = 'bc1qvictim0000000000000000000000000000000';
const VICTIM_PK = 'aa'.repeat(32);
const ATTACKER_PK = 'bb'.repeat(32);
const DEVICE = 'victim-laptop';

const statement = buildBindingStatement({
    address: VICTIM,
    device_pk: VICTIM_PK,
    device_id: DEVICE,
    created_at: '2026-09-01T00:00:00Z',
});

function event(tags: string[][], content = statement) {
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

const honestTags = [
    ['d', `oc-lock:device:${VICTIM}`],
    ['addr', VICTIM],
    ['device_id', DEVICE],
    ['device_pk', VICTIM_PK],
    ['binding_sig', 'VICTIMS_REAL_SIGNATURE'],
];

describe('parseDeviceEvent trusts the signed statement, not the tags', () => {
    it('accepts an honest record and returns the signed key', () => {
        const p = parseDeviceEvent(event(honestTags));
        expect(p.device_pk).toBe(VICTIM_PK);
        expect(p.address).toBe(VICTIM);
        expect(p.revoked).toBe(false);
    });

    // The attack: one tag changed, every signed byte genuine.
    it('REJECTS a substituted device_pk tag', () => {
        const tags = honestTags.map((t) =>
            t[0] === 'device_pk' ? ['device_pk', ATTACKER_PK] : t,
        );
        expect(() => parseDeviceEvent(event(tags))).toThrow(/device_pk tag does not match/i);
    });

    it('REJECTS a substituted addr tag', () => {
        const tags = honestTags.map((t) => (t[0] === 'addr' ? ['addr', 'bc1qattacker'] : t));
        expect(() => parseDeviceEvent(event(tags))).toThrow(/addr tag .* does not match/i);
    });

    it('REJECTS a substituted device_id tag', () => {
        const tags = honestTags.map((t) =>
            t[0] === 'device_id' ? ['device_id', 'other-device'] : t,
        );
        expect(() => parseDeviceEvent(event(tags))).toThrow(/device_id tag .* does not match/i);
    });

    it('REJECTS content that is not a v2 statement at all', () => {
        expect(() => parseDeviceEvent(event(honestTags, 'hello'))).toThrow(/not a v2 bind or revoke/i);
    });

    it('accepts a genuine revocation and reports it revoked', () => {
        const revoke = buildRevocationStatement({
            address: VICTIM,
            device_id: DEVICE,
            revoked_at: '2026-09-02T00:00:00Z',
        });
        const tags = honestTags.map((t) => (t[0] === 'device_pk' ? ['device_pk', 'revoked'] : t));
        const p = parseDeviceEvent(event(tags, revoke));
        expect(p.revoked).toBe(true);
        expect(p.device_pk).toBe('revoked');
    });

    // A revocation statement smuggled in under a live-looking key tag would
    // otherwise read as an active device.
    it('REJECTS a revocation statement whose device_pk tag claims a live key', () => {
        const revoke = buildRevocationStatement({
            address: VICTIM,
            device_id: DEVICE,
            revoked_at: '2026-09-02T00:00:00Z',
        });
        expect(() => parseDeviceEvent(event(honestTags, revoke))).toThrow(/not "revoked"/i);
    });
});
