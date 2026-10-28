/**
 * `oc chat verify` over an injected network: a channel founded by a did:oc
 * session device, its versions and a post, served from memory. Checks what is
 * printed, what --offline says it skipped, and the exit codes.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ed25519 } from '@noble/curves/ed25519';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import {
    CHAT_RELAYS,
    channelId,
    descriptorId,
    DEVICE_RECORD_RELAYS,
    deviceDtag,
    postDtag,
    postId,
    versionDtag,
    type DescriptorContent,
    type NostrEvent,
    type PostContent,
} from '@orangecheck/chat-core';
import {
    buildBindingStatement,
    deriveNostrKey,
    finalizeDeviceEvent,
    generateDeviceKey,
    signNostrEvent,
} from '@orangecheck/lock-device';
import { DEFAULT_RELAYS, matchFilter } from '@orangecheck/nostr-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveNet, relaySets, runChatVerify, type ChatNet, type RawQuery } from '../commands/chat';

class ExitCalled extends Error {
    constructor(public code: number) {
        super(`process.exit(${code})`);
    }
}

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const HOST_SK = new Uint8Array(32).fill(42);
const HOST = { kty: 'OKP', crv: 'Ed25519', kid: 'k', x: b64url(ed25519.getPublicKey(HOST_SK)) };
const FOUNDER = 'did:oc:' + 'a'.repeat(32);
const enc = (s: string) => new TextEncoder().encode(s);

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
    return { kp, nostrSk, nostrPk, record };
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
const did = descriptorId(genesis);
const version = signNostrEvent(
    {
        pubkey: founder.nostrPk,
        kind: 30110,
        created_at: genesis.created_at,
        content: JSON.stringify(genesis),
        tags: [
            ['d', versionDtag(did)],
            ['t', genesis.channel_id],
            ['binding', JSON.stringify(founder.record)],
        ],
    },
    founder.nostrSk
);
const postContent: PostContent = {
    v: 1,
    kind: 'chat-channel',
    channel_id: genesis.channel_id,
    author_address: FOUNDER,
    author_inbox_pubkey: founder.nostrPk,
    body: 'gm',
    seq: 0,
    parent_id: null,
};
const post = signNostrEvent(
    {
        pubkey: founder.nostrPk,
        kind: 30111,
        created_at: 1780000200,
        content: JSON.stringify(postContent),
        tags: [
            ['d', postDtag(genesis.channel_id, postId(postContent))],
            ['t', genesis.channel_id],
        ],
    },
    founder.nostrSk
);

/** A network holding `events`, answering every read unless `silent`. */
function net(events: NostrEvent[], silent = false): ChatNet {
    return {
        query: async (filter) => ({
            events: silent ? [] : events.filter((e) => matchFilter(e, filter as never)),
            relayStatus: [{ eose: !silent }],
        }),
        records: async (p) => ({
            events: silent ? [] : events.filter((e) => e.kind === 30078 && e.tags.some((t) => t[0] === 'd' && t[1] === deviceDtag(p))),
            relayStatus: [{ eose: !silent }],
        }),
        hostKeys: async () => [HOST],
        tip: async () => 930000,
        verifyOnChain: async () => {
            throw new Error('not reached for an open channel');
        },
        walk: {
            page: async () => ({ events: [], complete: true }),
            tip: async () => 930000,
            headers: { getHeaderAt: async () => null },
            coin: async () => 'no-answer',
        },
    };
}

let stdout = '';
const file = (ev: NostrEvent) => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-chat-verify-'));
    const f = join(dir, 'event.json');
    writeFileSync(f, JSON.stringify(ev));
    return f;
};
async function run(opts: Parameters<typeof runChatVerify>[0], n?: ChatNet | null): Promise<number> {
    try {
        await runChatVerify(opts, n);
    } catch (e) {
        if (e instanceof ExitCalled) return e.code;
        throw e;
    }
    return -1;
}

beforeEach(() => {
    stdout = '';
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new ExitCalled(Number(code ?? 0));
    }) as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
        stdout += String(chunk);
        return true;
    }) as never);
});
afterEach(() => vi.restoreAllMocks());

describe('oc chat verify', () => {
    it('a version on the resolved chain is VERIFIED, exit 0', async () => {
        expect(await run({ file: file(version) }, net([version, founder.record]))).toBe(0);
        expect(stdout).toContain('VERIFIED');
        expect(stdout).toContain(`is_tip: true`);
        expect(stdout).not.toContain('not checked');
    });

    it('a post by a bound key in an open channel is VERIFIED', async () => {
        expect(await run({ file: file(post), json: true }, net([version, founder.record, post]))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('verified');
        expect(r.not_checked).toEqual([]);
    });

    it('a version whose only signer has revoked its device FAILS, exit 1', async () => {
        const revoked = signNostrEvent(
            {
                pubkey: founder.nostrPk,
                kind: 30078,
                created_at: 1780000300,
                content: 'revoked\n',
                tags: [
                    ['d', `oc-chat:device:${FOUNDER}`],
                    ['addr', FOUNDER],
                    ['device_id', founder.kp.device_id],
                    ['device_pk', 'revoked'],
                    ['auth', 'session'],
                    ['binding_sig', ''],
                ],
            },
            founder.nostrSk
        );
        expect(await run({ file: file(version) }, net([version, revoked]))).toBe(1);
        expect(stdout).toContain('FAIL  the channel resolves from what the relays hold');
    });

    it('a tampered post FAILS its signature offline', async () => {
        const tampered = { ...post, content: post.content.replace('gm', 'gn') };
        expect(await run({ file: file(tampered), offline: true }, null)).toBe(1);
        expect(stdout).toContain('FAIL  the event id and Schnorr signature hold');
    });

    it('--offline says what it did not check and never says VERIFIED, exit 3', async () => {
        expect(await run({ file: file(version), offline: true, json: true }, null)).toBe(3);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('passed-offline');
        expect(r.not_checked.join('\n')).toMatch(/relays/);
        expect(r.not_checked.join('\n')).toMatch(/ochk\.io's keys/);
        stdout = '';
        expect(await run({ file: file(post), offline: true }, null)).toBe(3);
        expect(stdout).toContain('PASSED OFFLINE CHECKS ONLY: not verified');
        expect(stdout).not.toMatch(/^VERIFIED/m);
        expect(stdout).toContain('not checked  the write gate');
    });

    it('a handle offline names the chain and the claim as unread', async () => {
        expect(await run({ handle: 'alice', offline: true, json: true }, null)).toBe(3);
        const r = JSON.parse(stdout);
        expect(r.not_checked.join('\n')).toMatch(/the chain/);
        expect(r.not_checked.join('\n')).toMatch(/the claim/);
    });

    it('relays that do not answer are NOT READ, exit 2, never a verdict', async () => {
        expect(await run({ channel: genesis.channel_id, json: true }, net([], true))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
    });
});

/** A version event of `content` signed by `sk`, optionally carrying a binding record. */
function versionBy(nostrSk: string, nostrPk: string, content: DescriptorContent, binding?: NostrEvent): NostrEvent {
    return signNostrEvent(
        {
            pubkey: nostrPk,
            kind: 30110,
            created_at: content.created_at,
            content: JSON.stringify(content),
            tags: [
                ['d', versionDtag(descriptorId(content))],
                ['t', content.channel_id],
                ...(binding ? [['binding', JSON.stringify(binding)]] : []),
            ],
        },
        nostrSk
    );
}

describe('oc chat verify: a version event is checked as this event, not its content (§8.3.1)', () => {
    it('the genesis content re-signed by a fresh key FAILS, beside the founder’s copy or alone', async () => {
        const kp = generateDeviceKey();
        const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
        const forged = versionBy(nostrSk, nostrPk, genesis);
        expect(await run({ file: file(forged), json: true }, net([version, founder.record, forged]))).toBe(1);
        let r = JSON.parse(stdout);
        expect(r.verdict).toBe('failed');
        expect(r.checks.find((c: { check: string }) => /authorized copy/.test(c.check)).ok).toBe(false);
        expect(r.detail.is_tip).toBe(false);
        expect(r.detail.on_resolved_chain).toBe(false);
        stdout = '';
        expect(await run({ file: file(forged), json: true }, net([forged]))).toBe(1);
        r = JSON.parse(stdout);
        expect(r.verdict).toBe('failed');
    });

    it('the same content signed by another did:oc’s vouched device FAILS', async () => {
        const other = sessionDevice('did:oc:' + 'b'.repeat(32));
        const copy = versionBy(other.nostrSk, other.nostrPk, genesis, other.record);
        expect(await run({ file: file(copy), json: true }, net([version, founder.record, copy, other.record]))).toBe(1);
        const r = JSON.parse(stdout);
        expect(r.checks.find((c: { check: string }) => /authorized copy/.test(c.check)).ok).toBe(false);
    });

    it('a post by a key no record binds to its author FAILS', async () => {
        const kp = generateDeviceKey();
        const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
        const content = { ...postContent, author_inbox_pubkey: nostrPk, body: 'not mine' };
        const forged = signNostrEvent(
            {
                pubkey: nostrPk,
                kind: 30111,
                created_at: 1780000300,
                content: JSON.stringify(content),
                tags: [
                    ['d', postDtag(genesis.channel_id, postId(content))],
                    ['t', genesis.channel_id],
                ],
            },
            nostrSk
        );
        expect(await run({ file: file(forged), json: true }, net([version, founder.record, forged]))).toBe(1);
        expect(JSON.parse(stdout).checks.at(-1).detail).toBe('E_CH_UNAUTHORIZED');
    });
});

/** A utxo-floor channel and a post by a Bitcoin address that BIP-322 binds and signs. */
const BTC_SK = new Uint8Array(32).fill(21);
const AUTHOR = addressFromPrivateKey(BTC_SK, 'p2wpkh');
const authorDevice = (() => {
    const kp = generateDeviceKey();
    const { nostrSk, nostrPk } = deriveNostrKey(kp.device_sk);
    const statement = buildBindingStatement({
        address: AUTHOR,
        device_pk: kp.device_pk,
        device_id: kp.device_id,
        created_at: '2026-09-01T00:00:00.000Z',
        nostr_pk: nostrPk,
    });
    const record = finalizeDeviceEvent({
        deviceSk: kp.device_sk,
        address: AUTHOR,
        device_id: kp.device_id,
        device_pk: kp.device_pk,
        bindingStatement: statement,
        bindingSigBase64: signMessage(AUTHOR, statement, BTC_SK),
    });
    return { nostrSk, nostrPk, record };
})();
const gated: DescriptorContent = {
    ...genesis,
    slug: 'gated',
    channel_id: channelId(FOUNDER, 'gated'),
    write: { policy: 'utxo-floor', utxo_floor_confs: 144, utxo_floor_sats: 0, allowlist_root: null, rooted: true },
};
const gatedVersion = versionBy(founder.nostrSk, founder.nostrPk, gated, founder.record);
const PROOF = {
    outpoint: `${'ab'.repeat(32)}:0`,
    value_sats: 50000,
    anchor_block_height: 900000,
    anchor_block_hash: '00'.repeat(32),
};
const gatedContent: PostContent = {
    ...postContent,
    channel_id: gated.channel_id,
    author_address: AUTHOR,
    author_inbox_pubkey: authorDevice.nostrPk,
    body: 'priced in coin age',
    write_proof: PROOF,
};
const gatedPost = signNostrEvent(
    {
        pubkey: authorDevice.nostrPk,
        kind: 30111,
        created_at: 1780000400,
        content: JSON.stringify(gatedContent),
        tags: [
            ['d', postDtag(gated.channel_id, postId(gatedContent))],
            ['t', gated.channel_id],
            ['control_sig', signMessage(AUTHOR, postId(gatedContent), BTC_SK)],
        ],
    },
    authorDevice.nostrSk
);
const COIN = {
    txid: 'ab'.repeat(32),
    vout: 0,
    value: 50000,
    status: { confirmed: true, block_height: 900000, block_hash: '00'.repeat(32) },
};

/** The in-memory relays, with ochk.io and the chain read by liveNet over a stubbed fetch. */
function chainNet(answer: (url: string) => Response | Promise<Response>): ChatNet {
    vi.stubGlobal('fetch', (async (url: string) => answer(String(url))) as unknown as typeof fetch);
    const live = liveNet([], 'https://esplora.test/api');
    return {
        ...net([gatedVersion, founder.record, gatedPost, authorDevice.record]),
        hostKeys: live.hostKeys,
        tip: live.tip,
        verifyOnChain: live.verifyOnChain,
    };
}
const json = (body: unknown) => ({ ok: true, json: async () => body, text: async () => String(body) }) as unknown as Response;
const refused = () => Promise.reject(new TypeError('fetch failed'));
const answers = (over: Partial<Record<'jwks' | 'tip' | 'utxo', () => Response | Promise<Response>>>) => (url: string) =>
    url.includes('jwks')
        ? (over.jwks ?? (() => json({ keys: [HOST] })))()
        : url.endsWith('/blocks/tip/height')
          ? (over.tip ?? (() => json(930000)))()
          : (over.utxo ?? (() => json([COIN])))();

describe('oc chat verify: the write gate, and reads that get no answer', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('a utxo-floor post whose coin is on chain is VERIFIED', async () => {
        expect(await run({ file: file(gatedPost), json: true }, chainNet(answers({})))).toBe(0);
        expect(JSON.parse(stdout).verdict).toBe('verified');
    });

    it('a utxo-floor post whose coin is not there FAILS (E_CHAN_FLOOR)', async () => {
        expect(await run({ file: file(gatedPost), json: true }, chainNet(answers({ utxo: () => json([]) })))).toBe(1);
        expect(JSON.parse(stdout).checks.at(-1).detail).toBe('E_CHAN_FLOOR');
    });

    it('an Esplora outputs read that fails is NOT READ, exit 2', async () => {
        expect(await run({ file: file(gatedPost), json: true }, chainNet(answers({ utxo: refused })))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
    });

    it('a tip read that is refused is NOT READ, exit 2', async () => {
        expect(await run({ file: file(gatedPost), json: true }, chainNet(answers({ tip: refused })))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
    });

    it('a JWKS read that fails, or answers non-ok, is NOT READ for a did:oc version, exit 2', async () => {
        const notOk = () => ({ ok: false, json: async () => ({}) }) as unknown as Response;
        for (const jwks of [refused, notOk]) {
            stdout = '';
            expect(await run({ file: file(version), json: true }, { ...chainNet(answers({ jwks })), ...pick(net([version, founder.record])) })).toBe(2);
            expect(JSON.parse(stdout).verdict).toBe('unread');
        }
    });

    it('a JWKS that answers with no keys binds nothing: the did:oc version FAILS', async () => {
        const n = { ...chainNet(answers({ jwks: () => json({ keys: [] }) })), ...pick(net([version, founder.record])) };
        expect(await run({ file: file(version), json: true }, n)).toBe(1);
    });
});

/** The relay reads of one network, to lay over another's ochk.io and chain reads. */
const pick = (n: ChatNet) => ({ query: n.query, records: n.records });

describe('oc chat verify: where a version event stands', () => {
    // G, then the founder's edit V2 on it; G2 another genesis of the founder's, on a branch V2 outgrows.
    const v2Content: DescriptorContent = { ...genesis, title: 'Town, edited', created_at: 1780000150, supersedes: descriptorId(genesis) };
    const v2 = versionBy(founder.nostrSk, founder.nostrPk, v2Content, founder.record);
    const g2Content: DescriptorContent = { ...genesis, title: 'Town, again', created_at: 1780000120 };
    const g2 = versionBy(founder.nostrSk, founder.nostrPk, g2Content, founder.record);
    const relays = () => net([version, v2, g2, founder.record]);
    const detail = async (ev: NostrEvent) => {
        stdout = '';
        const code = await run({ file: file(ev), json: true }, relays());
        return { code, ...JSON.parse(stdout).detail };
    };

    it('the tip is on the chain and is the tip', async () => {
        expect(await detail(v2)).toMatchObject({ code: 0, on_resolved_chain: true, is_tip: true, on_relays: true });
    });

    it('an earlier version is on the chain and is not the tip', async () => {
        expect(await detail(version)).toMatchObject({ code: 0, on_resolved_chain: true, is_tip: false });
    });

    it('an authorized version on a branch the chain does not take is neither', async () => {
        expect(await detail(g2)).toMatchObject({ code: 0, on_resolved_chain: false, is_tip: false });
    });

    it('a genuine founder copy the relays do not hold stands by its binding, and says it is not on the relays', async () => {
        stdout = '';
        expect(await run({ file: file(version), json: true }, net([founder.record]))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('verified');
        expect(r.detail).toMatchObject({ on_relays: false, is_tip: true });
    });
});

describe('oc chat verify: a tip answer that is not a number', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is NOT READ, exit 2', async () => {
        const text = () => ({ ok: true, text: async () => 'not a height', json: async () => ({}) }) as unknown as Response;
        expect(await run({ file: file(gatedPost), json: true }, chainNet(answers({ tip: text })))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
    });
});

describe('oc chat verify: relays that do not answer, and the read floor (SPEC §8.7)', () => {
    afterEach(() => vi.unstubAllGlobals());
    const [A, B, C, D] = ['wss://a.example', 'wss://b.example', 'wss://c.example', 'wss://d.example'];
    const FOUR = [A, B, C, D];
    /** Relays that each hold their events, or are silent (null). Every relay named is asked. */
    const relaysOf =
        (byRelay: Record<string, NostrEvent[] | null>): RawQuery =>
        async (filter, relays) => {
            const seen = new Map<string, NostrEvent>();
            for (const r of relays) for (const e of byRelay[r] ?? []) if (matchFilter(e, filter as never)) seen.set(e.id, e);
            return { events: [...seen.values()], relayStatus: relays.map((r) => ({ relay: r, eose: byRelay[r] !== null })) };
        };
    const over = (byRelay: Record<string, NostrEvent[] | null>) => {
        vi.stubGlobal('fetch', (async () => json({ keys: [HOST] })) as unknown as typeof fetch);
        return liveNet(Object.keys(byRelay), 'https://esplora.test/api', relaysOf(byRelay));
    };
    /** The four relays: each holds `base` plus its `extra`; the `silent` ones answer nothing. */
    const four = (base: NostrEvent[], extra: Record<string, NostrEvent[]> = {}, silent: readonly string[] = []) =>
        over(Object.fromEntries(FOUR.map((r) => [r, silent.includes(r) ? null : [...base, ...(extra[r] ?? [])]])));
    /** The four relays, the `missing` ones silent on reads of one kind (versions by default) and answering the rest. */
    const missedBy = (missing: readonly string[], base: NostrEvent[], extra: Record<string, NostrEvent[]> = {}, kind = 30110) => {
        const raw: RawQuery = async (filter, relays) => {
            const missed = (filter.kinds as number[]).includes(kind);
            const seen = new Map<string, NostrEvent>();
            for (const r of relays) {
                if (missing.includes(r) && missed) continue;
                for (const e of [...base, ...(extra[r] ?? [])]) if (matchFilter(e, filter as never)) seen.set(e.id, e);
            }
            return { events: [...seen.values()], relayStatus: relays.map((r) => ({ relay: r, eose: !(missing.includes(r) && missed) })) };
        };
        vi.stubGlobal('fetch', (async () => json({ keys: [HOST] })) as unknown as typeof fetch);
        return liveNet(FOUR, 'https://esplora.test/api', raw);
    };
    const subsets = Array.from({ length: 16 }, (_, m) => FOUR.filter((_, i) => m & (1 << i)));
    const pairs = FOUR.flatMap((a, i) => FOUR.slice(i + 1).map((b) => [a, b]));
    // The founder's version without its binding tag, as a version from before 0.3.0: its key is bound only by records on the relays.
    const legacy = versionBy(founder.nostrSk, founder.nostrPk, { ...genesis, title: 'Town, before 0.3.0' });
    // A newer version of the channel, by the founder.
    const v2 = versionBy(founder.nostrSk, founder.nostrPk, { ...genesis, title: 'Town, edited', created_at: 1780000150, supersedes: descriptorId(genesis) }, founder.record);

    // The founder's own revocation of its session device, at its record's coordinate.
    const revocation = signNostrEvent(
        {
            pubkey: founder.nostrPk,
            kind: 30078,
            created_at: 1780000300,
            content: 'revoked\n',
            tags: [
                ['d', `oc-chat:device:${FOUNDER}`],
                ['addr', FOUNDER],
                ['device_id', founder.kp.device_id],
                ['device_pk', 'revoked'],
                ['auth', 'session'],
                ['binding_sig', ''],
            ],
        },
        founder.nostrSk
    );

    it('the floor of 4 relays asked is 3: one silent relay is named and the verdict stands', async () => {
        expect(await run({ file: file(version), json: true }, four([version, founder.record], {}, [D]))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('verified');
        expect(r.relays).toMatchObject({ asked: 4, answered: 3, floors_missed: [], below_floor: 0, silent: [{ relay: D }] });
        expect(r.not_checked).toEqual([]);
        stdout = '';
        expect(await run({ file: file(version) }, four([version, founder.record], {}, [D]))).toBe(0);
        expect(stdout).toContain('relay  wss://d.example did not answer');
        expect(stdout).toContain('VERIFIED (3 of 4 relays answered every read; every read met its floor)');
    });

    it('below the floor (2 of 4) a verdict that rests on an absence is NOT READ, naming the short reads and the silent relays', async () => {
        expect(await run({ file: file(version), json: true }, four([version, founder.record], {}, [C, D]))).toBe(2);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('unread');
        expect(r.relays).toMatchObject({ asked: 4, answered: 2, floors_missed: ['3 of 4'] });
        expect(r.relays.below_floor).toBeGreaterThan(0);
        const why = r.not_checked.join('\n');
        expect(why).toMatch(/\d+ of \d+ reads had fewer relays answering than their floor \(3 of 4\)/);
        expect(why).toMatch(/relay wss:\/\/c\.example did not answer \d+ of \d+ reads/);
        expect(why).toMatch(/relay wss:\/\/d\.example did not answer/);
        stdout = '';
        expect(await run({ file: file(version) }, four([version, founder.record], {}, [C, D]))).toBe(2);
        expect(stdout).toContain('NOT READ');
        expect(stdout).not.toMatch(/^VERIFIED/m);
    });

    it('a revocation two relays hold is never read as live, for a current version or an older copy, whichever relays are silent', async () => {
        expect(pairs).toHaveLength(6);
        for (const ev of [version, legacy]) {
            for (const holders of pairs) {
                for (const silent of subsets) {
                    stdout = '';
                    const code = await run({ file: file(ev), json: true }, four([ev, founder.record], Object.fromEntries(holders.map((h) => [h, [revocation]])), silent));
                    const at = `${ev === version ? 'version' : 'older copy'}, revocation on ${holders}, silent ${silent}`;
                    expect(code, at).not.toBe(0);
                    // At the floor the revocation is among what answered, so the failure is seen.
                    if (silent.length <= 1) expect(code, at).toBe(1);
                }
            }
        }
    }, 120_000);

    it('a revocation one relay holds, a write that never reached the quorum, is not seen while that relay is silent', async () => {
        // This is why a writer reports it "not yet published" (chat-core publishToQuorum).
        expect(await run({ file: file(version), json: true }, four([version, founder.record], { [B]: [revocation] }, [B]))).toBe(0);
        stdout = '';
        expect(await run({ file: file(version), json: true }, four([version, founder.record], { [B]: [revocation] }))).toBe(1);
        stdout = '';
        expect(await run({ file: file(legacy), json: true }, four([founder.record], { [B]: [revocation] }, [B]))).toBe(0);
    });

    it('"no newer version": a newer version two relays hold is seen whenever the floor is met', async () => {
        const detail = async (n: ChatNet) => {
            stdout = '';
            const code = await run({ file: file(version), json: true }, n);
            return { code, ...JSON.parse(stdout).detail };
        };
        // B and C hold it and both miss the version reads: below the floor.
        expect(await detail(missedBy([B, C], [version, founder.record], { [B]: [v2], [C]: [v2] }))).toMatchObject({ code: 2, is_tip: null });
        // Only B misses them: C returns the newer version.
        expect(await detail(missedBy([B], [version, founder.record], { [B]: [v2], [C]: [v2] }))).toMatchObject({ code: 0, is_tip: false, on_resolved_chain: true });
        // Only B holds it (never published to the quorum) and misses them: the floor is met without it.
        expect(await detail(missedBy([B], [version, founder.record], { [B]: [v2] }))).toMatchObject({ code: 0, is_tip: true });
    });

    it('a channel whose versions two relays hold: NOT READ while both are silent, VERIFIED with one, FAILED when none holds them', async () => {
        const cid = genesis.channel_id;
        const versions = { [B]: [version], [C]: [version] };
        expect(await run({ channel: cid, json: true }, four([founder.record], versions, [B, C]))).toBe(2);
        expect(JSON.parse(stdout)).toEqual(expect.objectContaining({ verdict: 'unread', detail: { resolves: null, channel: null } }));
        stdout = '';
        expect(await run({ file: file(post), json: true }, four([founder.record, post], versions, [B, C]))).toBe(2);
        expect(JSON.parse(stdout)).toEqual(expect.objectContaining({ verdict: 'unread', detail: { post_id: postId(postContent), resolves: null, channel: null } }));
        stdout = '';
        expect(await run({ channel: cid, json: true }, four([founder.record], versions, [B]))).toBe(0);
        stdout = '';
        expect(await run({ file: file(post), json: true }, four([founder.record, post], versions, [B]))).toBe(0);
        stdout = '';
        expect(await run({ channel: cid, json: true }, four([founder.record], {}, [D]))).toBe(1);
        expect(JSON.parse(stdout).detail).toEqual({ resolves: false });
        stdout = '';
        expect(await run({ file: file(post), json: true }, four([founder.record, post], {}, [D]))).toBe(1);
        expect(JSON.parse(stdout).detail).toEqual({ post_id: postId(postContent), resolves: false });
    });

    it('a later version whose genesis two relays hold: NOT READ while both are silent, VERIFIED with one, FAILED when none holds it', async () => {
        const g = { [B]: [version], [C]: [version] };
        expect(await run({ file: file(v2), json: true }, four([founder.record], g, [B, C]))).toBe(2);
        expect(JSON.parse(stdout).detail).toMatchObject({ is_tip: null, on_resolved_chain: null, on_relays: null, resolves: null });
        stdout = '';
        expect(await run({ file: file(v2), json: true }, four([founder.record], g, [B]))).toBe(0);
        stdout = '';
        expect(await run({ file: file(v2), json: true }, four([founder.record]))).toBe(1);
    });

    it('under NOT READ every relay-dependent --json key is null and the text says unknown; only the event’s own id stays', async () => {
        const did = descriptorId(genesis);
        const pid = postId(postContent);
        const cases: [string, Parameters<typeof runChatVerify>[0], Record<string, unknown>][] = [
            ['version', { file: file(version) }, { descriptor_id: did, on_relays: null, on_resolved_chain: null, is_tip: null, resolves: null, channel: null }],
            ['post', { file: file(post) }, { post_id: pid, resolves: null, channel: null }],
            ['--channel', { channel: genesis.channel_id }, { resolves: null, channel: null }],
        ];
        const base = [version, founder.record, post];
        for (const [, opts, want] of cases) {
            // B and C answer every record read but miss the version reads: below the floor.
            stdout = '';
            expect(await run({ ...opts, json: true }, missedBy([B, C], base))).toBe(2);
            const r = JSON.parse(stdout);
            expect(r.verdict).toBe('unread');
            expect(r.detail).toEqual(want);
            stdout = '';
            expect(await run(opts, missedBy([B, C], base))).toBe(2);
            for (const k of Object.keys(want)) if (want[k] === null) expect(stdout).toContain(`  ${k}: unknown`);
            expect(stdout).not.toMatch(/: (true|false|null)$/m);
            // Every relay answering: VERIFIED, and the same keys carry values.
            stdout = '';
            expect(await run({ ...opts, json: true }, four(base))).toBe(0);
            const v = JSON.parse(stdout).detail;
            expect(Object.keys(v).sort()).toEqual(Object.keys(want).sort());
            expect(v).toMatchObject({ resolves: true, channel: { tip: did } });
        }
    });

    it('NOT READ has one shape whether a read threw or the verdict rested on a missed read', async () => {
        /** The verdict, subject and detail of a NOT READ run, and which path it took. */
        const notRead = async (opts: Parameters<typeof runChatVerify>[0], n: ChatNet) => {
            stdout = '';
            expect(await run({ ...opts, json: true }, n)).toBe(2);
            const r = JSON.parse(stdout);
            expect(r.verdict).toBe('unread');
            return { path: r.checks.length === 0 ? 'threw' : 'rested', shape: { subject: r.subject, detail: r.detail } };
        };
        const base = [version, founder.record, post];
        const recordsMissed = () => missedBy([B, C], base, {}, 30078);
        const versionsMissed = () => missedBy([B, C], base);
        const keysRefused = () => ({ ...chainNet(answers({ jwks: refused })), ...pick(net([version, founder.record])) });
        const silent = Object.fromEntries(FOUR.map((r) => [r, null]));

        const v = {
            subject: 'channel version',
            detail: { descriptor_id: descriptorId(genesis), on_relays: null, on_resolved_chain: null, is_tip: null, resolves: null, channel: null },
        };
        expect(await notRead({ file: file(version) }, recordsMissed())).toEqual({ path: 'threw', shape: v });
        expect(await notRead({ file: file(version) }, keysRefused())).toEqual({ path: 'threw', shape: v });
        expect(await notRead({ file: file(version) }, versionsMissed())).toEqual({ path: 'rested', shape: v });

        const p = { subject: 'channel post', detail: { post_id: postId(postContent), resolves: null, channel: null } };
        expect(await notRead({ file: file(post) }, recordsMissed())).toEqual({ path: 'threw', shape: p });
        expect(await notRead({ file: file(post) }, versionsMissed())).toEqual({ path: 'rested', shape: p });

        const c = { subject: 'channel', detail: { resolves: null, channel: null } };
        expect(await notRead({ channel: genesis.channel_id }, recordsMissed())).toEqual({ path: 'threw', shape: c });
        expect(await notRead({ channel: genesis.channel_id }, versionsMissed())).toEqual({ path: 'rested', shape: c });
        expect(await notRead({ channel: genesis.channel_id }, four([founder.record], {}, [C, D]))).toEqual({ path: 'rested', shape: c });

        const nulls = { result: null, holder: null, claim_id: null, anchor: null, coin: null, tip: null };
        expect(await notRead({ handle: 'alice' }, over(silent))).toEqual({ path: 'threw', shape: { subject: 'directory listing', detail: nulls } });
        expect(await notRead({ handle: 'alice', channelHandle: true }, over(silent))).toEqual({
            path: 'threw',
            shape: { subject: 'channel listing', detail: nulls },
        });
    });

    it('a failure the event itself shows stands though relays were silent', async () => {
        const tampered = { ...version, content: version.content.replace('Town', 'T0wn') };
        expect(await run({ file: file(tampered), json: true }, four([version, founder.record], {}, [C, D]))).toBe(1);
        expect(JSON.parse(stdout).verdict).toBe('failed');
    });

    it('with every relay answering, nothing is left unchecked', async () => {
        expect(await run({ file: file(version), json: true }, four([version, founder.record]))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.relays).toMatchObject({ asked: 4, answered: 4, floors_missed: [], below_floor: 0, silent: [] });
        expect(r.not_checked).toEqual([]);
        stdout = '';
        expect(await run({ file: file(version) }, four([version, founder.record]))).toBe(0);
        expect(stdout).toContain('VERIFIED (4 of 4 relays answered every read; every read met its floor)');
        expect(stdout).not.toContain('  relay  ');
    });

    it('by default device records are read from nostr-core’s five and versions from chat’s four; --relays sets both', () => {
        expect(relaySets()).toEqual({ relays: CHAT_RELAYS, recordRelays: DEVICE_RECORD_RELAYS });
        expect(DEVICE_RECORD_RELAYS).toEqual(DEFAULT_RELAYS);
        expect(relaySets(`${A}, ${B}`)).toEqual({ relays: [A, B], recordRelays: [A, B] });
    });

    it('device records over five relays: one silent meets their floor of 4, two do not', async () => {
        const E = 'wss://e.example';
        const versionsOn4 = (silent: string[]) => {
            const byRelay = Object.fromEntries([...FOUR, E].map((r) => [r, silent.includes(r) ? null : [version, founder.record]]));
            vi.stubGlobal('fetch', (async () => json({ keys: [HOST] })) as unknown as typeof fetch);
            return liveNet(FOUR, 'https://esplora.test/api', relaysOf(byRelay), [...FOUR, E]);
        };
        // E is asked only for device records; silent, the records read still meets 4 of 5.
        expect(await run({ file: file(version), json: true }, versionsOn4([E]))).toBe(0);
        stdout = '';
        // D silent too: the records read (3 of 5) falls below 4; the version reads (3 of 4) do not.
        expect(await run({ file: file(version), json: true }, versionsOn4([D, E]))).toBe(2);
        const r = JSON.parse(stdout);
        expect(r.relays.floors_missed).toEqual(['4 of 5']);
        expect(r.not_checked.join('\n')).toMatch(/fewer relays answering than their floor \(4 of 5\)/);
    });

    it('one relay asked: its answer is the floor, and its silence is NOT READ', async () => {
        expect(await run({ file: file(version), json: true }, over({ [A]: [version, founder.record] }))).toBe(0);
        expect(JSON.parse(stdout).relays).toMatchObject({ asked: 1, floors_missed: [], below_floor: 0 });
        stdout = '';
        expect(await run({ file: file(version), json: true }, over({ [A]: null }))).toBe(2);
    });

    it('an older copy whose binding two relays hold: NOT READ while both are silent, VERIFIED with one; held by one, silent, it FAILS', async () => {
        const held = { [B]: [founder.record], [C]: [founder.record] };
        expect(await run({ file: file(legacy), json: true }, four([], held, [B, C]))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
        stdout = '';
        expect(await run({ file: file(legacy), json: true }, four([], held, [B]))).toBe(0);
        // A binding write that reached one relay: with that relay silent, the floor is met without it.
        stdout = '';
        expect(await run({ file: file(legacy), json: true }, four([], { [B]: [founder.record] }, [B]))).toBe(1);
    });
});
