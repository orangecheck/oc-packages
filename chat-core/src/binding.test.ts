// Who signed a channel version (SPEC §8.3.1): the record in its `binding` tag,
// the fork rank it earns, and what a resolver does when liveness is unanswered.
// Session (did:oc) records stand in for any binding: the rules are the same.

import { ed25519 } from '@noble/curves/ed25519';
import { utf8Encode } from '@orangecheck/lock-crypto';
import {
    buildBindingStatement,
    deriveNostrKey,
    finalizeDeviceEvent,
    generateDeviceKey,
    signNostrEvent,
} from '@orangecheck/lock-device';
import { describe, expect, it } from 'vitest';

import {
    channelId,
    descriptorId,
    resolveChannelChain,
    versionDtag,
    type DescriptorContent,
} from './channel';
import type { NostrEvent } from './event';
import { UnansweredReadError } from './read';
import { stepUpAddress } from './records';
import { VOUCH_JWS_TYP, type AuthHostKey } from './session';
import { recordBinding, type VersionBinding } from './version-binding';

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const HOST_SK = new Uint8Array(32).fill(42);
const HOST: AuthHostKey = { kty: 'OKP', crv: 'Ed25519', kid: 'k', x: b64url(ed25519.getPublicKey(HOST_SK)) };
const hostKeys = async () => [HOST];
const FOUNDER = 'did:oc:' + 'a'.repeat(32);
const ADMIN = 'did:oc:' + 'b'.repeat(32);
const never = () => {
    throw new Error('BIP-322 is not asked for a session record');
};

/** A device of `did`, its session record carrying the host's vouch. */
function sessionDevice(did: string) {
    const kp = generateDeviceKey();
    const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
    const st = `oc-chat:device-vouch:v1\ndid_oc: ${did}\ndevice_pk: ${kp.device_pk}\nnostr_pk: ${nostrPk}\ndevice_id: ${kp.device_id}\nissued_at: 1780000000\n`;
    const h = b64url(utf8Encode(JSON.stringify({ alg: 'EdDSA', typ: VOUCH_JWS_TYP, kid: 'k' })));
    const p = b64url(utf8Encode(st));
    const vouch = `${h}.${p}.${b64url(ed25519.sign(utf8Encode(`${h}.${p}`), HOST_SK))}`;
    const record = signNostrEvent(
        {
            pubkey: nostrPk,
            kind: 30078,
            created_at: 1780000000,
            content: 's\n',
            tags: [
                ['d', `oc-chat:device:${did}`],
                ['addr', did],
                ['device_id', kp.device_id],
                ['device_pk', kp.device_pk],
                ['auth', 'session'],
                ['binding_sig', ''],
                ['vouch', vouch],
            ],
        },
        nostrSk
    );
    return { nostrSk, nostrPk, record };
}

/** A 0.3.0 version: its own coordinate, t and s tags, and the signer's record. */
function version(d: ReturnType<typeof sessionDevice>, content: DescriptorContent): NostrEvent {
    const did = descriptorId(content);
    return signNostrEvent(
        {
            pubkey: d.nostrPk,
            kind: 30110,
            created_at: content.created_at,
            content: JSON.stringify(content),
            tags: [
                ['d', versionDtag(did)],
                ['t', content.channel_id],
                ...(content.supersedes ? [['s', content.supersedes]] : []),
                ['binding', JSON.stringify(d.record)],
            ],
        },
        d.nostrSk
    );
}

const founderKey = sessionDevice(FOUNDER);
const adminKey = sessionDevice(ADMIN);
const genesis: DescriptorContent = {
    v: 1,
    channel_id: channelId(FOUNDER, 'town'),
    slug: 'town',
    founder_address: FOUNDER,
    founder_inbox_pubkey: founderKey.nostrPk,
    read: 'public',
    encryption: null,
    write: { policy: 'open', utxo_floor_confs: 0, utxo_floor_sats: 0, allowlist_root: null, rooted: false },
    admins: [ADMIN],
    moderators: [],
    title: 'Town',
    description: '',
    avatar: null,
    rules: null,
    directory_opt_in: false,
    created_at: 1780000100,
    supersedes: null,
};
const next = (prior: DescriptorContent, title: string, at: number): DescriptorContent => ({
    ...prior,
    title,
    created_at: at,
    supersedes: descriptorId(prior),
});

const resolve = (events: NostrEvent[], liveness: (b: VersionBinding) => Promise<'live' | 'revoked' | 'unknown'>) =>
    resolveChannelChain(events, genesis.channel_id, {
        isBound: async () => false,
        hostKeys,
        liveness,
        verifyBip322: never,
    });

describe('the fork rank of a founder key since revoked (§8.3.1)', () => {
    // G by the founder; F1 the founder's edit; F2 the admin's on top of it.
    // A1..A3 an admin's longer branch from G. The founder's key is then revoked.
    const f1 = next(genesis, 'founder edit', 1780000200);
    const f2 = next(f1, 'admin on the founder branch', 1780000300);
    const a1 = next(genesis, 'admin fork 1', 1780000210);
    const a2 = next(a1, 'admin fork 2', 1780000220);
    const a3 = next(a2, 'admin fork 3', 1780000230);
    const events = [
        version(founderKey, genesis),
        version(founderKey, f1),
        version(adminKey, f2),
        version(adminKey, a1),
        version(adminKey, a2),
        version(adminKey, a3),
    ];

    it("keeps the founder's earlier decision ahead of an admin's longer fork", async () => {
        const r = await resolve(events, async (b) => (b.pubkey === founderKey.nostrPk ? 'revoked' : 'live'));
        expect(r?.descriptorId).toBe(descriptorId(f2));
        expect(r?.epochs).toBe(3);
    });

    it('with every key live, the founder branch still wins at the fork', async () => {
        const r = await resolve(events, async () => 'live');
        expect(r?.descriptorId).toBe(descriptorId(f2));
    });
});

describe('liveness that no relay answered', () => {
    it('stops the resolution, never reads as live or revoked', async () => {
        await expect(resolve([version(founderKey, genesis)], async () => 'unknown')).rejects.toBeInstanceOf(
            UnansweredReadError
        );
    });
});

describe('recordBinding: an address record binds a version key only by a v3 statement (OC Lock §3.4)', () => {
    const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
    const kp = generateDeviceKey();
    const { nostrPk } = deriveNostrKey(kp.device_sk);
    const rec = (v3: boolean) =>
        finalizeDeviceEvent({
            deviceSk: kp.device_sk,
            address: ADDR,
            device_id: kp.device_id,
            device_pk: kp.device_pk,
            bindingStatement: buildBindingStatement({
                address: ADDR,
                device_pk: kp.device_pk,
                device_id: kp.device_id,
                created_at: kp.created_at,
                ...(v3 ? { nostr_pk: nostrPk } : {}),
            }),
            bindingSigBase64: 'c2ln',
        });
    const v = (ok: boolean) => ({ hostKeys, verifyBip322: () => ok });

    it('a v3 record whose BIP-322 verifies binds its key to the address', async () => {
        expect(await recordBinding(rec(true), nostrPk, v(true))).toMatchObject({ kind: 'btc', principal: ADDR, pubkey: nostrPk });
    });

    it('a v2 record binds nothing, and neither does a failed signature or another key', async () => {
        expect(await recordBinding(rec(false), nostrPk, v(true))).toBeNull();
        expect(await recordBinding(rec(true), nostrPk, v(false))).toBeNull();
        expect(await recordBinding(rec(true), 'ff'.repeat(32), v(true))).toBeNull();
    });
});

describe('stepUpAddress (§8.6)', () => {
    it('names the lexicographically smallest address that binds the key', async () => {
        const d = sessionDevice(FOUNDER);
        const named = (address: string) =>
            signNostrEvent(
                { pubkey: d.nostrPk, kind: 30078, created_at: 1, content: '', tags: [['d', `oc-lock:device:${address}`]] },
                d.nostrSk
            );
        const authored = [named('bc1qzz'), named('bc1qaa'), named('bc1qmm')];
        const bindsAll = async () => true;
        expect(await stepUpAddress(d.nostrPk, authored, bindsAll)).toBe('bc1qaa');
        const notAa = async (_pk: string, a: string) => a !== 'bc1qaa';
        expect(await stepUpAddress(d.nostrPk, authored, notAa)).toBe('bc1qmm');
        expect(await stepUpAddress('ee'.repeat(32), authored, bindsAll)).toBeNull();
    });
});
