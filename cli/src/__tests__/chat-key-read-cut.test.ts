/**
 * `oc chat verify` over four relays that answer newest first up to 500 a page: a
 * role holder's newer version on one relay, behind 500 of the founder's own events,
 * with the channel's open read flooded past its bound. When that relay stops after
 * the first page of the founder's key read, the read is cut off there, so nothing
 * says the version verified is the tip.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ed25519 } from '@noble/curves/ed25519';
import { channelId, descriptorId, versionDtag, type DescriptorContent, type NostrEvent } from '@orangecheck/chat-core';
import { deriveNostrKey, generateDeviceKey, signNostrEvent } from '@orangecheck/lock-device';
import { matchFilter } from '@orangecheck/nostr-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveNet, runChatVerify, type RawQuery } from '../commands/chat';

class ExitCalled extends Error {
    constructor(public code: number) {
        super(`process.exit(${code})`);
    }
}
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const enc = (s: string) => new TextEncoder().encode(s);
const HOST_SK = new Uint8Array(32).fill(42);
const HOST = { kty: 'OKP', crv: 'Ed25519', kid: 'k', x: b64url(ed25519.getPublicKey(HOST_SK)) };
const FOUNDER = 'did:oc:' + 'a'.repeat(32);

function sessionDevice(did: string) {
    const kp = generateDeviceKey();
    const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
    const st = `oc-chat:device-vouch:v1\ndid_oc: ${did}\ndevice_pk: ${kp.device_pk}\nnostr_pk: ${nostrPk}\ndevice_id: ${kp.device_id}\nissued_at: 1780000000\n`;
    const h = b64url(enc(JSON.stringify({ alg: 'EdDSA', typ: 'oc-chat-device-vouch', kid: 'k' })));
    const p = b64url(enc(st));
    const vouch = `${h}.${p}.${b64url(ed25519.sign(enc(`${h}.${p}`), HOST_SK))}`;
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

const founder = sessionDevice(FOUNDER);
const genesis: DescriptorContent = {
    v: 1,
    channel_id: channelId(FOUNDER, 'town'),
    slug: 'town',
    founder_address: FOUNDER,
    founder_inbox_pubkey: founder.nostrPk,
    read: 'public',
    encryption: null,
    write: { policy: 'open', utxo_floor_confs: 0, utxo_floor_sats: 0, allowlist_root: null, rooted: false },
    admins: [],
    moderators: [],
    title: 'Town',
    description: '',
    avatar: null,
    rules: null,
    directory_opt_in: false,
    created_at: 1780000100,
    supersedes: null,
};
// No `s` tag, so the walk forward does not find a version: only the founder's key read does.
const versionBy = (c: DescriptorContent) =>
    signNostrEvent(
        {
            pubkey: founder.nostrPk,
            kind: 30110,
            created_at: c.created_at,
            content: JSON.stringify(c),
            tags: [
                ['d', versionDtag(descriptorId(c))],
                ['t', c.channel_id],
                ['binding', JSON.stringify(founder.record)],
            ],
        },
        founder.nostrSk
    );
const v2c: DescriptorContent = { ...genesis, title: 'Town, edited', created_at: 1780000150, supersedes: descriptorId(genesis) };
const G = versionBy(genesis);
const V2 = versionBy(v2c);
const V3 = versionBy({ ...genesis, title: 'Town, v3', created_at: 1780000180, supersedes: descriptorId(v2c) });

const other = deriveNostrKey(generateDeviceKey().device_sk);
// Another key's events under the channel's tag, newer than every version: past the open read's bound.
const FLOOD: NostrEvent[] = Array.from({ length: 2600 }, (_, i) => ({
    id: (0x300000 + i).toString(16).padStart(64, '0'),
    pubkey: other.nostrPk,
    created_at: 1780010000 + i,
    kind: 30110,
    tags: [
        ['d', `junk-${i}`],
        ['t', genesis.channel_id],
    ],
    content: 'junk',
    sig: '0'.repeat(128),
}));
// The founder's own events under the tag, newer than every version: its key read's first page.
const OWN = Array.from({ length: 500 }, (_, i) =>
    signNostrEvent(
        {
            pubkey: founder.nostrPk,
            kind: 30110,
            created_at: 1780000200 + i,
            content: `own${i}`,
            tags: [
                ['t', genesis.channel_id],
                ['d', `own-${i}`],
            ],
        },
        founder.nostrSk
    )
);

const RELAYS = ['wss://a.example', 'wss://b.example', 'wss://c.example', 'wss://d.example'];
const D = RELAYS[3]!;
const firstPage = (f: Record<string, unknown>) => f.until === undefined && f.since === undefined;

/** The four relays hold `base`; d also holds V3 and, when `stops`, answers only a read's first page. */
const raw =
    (base: NostrEvent[], stops: boolean): RawQuery =>
    async (filter, relays) => {
        const sent = new Map<string, NostrEvent>();
        const relayStatus = relays.map((relay) => {
            if (relay === D && stops && !firstPage(filter)) return { relay, eose: false, events: 0, rejected: 0 };
            const held = relay === D ? [...base, V3] : base;
            const page = held
                .filter((e) => matchFilter(e as never, filter as never))
                .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))
                .slice(0, Math.min(typeof filter.limit === 'number' ? filter.limit : Infinity, 500));
            for (const e of page) sent.set(e.id, e);
            return { relay, eose: true, events: page.length, rejected: 0 };
        });
        return { events: [...sent.values()], relayStatus };
    };

let stdout = '';
beforeEach(() => {
    stdout = '';
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        throw new ExitCalled(Number(c ?? 0));
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
        stdout += String(chunk);
        return true;
    }) as never);
    vi.stubGlobal('fetch', (async () => ({ ok: true, status: 200, json: async () => ({ keys: [HOST] }) })) as unknown as typeof fetch);
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function verify(base: NostrEvent[], stops: boolean, opts: { founder?: string; json?: boolean } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'oc-chat-cut-'));
    const f = join(dir, 'v2.json');
    writeFileSync(f, JSON.stringify(V2));
    stdout = '';
    const net = liveNet(RELAYS, 'https://esplora.test/api', raw(base, stops));
    try {
        await runChatVerify({ file: f, json: opts.json ?? true, ...(opts.founder ? { founder: opts.founder } : {}) }, net);
    } catch (e) {
        if (e instanceof ExitCalled) return e.code;
        throw e;
    }
    return -1;
}

describe("oc chat verify: a role holder's key read cut off on one relay of four leaves the tip unknown (SPEC §8.3.1, §8.7)", () => {
    const flooded = [G, V2, founder.record, ...FLOOD, ...OWN];

    it("the relay holding the newer version stops after its key read's first page: can't tell, NOT READ, exit 2, never the tip", async () => {
        expect(await verify(flooded, true, { founder: FOUNDER })).toBe(2);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('unread');
        expect(r.detail.is_tip).toBeNull();
        expect(r.not_checked.join('\n')).toMatch(/can't tell: .*or a relay was cut off partway, so a newer version may exist/);
        expect(await verify(flooded, true, { founder: FOUNDER, json: false })).toBe(2);
        expect(stdout).toContain(`relay  ${D} did not answer`);
        expect(stdout).not.toContain('every read met the floor');
        expect(stdout).toMatch(/^NOT READ/m);
    }, 120_000);

    it('the same relay answering in full: the newer version is read, VERIFIED and not the tip', async () => {
        expect(await verify(flooded, false, { founder: FOUNDER })).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('verified');
        expect(r.detail.is_tip).toBe(false);
    }, 120_000);

    it("with no founder named, the same stop: can't tell, NOT READ, exit 2", async () => {
        expect(await verify(flooded, true)).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
    }, 120_000);

    it("with no flood, the open read is read to its end and the same stop: can't tell, NOT READ, exit 2", async () => {
        expect(await verify([G, V2, founder.record, ...OWN], true, { founder: FOUNDER })).toBe(2);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('unread');
        expect(r.detail.is_tip).toBeNull();
    }, 120_000);
});
