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
import { matchFilter } from '@orangecheck/nostr-core';
import { describe, expect, it } from 'vitest';

import {
    authorizedCopy,
    channelId,
    descriptorDtag,
    descriptorId,
    readChannelVersions,
    resolveChannelChain,
    versionDtag,
    type DescriptorContent,
} from './channel';
import type { NostrEvent } from './event';
import { UnansweredReadError, type RelayAnswer } from './read';
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

    it('read from records that three of four relays answered in full, one cut off: the resolution stops and says so', async () => {
        const status: RelayAnswer[] = ['a', 'b', 'c', 'd'].map((x, i) => ({
            relay: `wss://${x}`,
            eose: i < 3,
            state: i < 3 ? ('complete' as const) : ('cut_off' as const),
        }));
        const r = recordReads(async () => ({ events: [founderKey.record], relayStatus: status }), {
            hostKeys,
            verifyBip322: never,
        });
        const out = resolve([version(founderKey, genesis)], r.liveness);
        await expect(out).rejects.toBeInstanceOf(UnansweredReadError);
        await expect(out).rejects.toThrow(
            '3 of 4 relays answered in full and 1 was cut off before the end of what it holds, so a revocation of this binding may not have been seen'
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

describe('readChannelVersions: a page it cannot read past is a cut-off read (§8.3.1)', () => {
    const ev = version(founderKey, genesis);
    // 600 events under the channel's tag in one second, newer than the genesis: a
    // page with \`until\` at that second brings back the same 500 every time.
    const junk = Array.from({ length: 600 }, (_, i) => ({ ...ev, id: `junk-${i}`, created_at: ev.created_at + 86400, content: 'x' }));
    const query = async (f: Record<string, unknown>) => {
        const tagged = f['#t'] ? [...junk, ev].filter((e) => f.until === undefined || e.created_at <= (f.until as number)).slice(0, (f.limit as number) ?? Infinity) : [];
        const byKey = Array.isArray(f.authors) && f.authors.includes(ev.pubkey) ? [ev] : [];
        return { events: [...tagged, ...byKey], relayStatus: [{ eose: true }, { eose: true }, { eose: true }, { eose: true }] };
    };
    const keys = async () => ({ keys: [founderKey.nostrPk], answered: true, floor: true });

    it('600 events in one second stall the open read: it is truncated, not complete', async () => {
        const r = await readChannelVersions(genesis.channel_id, { query, everBoundKeys: keys }, FOUNDER);
        expect(r.events.map((e) => e.id)).toContain(ev.id);
        expect(r.truncated).toBe(true);
    });
});

describe('readChannelVersions: a relay counts toward the floor only when it answered every page in full (§8.7)', () => {
    const ev = version(founderKey, genesis);
    // 600 versions-shaped events under the tag, one second apart and newer than the
    // genesis: the open read takes two pages of 500.
    const junk = Array.from({ length: 600 }, (_, i) => ({
        ...ev,
        id: `junk-${i}`,
        created_at: ev.created_at + 1000 + i,
        content: 'x',
    }));
    const RELAYS = ['wss://a', 'wss://b', 'wss://c', 'wss://d', 'wss://e'];
    const keys = async () => ({ keys: [founderKey.nostrPk], answered: true, floor: true });
    /** The relays' answers: `pages[n]` says which relays sent EOSE on page n of the open read. */
    const query = (pages: string[][]) => {
        let page = 0;
        return async (f: Record<string, unknown>) => {
            if (!f['#t'] || Array.isArray(f.authors)) {
                const events =
                    Array.isArray(f.authors) && f.authors.includes(ev.pubkey)
                        ? [ev].filter((e) => f.until === undefined || e.created_at <= (f.until as number))
                        : [];
                return { events, relayStatus: RELAYS.map((relay) => ({ relay, eose: true, events: events.length, rejected: 0 })) };
            }
            const all = [...junk, ev]
                .filter((e) => f.until === undefined || e.created_at <= (f.until as number))
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, f.limit as number);
            const answering = pages[Math.min(page++, pages.length - 1)]!;
            return {
                events: all,
                relayStatus: RELAYS.map((relay) => {
                    const eose = answering.includes(relay);
                    return { relay, eose, events: eose ? all.length : 0, rejected: 0 };
                }),
            };
        };
    };
    const read = (pages: string[][]) =>
        readChannelVersions(genesis.channel_id, { query: query(pages), everBoundKeys: keys }, FOUNDER);

    it('a relay that answers page 1 and not page 2 does not count, though each page alone met the floor', async () => {
        const r = await read([
            ['wss://a', 'wss://b', 'wss://c', 'wss://d'],
            ['wss://a', 'wss://b', 'wss://c', 'wss://e'],
        ]);
        expect(r.events.map((e) => e.id)).toContain(ev.id);
        expect(r.floorMet).toBe(false);
    });

    it('four of five relays answering every page, the last one short, meet it; the fifth sent nothing', async () => {
        const four = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
        const r = await read([four, four]);
        expect(r.floorMet).toBe(true);
    });

    it('an EOSE after a full page is not a full answer: a capped role-holder read leaves it unmet', async () => {
        const capped = async (f: Record<string, unknown>) => ({
            events: Array.isArray(f.authors) ? [ev] : [],
            relayStatus: RELAYS.map((relay) => ({
                relay,
                eose: true,
                events: Array.isArray(f.authors) ? 500 : 0,
                rejected: 0,
            })),
        });
        const r = await readChannelVersions(genesis.channel_id, { query: capped, everBoundKeys: keys }, FOUNDER);
        expect(r.floorMet).toBe(false);
    });
});

/** `n` kind-30110 events by `pubkey` under `tags`, the i-th at `at(i)`; ids unique per `salt`. */
const junk = (n: number, pubkey: string, tags: string[][], at: (i: number) => number, salt: string): NostrEvent[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `${salt}${i.toString(16).padStart(8, '0')}`.padEnd(64, '0'),
        pubkey,
        sig: '0'.repeat(128),
        kind: 30110,
        created_at: at(i),
        content: 'x',
        tags,
    }));

/** One planted relay: what it holds, the most it sends a page whatever is asked, how many events
 *  the reader drops it puts in a page (each takes a place), and whether it answers a REQ. */
interface Planted {
    relay: string;
    held: readonly NostrEvent[];
    cap?: number;
    pad?: (f: Record<string, unknown>) => number;
    answers?: (f: Record<string, unknown>) => boolean;
}

/** A query over planted relays as nostr-core answers one: each relay newest first, `since` and
 *  `until` inclusive, at most its cap; per relay the events kept and dropped; events de-duplicated. */
function planted(relays: readonly Planted[], calls: Record<string, unknown>[] = []) {
    return async (f: Record<string, unknown>) => {
        calls.push(f);
        const byId = new Map<string, NostrEvent>();
        const relayStatus = relays.map((r) => {
            if (r.answers && !r.answers(f)) return { relay: r.relay, eose: false, events: 0, rejected: 0 };
            const room = Math.min((f.limit as number | undefined) ?? Infinity, r.cap ?? Infinity);
            const pad = Math.min(r.pad?.(f) ?? 0, room);
            const page = r.held
                .filter((e) => matchFilter(e as never, f as never))
                .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))
                .slice(0, room - pad);
            for (const e of page) byId.set(e.id, e);
            return { relay: r.relay, eose: true, events: page.length, rejected: pad };
        });
        return { events: [...byId.values()], relayStatus };
    };
}

const FOUR = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
const T: string[][] = [['t', genesis.channel_id]];
const S: string[][] = [['s', descriptorId(genesis)]];
const OTHER = 'ab'.repeat(32);
const g1 = version(founderKey, genesis);
const v2 = version(founderKey, next(genesis, 'Town, edited', genesis.created_at + 50));
const founderKeys = async () => ({ keys: [founderKey.nostrPk], answered: true, floor: true });
const readOver = (relays: readonly Planted[], founder?: string, calls?: Record<string, unknown>[]) =>
    readChannelVersions(genesis.channel_id, { query: planted(relays, calls), everBoundKeys: founderKeys }, founder);
const every = (held: NostrEvent[], cap?: number): Planted[] => FOUR.map((relay) => ({ relay, held, cap }));
const ids = (r: { events: NostrEvent[] }) => r.events.map((e) => e.id);
/** Newer than both versions, one second apart from genesis + 1000, or all in that one second. */
const newer = (n: number, pubkey: string, tags: string[][], salt: string, oneSecond = false) =>
    junk(n, pubkey, tags, (i) => genesis.created_at + 1000 + (oneSecond ? 0 : i), salt);

describe("readChannelVersions: a role holder's key read is read to its end; one a bound stops leaves the walk incomplete (§8.3.1)", () => {
    // Only the key read under `s` by the founder's key returns this one: older than everything.
    const hidden = junk(1, founderKey.nostrPk, S, () => genesis.created_at - 10, 'h0')[0]!;

    it("600 of the founder's events under the tag, relays capping at 500: its key read pages past them", async () => {
        const r = await readOver(every([g1, v2, ...newer(600, founderKey.nostrPk, T, 'f')], 500), FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });

    it("2,600 of the founder's events under the tag: the key read stops at its bound, so the walk is incomplete", async () => {
        const r = await readOver(every([g1, v2, ...newer(2600, founderKey.nostrPk, T, 'f')], 500), FOUNDER);
        expect(r.incomplete).toBe(true);
        expect(r.floorMet).toBe(false);
    });

    it('the walk forward by s: read to its end below the bound, incomplete past it', async () => {
        const r = await readOver(every([g1, v2, hidden, ...newer(600, founderKey.nostrPk, S, 's')], 500), FOUNDER);
        expect(ids(r)).toContain(hidden.id);
        expect(r).toMatchObject({ incomplete: false, floorMet: true });
        const past = await readOver(every([g1, v2, ...newer(2600, founderKey.nostrPk, S, 's')], 500), FOUNDER);
        expect(past.incomplete).toBe(true);
    });

    it('a page is what the relay sent: later pages padded with events the reader drops are not short, so the read goes on', async () => {
        const held = [g1, v2, hidden, ...newer(1300, founderKey.nostrPk, S, 's')];
        // Pages after the first of each key read under `s` carry 100 the reader drops.
        const pad = (f: Record<string, unknown>) => (f.until === undefined || !f['#s'] ? 0 : 100);
        const relays = FOUR.map((relay) => ({ relay, held, cap: 500, pad }));
        const r = await readOver(relays, FOUNDER);
        expect(ids(r)).toContain(hidden.id);
        expect(r.incomplete).toBe(false);
    });

    it('one relay of four whose key read stops at the bound: incomplete, and the floor unmet', async () => {
        const relays = every([g1, v2], 500);
        relays[0] = { ...relays[0]!, held: [g1, v2, ...newer(2600, founderKey.nostrPk, S, 's')] };
        const r = await readOver(relays, FOUNDER);
        expect(r.incomplete).toBe(true);
        expect(r.floorMet).toBe(false);
    });

    it('relays that hold different parts are each read to the end of their own', async () => {
        const own = newer(900, founderKey.nostrPk, S, 's');
        const relays = FOUR.map((relay, i) => ({
            relay,
            held: [g1, v2, hidden, ...own.filter((_, j) => j % 4 === i)],
            cap: 300,
        }));
        const r = await readOver(relays, FOUNDER);
        expect(ids(r)).toEqual(expect.arrayContaining([hidden.id, ...own.map((e) => e.id)]));
        expect(r).toMatchObject({ incomplete: false, floorMet: true });
    });

    it('with no counts, the events read back are the page: read until one comes back shorter', async () => {
        const counted = planted(every([g1, v2, hidden, ...newer(600, founderKey.nostrPk, S, 's')], 300));
        const query = async (f: Record<string, unknown>) => {
            const res = await counted(f);
            return { events: res.events, relayStatus: res.relayStatus.map(({ relay, eose }) => ({ relay, eose })) };
        };
        const r = await readChannelVersions(genesis.channel_id, { query, everBoundKeys: founderKeys }, FOUNDER);
        expect(ids(r)).toContain(hidden.id);
        expect(r.incomplete).toBe(false);
    });

    it('a flood of the open read alone is truncated, not incomplete: the key reads were read in full', async () => {
        const r = await readOver(every([g1, v2, ...newer(2500, OTHER, T, 'o')], 500), FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r.truncated).toBe(true);
        expect(r.incomplete).toBe(false);
    });
});

describe('readChannelVersions: relays that cap a page below the 500 asked for are read past their cap (§8.3.1)', () => {
    it("four relays capping at 300, another key's 300 events newer than v2, no founder named: both versions read, in full", async () => {
        const r = await readOver(every([g1, v2, ...newer(300, OTHER, T, 'o')], 300));
        expect(ids(r)).toEqual(expect.arrayContaining([g1.id, v2.id]));
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });

    it("the founder's key: four relays capping at 300, 300 of its events newer than v2, the founder named: v2 read, the walk complete", async () => {
        const r = await readOver(every([g1, v2, ...newer(300, founderKey.nostrPk, T, 'f')], 300), FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });

    it('a mix: two relays at 300 hold both versions under newer events, two at 500 hold older events that page the union past them; both read, every relay in full', async () => {
        const older = junk(600, OTHER, T, (i) => genesis.created_at - 1000 + i, 'q');
        const relays: Planted[] = [
            { relay: 'wss://a', held: [g1, v2, ...newer(300, OTHER, T, 'o')], cap: 300 },
            { relay: 'wss://b', held: [g1, v2, ...newer(300, OTHER, T, 'o')], cap: 300 },
            { relay: 'wss://c', held: older, cap: 500 },
            { relay: 'wss://d', held: older, cap: 500 },
        ];
        const r = await readOver(relays);
        expect(ids(r)).toEqual(expect.arrayContaining([g1.id, v2.id]));
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });

    it('a mix where the 500 relays hold the genesis under older events: v2 read, every relay in full', async () => {
        const older = junk(499, OTHER, T, (i) => genesis.created_at + 1 + (i % 49), 'q');
        const relays: Planted[] = [
            { relay: 'wss://a', held: [g1, v2, ...newer(300, OTHER, T, 'o')], cap: 300 },
            { relay: 'wss://b', held: [g1, v2, ...newer(300, OTHER, T, 'o')], cap: 300 },
            { relay: 'wss://c', held: [g1, ...older], cap: 500 },
            { relay: 'wss://d', held: [g1, ...older], cap: 500 },
        ];
        const r = await readOver(relays);
        expect(ids(r)).toEqual(expect.arrayContaining([g1.id, v2.id]));
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });

    it('a mix holding the same events, two relays at 300 and two at 500: v2 read, every relay in full', async () => {
        const held = [g1, v2, ...newer(450, OTHER, T, 'o')];
        const r = await readOver(FOUR.map((relay, i) => ({ relay, held, cap: i < 2 ? 300 : 500 })));
        expect(ids(r)).toContain(v2.id);
        expect(r).toMatchObject({ truncated: false, floorMet: true });
    });

    it('300 events in one second newer than v2, relays capping at 300: the read steps past that second, reads v2, and is cut off there', async () => {
        const r = await readOver(every([g1, v2, ...newer(300, OTHER, T, 'o', true)], 300));
        expect(ids(r)).toEqual(expect.arrayContaining([g1.id, v2.id]));
        expect(r.truncated).toBe(true);
        // The founder was found below the flood, and its keys read in full; every relay answered every REQ.
        expect(r.incomplete).toBe(false);
        expect(r.floorMet).toBe(true);
    });

    it('a relay that stops answering partway stays cut off, though every other relay is read in full', async () => {
        const relays = every([g1, v2, ...newer(300, OTHER, T, 'o')], 300);
        relays[3] = { ...relays[3]!, answers: (f) => f.until === undefined };
        const r = await readOver(relays);
        expect(ids(r)).toContain(v2.id);
        expect(r.floorMet).toBe(false);
    });

    it('a relay that never stops sending events it has not sent before is cut off at the bound, not read forever', async () => {
        const calls: Record<string, unknown>[] = [];
        const base = planted(FOUR.slice(0, 3).map((relay) => ({ relay, held: [g1, v2], cap: 300 })), calls);
        let made = 0;
        const query = async (f: Record<string, unknown>) => {
            const res = await base(f);
            const open = Array.isArray(f['#t']) && !f.authors;
            const top = (f.until as number | undefined) ?? genesis.created_at + 100_000;
            const fresh = open ? junk(300, OTHER, T, (i) => top - i, `n${(made++).toString(16)}x`) : [];
            return {
                events: [...res.events, ...fresh],
                relayStatus: [
                    ...res.relayStatus,
                    { relay: 'wss://endless', eose: true, events: fresh.length, rejected: 0 },
                ],
            };
        };
        const r = await readChannelVersions(genesis.channel_id, { query, everBoundKeys: founderKeys }, FOUNDER);
        expect(r.truncated).toBe(true);
        // Cut off by the bound, not by a relay: every REQ met the floor, and the founder's key read was read in full.
        expect(r.floorMet).toBe(true);
        expect(calls.filter((f) => Array.isArray(f['#t']) && !f.authors).length).toBeLessThanOrEqual(16);
    });

    it("the walk back to a parent a version names: 2,600 events under the parent's d-tag stop it at its bound, truncated", async () => {
        const parent: string[][] = [['d', versionDtag(descriptorId(genesis))]];
        const flood = junk(2600, OTHER, parent, (i) => genesis.created_at + 1000 + i, 'w');
        expect((await readOver(every([v2], 300), FOUNDER)).truncated).toBe(false);
        expect((await readOver(every([v2, ...flood], 300), FOUNDER)).truncated).toBe(true);
    });

    it('a relay whose NIP-11 document declares a page under 100 and that sent anything is cut off, when the reads ask', async () => {
        const reads = { query: planted(every([g1, v2], 500)), everBoundKeys: founderKeys };
        expect((await readChannelVersions(genesis.channel_id, reads, FOUNDER)).floorMet).toBe(true);
        const maxLimit = async (relay: string) => (relay === 'wss://a' ? 50 : 500);
        const r = await readChannelVersions(genesis.channel_id, { ...reads, maxLimit }, FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r.floorMet).toBe(false);
    });

    it('one relay holding a newer event the others lack does not leave them cut off', async () => {
        const relays = every([g1, v2], 500);
        relays[0] = { ...relays[0]!, held: [g1, v2, ...newer(1, OTHER, T, 'o')] };
        const r = await readOver(relays);
        expect(r).toMatchObject({ truncated: false, incomplete: false, floorMet: true });
    });
});

describe('readChannelVersions: a read anyone can publish into that stops at its bound meets the floor on each REQ it made; every other read on the relays read to its end (§8.3.1, §8.7)', () => {
    const flood = newer(2500, OTHER, T, 'o');
    const openRead = (f: Record<string, unknown>) => Array.isArray(f['#t']) && !f.authors;
    const firstPage = (f: Record<string, unknown>) => f.until === undefined && f.since === undefined;

    it('a flood alone: truncated, and the floor met, since every relay answered every REQ and the key reads were read in full', async () => {
        const r = await readOver(every([g1, v2, ...flood], 500), FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r).toMatchObject({ truncated: true, incomplete: false, floorMet: true });
    });

    it('relays silent after their first page of the flooded read: one of four leaves each REQ at the floor, two do not', async () => {
        const quiet = (n: number): Planted[] =>
            every([g1, v2, ...flood], 500).map((p, i) =>
                i < n ? { ...p, answers: (f) => !openRead(f) || firstPage(f) } : p
            );
        expect(await readOver(quiet(1), FOUNDER)).toMatchObject({ truncated: true, incomplete: false, floorMet: true });
        expect(await readOver(quiet(2), FOUNDER)).toMatchObject({ truncated: true, incomplete: false, floorMet: false });
    });

    it("a newer version on one relay of four, behind 500 of the founder's own events, that relay stopping after its first page: the floor unmet, though each REQ met it", async () => {
        // No `s` tag, so the walk forward does not find it: only the founder's key read under `t` does.
        const c3 = next(next(genesis, 'Town, edited', genesis.created_at + 50), 'Town, v3', genesis.created_at + 80);
        const v3 = signNostrEvent(
            {
                pubkey: founderKey.nostrPk,
                kind: 30110,
                created_at: c3.created_at,
                content: JSON.stringify(c3),
                tags: [
                    ['d', versionDtag(descriptorId(c3))],
                    ['t', c3.channel_id],
                    ['binding', JSON.stringify(founderKey.record)],
                ],
            },
            founderKey.nostrSk
        );
        const own = junk(500, founderKey.nostrPk, T, (i) => genesis.created_at + 100 + i, 'f');
        const held = [g1, v2, ...own, ...newer(2600, OTHER, T, 'o')];
        const relays = (stops: boolean): Planted[] =>
            every(held, 500).map((p, i) =>
                i === 3 ? { ...p, held: [...held, v3], ...(stops ? { answers: firstPage } : {}) } : p
            );
        const stopped = await readOver(relays(true), FOUNDER);
        expect(ids(stopped)).not.toContain(v3.id);
        expect(stopped).toMatchObject({ truncated: true, incomplete: false, floorMet: false });
        const full = await readOver(relays(false), FOUNDER);
        expect(ids(full)).toContain(v3.id);
        expect(full).toMatchObject({ truncated: true, incomplete: false, floorMet: true });
    });

    it("the walk back stopped at its bound by 2,600 events under the parent's d-tag: truncated, the floor met on its REQs", async () => {
        const parent: string[][] = [['d', versionDtag(descriptorId(genesis))]];
        const r = await readOver(every([v2, ...junk(2600, OTHER, parent, (i) => genesis.created_at + 1000 + i, 'w')], 300), FOUNDER);
        expect(r).toMatchObject({ truncated: true, floorMet: true });
    });

    it("the legacy read stopped at its bound by 2,600 events under the channel's legacy d-tag: truncated, the floor met on its REQs", async () => {
        const legacy: string[][] = [['d', descriptorDtag(genesis.channel_id)]];
        const r = await readOver(every([g1, v2, ...junk(2600, OTHER, legacy, (i) => genesis.created_at + 1000 + i, 'l')], 500), FOUNDER);
        expect(ids(r)).toContain(v2.id);
        expect(r).toMatchObject({ truncated: true, incomplete: false, floorMet: true });
    });

    it('a REQ of the flooded read that a relay answered with part of a page and no EOSE leaves the floor unmet', async () => {
        const base = planted(every([g1, v2, ...flood], 500));
        let n = 0;
        const query = async (f: Record<string, unknown>) => {
            const res = await base(f);
            if (!openRead(f) || n++ !== 1) return res;
            return { ...res, relayStatus: res.relayStatus.map((s, i) => (i === 0 ? { ...s, eose: false } : s)) };
        };
        const r = await readChannelVersions(genesis.channel_id, { query, everBoundKeys: founderKeys }, FOUNDER);
        expect(r).toMatchObject({ truncated: true, floorMet: false });
    });
});

describe('recordReads: the floor counts relays that answered in full', () => {
    const lookup = (status: RelayAnswer[], limit?: number) =>
        recordReads(async () => ({ events: [], relayStatus: status, ...(limit ? { limit } : {}) }), {
            hostKeys,
            verifyBip322: () => true,
        });
    const five = (r: RelayAnswer) => Array.from({ length: 5 }, (_, i) => ({ ...r, relay: `wss://${i}` }));

    it('an EOSE after a capped page is not a full answer when the lookup says its limit', async () => {
        const capped = lookup(five({ eose: true, events: 500 }), 500);
        expect((await capped.everBoundKeys(FOUNDER)).floor).toBe(false);
        const short = lookup(five({ eose: true, events: 3 }), 500);
        expect((await short.everBoundKeys(FOUNDER)).floor).toBe(true);
    });

    it('a relay a paging lookup reports cut off keeps the floor unmet, however many others answered', async () => {
        const status: RelayAnswer[] = [
            ...five({ eose: true, state: 'complete' }).slice(0, 4),
            { relay: 'wss://4', eose: true, state: 'cut_off' },
        ];
        expect((await lookup(status).everBoundKeys(FOUNDER)).floor).toBe(false);
        status[4] = { relay: 'wss://4', eose: false, state: 'no_answer' };
        expect((await lookup(status).everBoundKeys(FOUNDER)).floor).toBe(true);
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
        expect(await reads([bind], [false, false, false, false]).liveness(b!)).toBe('unknown');
        await expect(reads([bind], [true, true, false, false]).liveness(b!)).rejects.toThrow(
            new UnansweredReadError(
                '2 of 4 relays answered in full, fewer than the read floor of 3, so a revocation of this binding may not have been seen'
            )
        );
        expect(await reads([bind], [true, true, true, false]).liveness(b!)).toBe('live');
        expect(await reads([bind, revoke], [true, false, false, false]).liveness(b!)).toBe('revoked');
    });

    it('a relay cut off is named as cut off, never as one that did not answer', async () => {
        const b = await recordBinding(bind, nostrPk, { hostKeys, verifyBip322: () => true });
        const status: RelayAnswer[] = [
            { relay: 'wss://a', eose: true, state: 'complete' },
            { relay: 'wss://b', eose: true, state: 'complete' },
            { relay: 'wss://c', eose: true, state: 'complete' },
            { relay: 'wss://d', eose: false, state: 'cut_off' },
        ];
        const cut = recordReads(async () => ({ events: [bind], relayStatus: status }), {
            hostKeys,
            verifyBip322: () => true,
            now: () => new Date('2026-10-20T00:00:00Z'),
        });
        const why = '3 of 4 relays answered in full and 1 was cut off before the end of what it holds';
        await expect(cut.liveness(b!)).rejects.toThrow(`${why}, so a revocation of this binding may not have been seen`);
        await expect(cut.isBound(nostrPk, ADDR)).rejects.toThrow(
            `${why}, so a record that binds or revokes this key may not have been seen`
        );
    });

    it('two cut off, one by a full page under the limit the lookup asked: each counted as cut off, not as answering in full', async () => {
        const b = await recordBinding(bind, nostrPk, { hostKeys, verifyBip322: () => true });
        const status: RelayAnswer[] = [
            { relay: 'wss://a', eose: true, events: 1 },
            { relay: 'wss://b', eose: true, events: 1 },
            { relay: 'wss://c', eose: true, events: 500 },
            { relay: 'wss://d', eose: false, events: 7 },
        ];
        const cut = recordReads(async () => ({ events: [bind], relayStatus: status, limit: 500 }), {
            hostKeys,
            verifyBip322: () => true,
            now: () => new Date('2026-10-20T00:00:00Z'),
        });
        await expect(cut.liveness(b!)).rejects.toThrow(
            '2 of 4 relays answered in full and 2 were cut off before the end of what they hold, so a revocation of this binding may not have been seen'
        );
    });

    it('bound now, not bound and every key ever bound: below the floor, not read', async () => {
        await expect(reads([bind], [true, true, false, false]).isBound(nostrPk, ADDR)).rejects.toThrow(
            '2 of 4 relays answered in full, fewer than the read floor of 3, so a record that binds or revokes this key may not have been seen'
        );
        await expect(reads([], [true, true, false, false]).isBound(nostrPk, ADDR)).rejects.toBeInstanceOf(UnansweredReadError);
        expect(await reads([bind], [true, true, true, false]).isBound(nostrPk, ADDR)).toBe(true);
        expect(await reads([], [true, true, true, false]).isBound(nostrPk, ADDR)).toBe(false);
        // "Ever bound" stands on what was returned, but the floor says whether a key may be missing.
        expect(await reads([bind], [true, true, false, false]).everBoundKeys(ADDR)).toEqual({ keys: [nostrPk], answered: true, floor: false });
        expect(await reads([bind], [true, true, true, false]).everBoundKeys(ADDR)).toEqual({ keys: [nostrPk], answered: true, floor: true });
    });
});
