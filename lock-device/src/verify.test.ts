// Which keys an address binds, from raw relay events: event signature, the
// statement's own address, BIP-322, then revocations and the v2 rule.
import { describe, expect, it } from 'vitest';

import {
    boundNostrKeys,
    buildBindingStatement,
    buildRevocationStatement,
    deriveNostrKey,
    finalizeDeviceEvent,
    signNostrEvent,
    verifyDeviceRecords,
    verifyNostrEvent,
    type NostrEvent,
} from './index.js';

const ADDR = 'bc1qowner00000000000000000000000000000000';
const OTHER = 'bc1qother00000000000000000000000000000000';
const NOW = new Date('2026-10-25T12:00:00Z');
const sk = (n: number) => new Uint8Array(32).fill(n);

/** A stub wallet: a signature is "sig:<address>", valid only for that address's statement. */
const verifyBip322 = ({ address, message, signature }: { address: string; message: string; signature: string }) =>
    signature === `sig:${address}` && message.includes(`address: ${address}`);

function bindEvent(n: number, address = ADDR, signer = address, created_at = '2026-10-20T00:00:00Z'): NostrEvent {
    const { nostrPk } = deriveNostrKey(sk(n));
    return finalizeDeviceEvent({
        deviceSk: sk(n),
        address,
        device_id: `dev${n}`,
        device_pk: 'aa'.repeat(32),
        bindingStatement: buildBindingStatement({ address, device_pk: 'aa'.repeat(32), device_id: `dev${n}`, created_at, nostr_pk: nostrPk }),
        bindingSigBase64: `sig:${signer}`,
        createdAtUnix: 1_790_000_000,
    });
}

function revokeEvent(n: number, by: number, revoked_at = '2026-10-21T00:00:00Z'): NostrEvent {
    const { nostrSk, nostrPk } = deriveNostrKey(sk(by));
    return signNostrEvent(
        {
            pubkey: nostrPk,
            kind: 30078,
            created_at: 1_790_000_100,
            content: buildRevocationStatement({ address: ADDR, device_id: `dev${n}`, revoked_at }),
            tags: [
                ['d', `oc-lock:device:${ADDR}`],
                ['binding_sig', `sig:${ADDR}`],
            ],
        },
        nostrSk
    );
}

const key = (n: number) => deriveNostrKey(sk(n)).nostrPk;

describe('verifyNostrEvent', () => {
    it('needs the id to be the hash of the fields and the signature to verify', () => {
        const e = bindEvent(1);
        expect(verifyNostrEvent(e)).toBe(true);
        expect(verifyNostrEvent({ ...e, content: e.content + ' ' })).toBe(false);
        expect(verifyNostrEvent({ ...e, sig: 'ab'.repeat(64) })).toBe(false);
        expect(verifyNostrEvent({ ...e, id: 'ff'.repeat(32) })).toBe(false);
        expect(verifyNostrEvent({ ...e, sig: 'zz' })).toBe(false);
    });
});

describe('verifyDeviceRecords + boundNostrKeys', () => {
    it('binds the keys whose records the address signed', async () => {
        const v = await verifyDeviceRecords([bindEvent(1), bindEvent(2)], ADDR, { verifyBip322 });
        expect(boundNostrKeys(v, { now: NOW }).sort()).toEqual([key(1), key(2)].sort());
    });

    it('drops a forged event, a record naming another address, and one the address did not sign', async () => {
        const forged = { ...bindEvent(1), sig: bindEvent(2).sig };
        const elsewhere = bindEvent(3, OTHER);
        const unsigned = bindEvent(4, ADDR, OTHER);
        const v = await verifyDeviceRecords([forged, elsewhere, unsigned, bindEvent(5)], ADDR, { verifyBip322 });
        expect(boundNostrKeys(v, { now: NOW })).toEqual([key(5)]);
    });

    it('a v2 record binds its key only while one key carries it, and not after the sunset', async () => {
        const v2 = (n: number, carrier: number): NostrEvent => {
            const { nostrSk, nostrPk } = deriveNostrKey(sk(carrier));
            return signNostrEvent(
                {
                    pubkey: nostrPk,
                    kind: 30078,
                    created_at: 1_790_000_000,
                    content: buildBindingStatement({ address: ADDR, device_pk: 'aa'.repeat(32), device_id: `dev${n}`, created_at: '2026-10-20T00:00:00Z' }),
                    tags: [
                        ['d', `oc-lock:device:${ADDR}`],
                        ['addr', ADDR],
                        ['device_id', `dev${n}`],
                        ['device_pk', 'aa'.repeat(32)],
                        ['binding_sig', `sig:${ADDR}`],
                    ],
                },
                nostrSk
            );
        };
        const one = await verifyDeviceRecords([v2(7, 7)], ADDR, { verifyBip322 });
        expect(boundNostrKeys(one, { now: NOW })).toEqual([key(7)]);
        expect(boundNostrKeys(one, { now: new Date('2027-02-01T00:00:00Z') })).toEqual([]);
        const copied = await verifyDeviceRecords([v2(7, 7), v2(7, 8)], ADDR, { verifyBip322 });
        expect(boundNostrKeys(copied, { now: NOW })).toEqual([]);
    });

    it('a verifier that throws counts as no', async () => {
        const v = await verifyDeviceRecords([bindEvent(1)], ADDR, {
            verifyBip322: () => {
                throw new Error('bad address');
            },
        });
        expect(v).toEqual([]);
    });

    it('a verified revocation, carried by any key, retires the bind it names', async () => {
        const v = await verifyDeviceRecords([bindEvent(1), bindEvent(2), revokeEvent(1, 9)], ADDR, { verifyBip322 });
        expect(boundNostrKeys(v, { now: NOW })).toEqual([key(2)]);
    });

    it('refuses option keys it does not read', async () => {
        await expect(
            verifyDeviceRecords([], ADDR, { verifyBip322, verify: true } as unknown as Parameters<typeof verifyDeviceRecords>[2])
        ).rejects.toThrow(/does not read option "verify"/);
        expect(() => boundNostrKeys([], { now: NOW, at: 1 } as unknown as { now: Date })).toThrow(/does not read option "at"/);
    });
});
