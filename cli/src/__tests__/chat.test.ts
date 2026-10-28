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
    channelId,
    descriptorId,
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
import { matchFilter } from '@orangecheck/nostr-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveNet, runChatVerify, type ChatNet, type RawQuery } from '../commands/chat';

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
            answered: !silent,
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

describe('oc chat verify: relays that do not answer', () => {
    afterEach(() => vi.unstubAllGlobals());
    const A = 'wss://a.example';
    const B = 'wss://b.example';
    /** Two relays: each holds its events, or is silent (null). */
    const relaysOf =
        (byRelay: Record<string, NostrEvent[] | null>): RawQuery =>
        async (filter, relays) => {
            const seen = new Map<string, NostrEvent>();
            for (const r of relays) for (const e of byRelay[r] ?? []) if (matchFilter(e, filter as never)) seen.set(e.id, e);
            return { events: [...seen.values()], relayStatus: relays.map((r) => ({ relay: r, eose: byRelay[r] !== null })) };
        };
    const over = (byRelay: Record<string, NostrEvent[] | null>) => {
        vi.stubGlobal('fetch', (async () => json({ keys: [HOST] })) as unknown as typeof fetch);
        return liveNet([A, B], 'https://esplora.test/api', relaysOf(byRelay));
    };
    // The founder's version without its binding tag, as a version from before 0.3.0: its key is bound only by records on the relays.
    const legacy = versionBy(founder.nostrSk, founder.nostrPk, { ...genesis, title: 'Town, before 0.3.0' });

    it('names each relay that missed a read, and says how many answered, without changing the verdict', async () => {
        expect(await run({ file: file(version), json: true }, over({ [A]: [version, founder.record], [B]: null }))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.verdict).toBe('verified');
        expect(r.relays).toMatchObject({ asked: 2, answered: 1, silent: [{ relay: B }] });
        expect(r.not_checked.join('\n')).toMatch(/relay wss:\/\/b\.example did not answer \d+ of \d+ reads/);
        stdout = '';
        expect(await run({ file: file(version) }, over({ [A]: [version, founder.record], [B]: null }))).toBe(0);
        expect(stdout).toContain('VERIFIED (1 of 2 relays answered every read)');
        expect(stdout).toContain('not checked  relay wss://b.example did not answer');
    });

    it('with every relay answering, nothing is left unchecked', async () => {
        expect(await run({ file: file(version), json: true }, over({ [A]: [version, founder.record], [B]: [] }))).toBe(0);
        const r = JSON.parse(stdout);
        expect(r.relays).toMatchObject({ asked: 2, answered: 2, silent: [] });
        expect(r.not_checked).toEqual([]);
    });

    it('an older copy whose binding only a silent relay holds is NOT READ, not FAILED', async () => {
        expect(await run({ file: file(legacy), json: true }, over({ [A]: [], [B]: null }))).toBe(2);
        expect(JSON.parse(stdout).verdict).toBe('unread');
        // B answers and holds the record: it stands. Both answer and none holds it: it fails.
        stdout = '';
        expect(await run({ file: file(legacy), json: true }, over({ [A]: [], [B]: [founder.record] }))).toBe(0);
        stdout = '';
        expect(await run({ file: file(legacy), json: true }, over({ [A]: [], [B]: [] }))).toBe(1);
    });
});
