/**
 * `oc chat verify` over an injected network: a channel founded by a did:oc
 * session device, its versions and a post, served from memory. Checks what is
 * printed, what --offline says it skipped, and the exit codes.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ed25519 } from '@noble/curves/ed25519';
import {
    channelId,
    descriptorId,
    postDtag,
    postId,
    versionDtag,
    type DescriptorContent,
    type NostrEvent,
    type PostContent,
} from '@orangecheck/chat-core';
import { deriveNostrKey, generateDeviceKey, signNostrEvent } from '@orangecheck/lock-device';
import { matchFilter } from '@orangecheck/nostr-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runChatVerify, type ChatNet } from '../commands/chat';

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
            events: silent ? [] : events.filter((e) => e.kind === 30078 && e.tags.some((t) => t[0] === 'd' && t[1] === `oc-chat:device:${p}`)),
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
