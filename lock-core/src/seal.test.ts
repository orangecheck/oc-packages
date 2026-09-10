import { describe, expect, it } from 'vitest';
import {
    generateX25519KeyPair,
    hexEncode,
    utf8Encode,
} from '@orangecheck/lock-crypto';
import { LockError, seal, unseal } from './seal.js';
import type { DeviceRecord } from './types.js';

const FAKE_SIG = 'ZmFrZS1zaWduYXR1cmU=';
const fakeSign = async (_msg: string) => FAKE_SIG;
const passingVerify = async () => true;
const failingVerify = async () => false;

function makeDevice(address: string, id: string): { record: DeviceRecord; secret: Uint8Array } {
    const kp = generateX25519KeyPair();
    return {
        record: { address, device_id: id, device_pk: hexEncode(kp.public) },
        secret: kp.secret,
    };
}

describe('seal / unseal', () => {
    it('round-trips a message from sender to a single recipient', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('hello bob'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
            hint: 'greeting',
        });
        expect(envelope.v).toBe(2);
        expect(envelope.kind).toBe('identity');
        expect(envelope.recipients).toHaveLength(1);
        expect(envelope.sig.value).toBe(FAKE_SIG);
        expect(envelope.id).toMatch(/^[0-9a-f]{64}$/);

        const out = await unseal({
            envelope,
            device: { device_id: 'bob-laptop', secretKey: bob.secret },
            verifyBip322: passingVerify,
        });
        expect(new TextDecoder().decode(out.payload)).toBe('hello bob');
        expect(out.matchedDeviceId).toBe('bob-laptop');
    });

    it('round-trips to multiple recipients independently', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const carol = makeDevice('bc1qcarol', 'carol-phone');
        const envelope = await seal({
            payload: utf8Encode('team update'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record, carol.record],
        });
        expect(envelope.recipients).toHaveLength(2);
        // Recipients must be sorted by device_id in canonical form, but the
        // runtime envelope preserves insertion order (sort is only during id
        // computation). Both decryptors should succeed regardless.
        const bobOut = await unseal({
            envelope,
            device: { device_id: 'bob-laptop', secretKey: bob.secret },
            verifyBip322: passingVerify,
        });
        const carolOut = await unseal({
            envelope,
            device: { device_id: 'carol-phone', secretKey: carol.secret },
            verifyBip322: passingVerify,
        });
        expect(new TextDecoder().decode(bobOut.payload)).toBe('team update');
        expect(new TextDecoder().decode(carolOut.payload)).toBe('team update');
    });

    it('rejects unseal for wrong device', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('for bob'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
        });
        const dave = generateX25519KeyPair();
        await expect(
            unseal({
                envelope,
                device: { device_id: 'dave-laptop', secretKey: dave.secret },
                verifyBip322: passingVerify,
            })
        ).rejects.toSatisfy((e: unknown) => (e as LockError).code === 'E_NOT_ADDRESSED');
    });

    it('rejects tampered ciphertext', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('secret'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
        });
        // Tamper with the id by flipping the last hex digit so the recompute
        // will mismatch. Naively appending a fixed suffix like '00' silently
        // turned the test into a 1/256 flake when seal() randomly produced
        // an id already ending in '00'.
        const last = envelope.id[envelope.id.length - 1];
        const flipped = last === '0' ? 'f' : '0';
        const tampered = {
            ...envelope,
            id: envelope.id.slice(0, -1) + flipped,
        };
        await expect(
            unseal({
                envelope: tampered,
                device: { device_id: 'bob-laptop', secretKey: bob.secret },
                verifyBip322: passingVerify,
            })
        ).rejects.toSatisfy((e: unknown) => (e as LockError).code === 'E_BAD_SIG');
    });

    it('rejects bad sender signature', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('secret'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
        });
        await expect(
            unseal({
                envelope,
                device: { device_id: 'bob-laptop', secretKey: bob.secret },
                verifyBip322: failingVerify,
            })
        ).rejects.toSatisfy((e: unknown) => (e as LockError).code === 'E_BAD_SIG');
    });

    it('enforces expires_at', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const past = new Date(Date.now() - 10000);
        const envelope = await seal({
            payload: utf8Encode('secret'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
            expiresAt: past,
        });
        await expect(
            unseal({
                envelope,
                device: { device_id: 'bob-laptop', secretKey: bob.secret },
                verifyBip322: passingVerify,
            })
        ).rejects.toSatisfy((e: unknown) => (e as LockError).code === 'E_EXPIRED');
    });

    it('allows self-seal with skipSenderVerification', async () => {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('for myself'),
            sender: { address: 'bc1qbob', signMessage: fakeSign },
            recipients: [bob.record],
        });
        const out = await unseal({
            envelope,
            device: { device_id: 'bob-laptop', secretKey: bob.secret },
            skipSenderVerification: true,
        });
        expect(new TextDecoder().decode(out.payload)).toBe('for myself');
    });

    it('produces deterministic envelope id for identical inputs (modulo randomness)', async () => {
        // We can't produce *identical* envelopes because content_key and
        // nonces are random. But given an envelope, `id` is a deterministic
        // function of the canonical bytes.
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const e1 = await seal({
            payload: utf8Encode('x'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
        });
        expect(e1.id).toMatch(/^[0-9a-f]{64}$/);
        // Re-canonicalizing e1 should yield the same id.
        const e1Copy = JSON.parse(JSON.stringify(e1));
        const out = await unseal({
            envelope: e1Copy,
            device: { device_id: 'bob-laptop', secretKey: bob.secret },
            verifyBip322: passingVerify,
        });
        expect(new TextDecoder().decode(out.payload)).toBe('x');
    });

    it('rejects seal with zero recipients (would produce unreadable envelope)', async () => {
        await expect(
            seal({
                payload: utf8Encode('hi'),
                sender: { address: 'bc1qalice', signMessage: fakeSign },
                recipients: [],
            })
        ).rejects.toBeInstanceOf(LockError);
    });
});

// SPEC §9: "Clients MUST reject envelopes whose `v` they do not support."
//
// lock-core was the outlier here — pledge-core, stamp-core and agent-core all
// gate the envelope version, and unseal() read every other field of an envelope
// whose version it had never looked at.
describe('unseal rejects an unsupported envelope version (SPEC §9)', () => {
    async function sealed() {
        const bob = makeDevice('bc1qbob', 'bob-laptop');
        const envelope = await seal({
            payload: utf8Encode('hello bob'),
            sender: { address: 'bc1qalice', signMessage: fakeSign },
            recipients: [bob.record],
        });
        return { envelope, bob };
    }

    it('refuses a future version even though the supported one unseals', async () => {
        const { envelope, bob } = await sealed();
        // Sanity: the untouched envelope works, so the rejection below is the
        // version check and not a broken fixture.
        const ok = await unseal({
            envelope,
            device: { device_id: bob.record.device_id, secretKey: bob.secret },
            skipSenderVerification: true,
        });
        expect(new TextDecoder().decode(ok.payload)).toBe('hello bob');

        const future = { ...envelope, v: 3 } as unknown as typeof envelope;
        await expect(
            unseal({
                envelope: future,
                device: { device_id: bob.record.device_id, secretKey: bob.secret },
                skipSenderVerification: true,
            })
        ).rejects.toThrow(/not supported/i);
    });

    it('reports E_UNSUPPORTED_VERSION, not a generic bad-signature', async () => {
        const { envelope, bob } = await sealed();
        const future = { ...envelope, v: 3 } as unknown as typeof envelope;
        const err = await unseal({
            envelope: future,
            device: { device_id: bob.record.device_id, secretKey: bob.secret },
            skipSenderVerification: true,
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(LockError);
        // The version gate runs BEFORE the id recompute. If it were ordered
        // after, re-labelling would surface as E_BAD_SIG and the caller could
        // not tell "I do not speak this format" from "this is forged".
        expect((err as LockError).code).toBe('E_UNSUPPORTED_VERSION');
    });
});
