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
    authorizedCopy,
    channelId,
    descriptorId,
    readChannelVersions,
    resolveChannelChain,
    versionDtag,
    type DescriptorContent,
} from './channel';
import type { NostrEvent } from './event';
import { UnansweredReadError } from './read';
import { recordReads, stepUpAddress } from './records';
import { VOUCH_JWS_TYP, type AuthHostKey } from './session';
import { readVersionBinding, recordBinding, type VersionBinding } from './version-binding';

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

describe('authorizedCopy: an event counts only as one of its version’s authorized copies (§8.3.1)', () => {
    const genuine = version(founderKey, genesis);
    /** The genesis content, signed by a fresh key with no binding tag, at the version's own coordinate. */
    const fresh = (() => {
        const kp = generateDeviceKey();
        const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
        return signNostrEvent(
            {
                pubkey: nostrPk,
                kind: 30110,
                created_at: genesis.created_at,
                content: JSON.stringify(genesis),
                tags: [
                    ['d', versionDtag(descriptorId(genesis))],
                    ['t', genesis.channel_id],
                ],
            },
            nostrSk
        );
    })();
    /** The same content, signed by another did:oc's vouched device carrying its own binding tag. */
    const other = version(sessionDevice('did:oc:' + 'c'.repeat(32)), genesis);
    const live = async () => 'live' as const;

    it('the founder’s own copy is authorized, on the chain and the tip', async () => {
        const r = await resolve([genuine], live);
        expect(authorizedCopy(r, genuine)).toEqual({ descriptorId: descriptorId(genesis), onChain: true, isTip: true });
    });

    it('a fresh key’s copy of the same content is not, with or without the founder’s copy beside it', async () => {
        const both = await resolve([genuine, fresh], live);
        expect(both?.descriptorId).toBe(descriptorId(genesis));
        expect(authorizedCopy(both, fresh)).toBeNull();
        const alone = await resolve([fresh], live);
        expect(alone).toBeNull();
        expect(authorizedCopy(alone, fresh)).toBeNull();
    });

    it('another did:oc’s vouched copy, carrying its own binding, is not', async () => {
        const r = await resolve([genuine, other], live);
        expect(r?.versions[0]?.signers).toEqual([founderKey.nostrPk]);
        expect(authorizedCopy(r, other)).toBeNull();
    });

    it('another event by the founder’s own key counts only if that copy is itself authorized', async () => {
        // The same content and key, published again without its binding tag: a copy
        // the relays no longer bind (this resolver's isBound answers false).
        const unbound = signNostrEvent(
            {
                pubkey: founderKey.nostrPk,
                kind: 30110,
                created_at: genesis.created_at + 1,
                content: JSON.stringify(genesis),
                tags: [
                    ['d', versionDtag(descriptorId(genesis))],
                    ['t', genesis.channel_id],
                ],
            },
            founderKey.nostrSk
        );
        const r = await resolve([genuine, unbound], live);
        expect(r?.versions[0]?.copies).toEqual([genuine.id]);
        expect(authorizedCopy(r, genuine)).not.toBeNull();
        expect(authorizedCopy(r, unbound)).toBeNull();
    });

    it('an event that borrows an authorized copy’s id but not its bytes is not', async () => {
        const r = await resolve([genuine], live);
        expect(authorizedCopy(r, { ...fresh, id: genuine.id })).toBeNull();
        expect(authorizedCopy(r, { ...genuine, content: genuine.content.replace('Town', 'T0wn') })).toBeNull();
    });
});

describe('a read of the host keys that gets no answer is not a missing binding', () => {
    it('readVersionBinding throws it, and a resolution stops with it', async () => {
        const silent = async (): Promise<never> => {
            throw new UnansweredReadError('ochk.io could not be read');
        };
        const ev = version(founderKey, genesis);
        await expect(readVersionBinding(ev, { hostKeys: silent, verifyBip322: never })).rejects.toBeInstanceOf(
            UnansweredReadError
        );
        await expect(
            resolveChannelChain([ev], genesis.channel_id, {
                isBound: async () => false,
                hostKeys: silent,
                liveness: async () => 'live',
                verifyBip322: never,
            })
        ).rejects.toBeInstanceOf(UnansweredReadError);
    });

    it('a host that answers with no keys binds nothing, and the version does not stand', async () => {
        const ev = version(founderKey, genesis);
        expect(await readVersionBinding(ev, { hostKeys: async () => [], verifyBip322: never })).toBeNull();
    });

    it('a binding tag that is not a record binds nothing', async () => {
        const bad = { ...version(founderKey, genesis), tags: [['binding', 'null']] };
        expect(await readVersionBinding(bad, { hostKeys, verifyBip322: never })).toBeNull();
    });
});

describe('readChannelVersions: "no newer version" only when every read met the floor (§8.7)', () => {
    const ev = version(founderKey, genesis);
    const queryWith = (eose: boolean[]) => async () => ({ events: [ev], relayStatus: eose.map((e) => ({ eose: e })) });
    const keys = async () => ({ keys: [founderKey.nostrPk], answered: true, floor: true });

    it('2 of 4 relays answering is below the floor: floorMet is false', async () => {
        const r = await readChannelVersions(genesis.channel_id, { query: queryWith([true, true, false, false]), everBoundKeys: keys }, FOUNDER);
        expect(r.events.map((e) => e.id)).toEqual([ev.id]);
        expect(r.floorMet).toBe(false);
    });

    it('3 of 4, or every relay, meets it', async () => {
        for (const eose of [[true, true, true, false], [true, true, true, true]]) {
            const r = await readChannelVersions(genesis.channel_id, { query: queryWith(eose), everBoundKeys: keys }, FOUNDER);
            expect(r.floorMet).toBe(true);
        }
    });

    it('a role holder\'s keys read below the floor leaves it unmet: a key bound only on silent relays signs versions not read', async () => {
        const short = async () => ({ keys: [founderKey.nostrPk], answered: true, floor: false });
        const r = await readChannelVersions(genesis.channel_id, { query: queryWith([true, true, true, true]), everBoundKeys: short }, FOUNDER);
        expect(r.floorMet).toBe(false);
    });
});

describe('recordReads.liveness for an address binding with a relay that did not answer', () => {
    const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
    const kp = generateDeviceKey();
    const { nostrPk } = deriveNostrKey(kp.device_sk);
    const bind = finalizeDeviceEvent({
        deviceSk: kp.device_sk,
        address: ADDR,
        device_id: kp.device_id,
        device_pk: kp.device_pk,
        bindingStatement: buildBindingStatement({
            address: ADDR,
            device_pk: kp.device_pk,
            device_id: kp.device_id,
            created_at: '2026-09-01T00:00:00.000Z',
            nostr_pk: nostrPk,
        }),
        bindingSigBase64: 'c2ln',
    });
    const revoke = finalizeDeviceEvent({
        deviceSk: kp.device_sk,
        address: ADDR,
        device_id: kp.device_id,
        device_pk: 'revoked',
        bindingStatement: `oc-lock:device-revoke:v2\naddress: ${ADDR}\ndevice_id: ${kp.device_id}\nrevoked_at: 2026-10-01T00:00:00.000Z\n`,
        bindingSigBase64: 'c2ln',
    });
    const reads = (events: NostrEvent[], eose: boolean[]) =>
        recordReads(async () => ({ events, relayStatus: eose.map((e) => ({ eose: e })) }), {
            hostKeys,
            verifyBip322: () => true,
            now: () => new Date('2026-10-20T00:00:00Z'),
        });

    it('live needs the floor; a revocation seen is revoked on any answer', async () => {
        const b = await recordBinding(bind, nostrPk, { hostKeys, verifyBip322: () => true });
        expect(b?.kind).toBe('btc');
        expect(await reads([bind], [true, true, false, false]).liveness(b!)).toBe('unknown');
        expect(await reads([bind], [true, true, true, false]).liveness(b!)).toBe('live');
        expect(await reads([bind, revoke], [true, false, false, false]).liveness(b!)).toBe('revoked');
    });

    it('bound now, not bound and every key ever bound: below the floor, not read', async () => {
        await expect(reads([bind], [true, true, false, false]).isBound(nostrPk, ADDR)).rejects.toThrow('fewer than 3 of 4 relays answered');
        await expect(reads([], [true, true, false, false]).isBound(nostrPk, ADDR)).rejects.toBeInstanceOf(UnansweredReadError);
        expect(await reads([bind], [true, true, true, false]).isBound(nostrPk, ADDR)).toBe(true);
        expect(await reads([], [true, true, true, false]).isBound(nostrPk, ADDR)).toBe(false);
        // "Ever bound" stands on what was returned, but the floor says whether a key may be missing.
        expect(await reads([bind], [true, true, false, false]).everBoundKeys(ADDR)).toEqual({ keys: [nostrPk], answered: true, floor: false });
        expect(await reads([bind], [true, true, true, false]).everBoundKeys(ADDR)).toEqual({ keys: [nostrPk], answered: true, floor: true });
    });
});
