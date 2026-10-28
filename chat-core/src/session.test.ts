// did:oc session devices (SPEC §8.6): the host's vouch, its revocations, and
// which keys bind, from the records a relay holds.

import { ed25519 } from '@noble/curves/ed25519';
import { utf8Encode } from '@orangecheck/lock-crypto';
import { deriveNostrKey, generateDeviceKey, signNostrEvent } from '@orangecheck/lock-device';
import { describe, expect, it } from 'vitest';

import type { NostrEvent } from './event';
import { recordReads } from './records';
import {
    liveSessionDevices,
    sessionKeysEverBound,
    verifyHostRevocation,
    verifySessionVouch,
    vouchIssuedAt,
    VOUCH_JWS_TYP,
    type AuthHostKey,
    type VouchSubject,
} from './session';

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const HOST_SK = new Uint8Array(32).fill(42);
const HOST_KEY: AuthHostKey = { kty: 'OKP', crv: 'Ed25519', kid: 'test-kid', x: b64url(ed25519.getPublicKey(HOST_SK)) };
const DID = 'did:oc:' + 'a'.repeat(32);

function hostJws(typ: string, statement: string, opts: { sk?: Uint8Array; kid?: string } = {}): string {
    const h = b64url(utf8Encode(JSON.stringify({ alg: 'EdDSA', typ, kid: opts.kid ?? 'test-kid' })));
    const p = b64url(utf8Encode(statement));
    return `${h}.${p}.${b64url(ed25519.sign(utf8Encode(`${h}.${p}`), opts.sk ?? HOST_SK))}`;
}

function vouch(s: VouchSubject, opts: { sk?: Uint8Array; kid?: string; typ?: string; issuedAt?: number } = {}): string {
    const st =
        [
            'oc-chat:device-vouch:v1',
            `did_oc: ${s.didOc}`,
            `device_pk: ${s.device_pk}`,
            `nostr_pk: ${s.nostr_pk}`,
            `device_id: ${s.device_id}`,
            `issued_at: ${opts.issuedAt ?? 1780000000}`,
        ].join('\n') + '\n';
    return hostJws(opts.typ ?? VOUCH_JWS_TYP, st, opts);
}

/** A session record (§8.6) published by `sk`. */
function record(sk: Uint8Array, tags: Record<string, string>, content = 's\n', createdAt = 1780000000): NostrEvent {
    const { nostrSk, nostrPk } = deriveNostrKey(sk);
    return signNostrEvent(
        {
            pubkey: nostrPk,
            kind: 30078,
            created_at: createdAt,
            content,
            tags: [
                ['d', `oc-chat:device:${DID}`],
                ['addr', DID],
                ...Object.entries(tags).map(([k, v]) => [k, v]),
                ['auth', 'session'],
            ],
        },
        nostrSk
    );
}

function device(opts: { did?: string; issuedAt?: number } = {}) {
    const kp = generateDeviceKey();
    const { nostrPk } = deriveNostrKey(kp.device_sk);
    const v = vouch(
        { didOc: opts.did ?? DID, device_pk: kp.device_pk, nostr_pk: nostrPk, device_id: kp.device_id },
        { issuedAt: opts.issuedAt }
    );
    const rec = record(kp.device_sk, { device_id: kp.device_id, device_pk: kp.device_pk, binding_sig: '', vouch: v });
    return { kp, nostrPk, vouch: v, record: rec };
}

const ownRevocation = (d: ReturnType<typeof device>) =>
    record(d.kp.device_sk, { device_id: d.kp.device_id, device_pk: 'revoked', binding_sig: '' }, 'revoked\n');

function hostRevocation(d: ReturnType<typeof device>, opts: { sk?: Uint8Array; revokedAt?: number } = {}) {
    const st = `oc-chat:device-revoke:v1\ndid_oc: ${DID}\ndevice_id: ${d.kp.device_id}\nnostr_pk: ${d.nostrPk}\nrevoked_at: ${opts.revokedAt ?? 1790000000}\n`;
    // Carried by an unrelated key: the JWS is the authority, not the signer.
    return record(
        generateDeviceKey().device_sk,
        { device_id: d.kp.device_id, device_pk: 'revoked', revocation: hostJws('oc-chat-device-revoke', st, opts) },
        st,
        opts.revokedAt ?? 1790000000
    );
}

const bound = (events: NostrEvent[], keys: AuthHostKey[] = [HOST_KEY]) =>
    liveSessionDevices(events, DID, keys).map((d) => d.nostrPubkey);

describe('verifySessionVouch', () => {
    const subject = { didOc: DID, device_pk: 'aa'.repeat(32), nostr_pk: 'bb'.repeat(32), device_id: 'cc'.repeat(16) };

    it('accepts the host-signed statement for exactly this subject', () => {
        expect(verifySessionVouch(vouch(subject), subject, [HOST_KEY])).toBe(true);
        expect(vouchIssuedAt(vouch(subject))).toBe(1780000000);
    });

    it.each([
        ['did_oc', { didOc: 'did:oc:' + 'b'.repeat(32) }],
        ['device_pk', { device_pk: 'dd'.repeat(32) }],
        ['nostr_pk', { nostr_pk: 'ee'.repeat(32) }],
        ['device_id', { device_id: 'ff'.repeat(16) }],
    ])('refuses a vouch for another %s', (_f, over) => {
        expect(verifySessionVouch(vouch(subject), { ...subject, ...over }, [HOST_KEY])).toBe(false);
    });

    it('refuses an unknown kid, a foreign typ, and a key the host does not publish', () => {
        expect(verifySessionVouch(vouch(subject, { kid: 'other' }), subject, [HOST_KEY])).toBe(false);
        expect(verifySessionVouch(vouch(subject, { typ: 'JWT' }), subject, [HOST_KEY])).toBe(false);
        expect(verifySessionVouch(vouch(subject, { sk: new Uint8Array(32).fill(1) }), subject, [HOST_KEY])).toBe(false);
    });

    it('a retired key verifies only what it signed before it retired', () => {
        const retired = { ...HOST_KEY, status: 'retired', retired_at: 1785000000 };
        expect(verifySessionVouch(vouch(subject, { issuedAt: 1784999999 }), subject, [retired])).toBe(true);
        expect(verifySessionVouch(vouch(subject, { issuedAt: 1785000000 }), subject, [retired])).toBe(false);
    });
});

describe('verifyHostRevocation', () => {
    const st = (extra = '') =>
        `oc-chat:device-revoke:v1\ndid_oc: ${DID}\ndevice_id: dev1\nnostr_pk: ${'bb'.repeat(32)}\nrevoked_at: 1790000000\n${extra}`;

    it('reads the named lines of a host-signed statement', () => {
        expect(verifyHostRevocation(hostJws('oc-chat-device-revoke', st()), [HOST_KEY])).toEqual({
            didOc: DID,
            device_id: 'dev1',
            nostr_pk: 'bb'.repeat(32),
            revoked_at: 1790000000,
            statement: st(),
        });
    });

    it('keeps a line it does not know, and refuses a field named twice', () => {
        expect(verifyHostRevocation(hostJws('oc-chat-device-revoke', st('reason: lost\n')), [HOST_KEY])?.device_id).toBe('dev1');
        expect(verifyHostRevocation(hostJws('oc-chat-device-revoke', st('device_id: dev2\n')), [HOST_KEY])).toBeNull();
    });

    it('refuses a vouch passed off as a revocation, and an unpublished key', () => {
        expect(verifyHostRevocation(hostJws(VOUCH_JWS_TYP, st()), [HOST_KEY])).toBeNull();
        expect(verifyHostRevocation(hostJws('oc-chat-device-revoke', st(), { sk: new Uint8Array(32).fill(9) }), [HOST_KEY])).toBeNull();
    });
});

describe('which session keys bind (§8.6)', () => {
    it('binds a record whose vouch names this did:oc and its keys', () => {
        const d = device();
        expect(bound([d.record])).toEqual([d.nostrPk]);
    });

    it('binds nothing without the host keys, without a vouch, or for another did:oc', () => {
        const d = device();
        expect(bound([d.record], [])).toEqual([]);
        const kp = generateDeviceKey();
        const bare = record(kp.device_sk, { device_id: kp.device_id, device_pk: kp.device_pk, binding_sig: '' });
        expect(bound([bare])).toEqual([]);
        expect(bound([device({ did: 'did:oc:' + 'b'.repeat(32) }).record])).toEqual([]);
    });

    it('does not bind a vouch copied onto a record another key publishes', () => {
        const d = device();
        const thief = generateDeviceKey();
        const copied = record(thief.device_sk, {
            device_id: d.kp.device_id,
            device_pk: d.kp.device_pk,
            binding_sig: '',
            vouch: d.vouch,
        });
        expect(bound([copied])).toEqual([]);
    });

    it("a device's own revocation, or the host's, retires the bind another relay still serves", () => {
        const d = device();
        expect(bound([d.record, ownRevocation(d)])).toEqual([]);
        expect(bound([d.record, hostRevocation(d)])).toEqual([]);
    });

    it('a host revocation from before the vouch, or under an unpublished key, retires nothing', () => {
        const d = device();
        expect(bound([d.record, hostRevocation(d, { revokedAt: 1770000000 })])).toEqual([d.nostrPk]);
        expect(bound([d.record, hostRevocation(d, { sk: new Uint8Array(32).fill(9) })])).toEqual([d.nostrPk]);
    });

    it('every key ever bound: one whose own revocation replaced its record, and one the host revoked', () => {
        const d = device();
        const e = device();
        const f = device();
        // A revocation under a fresh key, for a device whose record stays, adds nothing.
        const stray = record(generateDeviceKey().device_sk, { device_id: f.kp.device_id, device_pk: 'revoked', binding_sig: '' });
        const keys = sessionKeysEverBound([ownRevocation(d), hostRevocation(e), f.record, stray], DID, [HOST_KEY]);
        expect(new Set(keys)).toEqual(new Set([d.nostrPk, e.nostrPk, f.nostrPk]));
    });

    it('recordReads answers isBound from the records, and refuses to guess when no relay answered', async () => {
        const d = device();
        const reads = (answered: boolean) =>
            recordReads(async () => ({ events: [d.record], answered }), {
                hostKeys: async () => [HOST_KEY],
                verifyBip322: () => false,
            });
        expect(await reads(true).isBound(d.nostrPk, DID)).toBe(true);
        expect(await reads(true).isBound('ff'.repeat(32), DID)).toBe(false);
        await expect(reads(false).isBound(d.nostrPk, DID)).rejects.toThrow('no relay sent a complete answer');
    });
});
