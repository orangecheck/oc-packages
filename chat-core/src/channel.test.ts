// The channel verifiers' behaviour (SPEC §8.3): descriptor authorship and the
// governance chain, close and re-open, the write gate, post authorship, feed
// order. Fixtures are signed here; the bindings are an injected oracle.

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { deriveNostrKey, signNostrEvent } from '@orangecheck/lock-device';
import { describe, expect, it } from 'vitest';

import {
    allowlistRoot,
    channelId,
    checkWritePolicy,
    descriptorDtag,
    descriptorId,
    evaluateWriteProof,
    isBitcoinAddress,
    orderChannelPosts,
    policyRootedMatches,
    postDtag,
    postId,
    resolveChannelChain,
    roleOf,
    verifyChannelPosts,
    verifyDescriptor,
    verifyPost,
    versionDtag,
    type ChainReads,
    type ChannelPost,
    type ChannelWrite,
    type DescriptorContent,
    type IsBound,
    type PostContent,
} from './channel';
import type { NostrEvent } from './event';

const deriveChatIdentity = (sk: Uint8Array) => deriveNostrKey(sk);

/** A descriptor as the reference client assembles one. */
function buildDescriptorContent(input: {
    founderAddress: string;
    founderInboxPubkey: string;
    slug: string;
    write: ChannelWrite;
    admins?: string[];
    moderators?: string[];
    title: string;
    description?: string;
    createdAt: number;
    supersedes?: string | null;
    status?: 'active' | 'closed';
    successorChannelId?: string | null;
}): DescriptorContent {
    const content: DescriptorContent = {
        v: 1,
        channel_id: channelId(input.founderAddress, input.slug),
        slug: input.slug.toLowerCase(),
        founder_address: input.founderAddress,
        founder_inbox_pubkey: input.founderInboxPubkey,
        read: 'public',
        encryption: null,
        write: input.write,
        admins: input.admins ?? [],
        moderators: input.moderators ?? [],
        title: input.title,
        description: input.description ?? '',
        avatar: null,
        rules: null,
        directory_opt_in: false,
        created_at: input.createdAt,
        supersedes: input.supersedes ?? null,
    };
    if (input.status === 'closed') content.status = 'closed';
    if (input.successorChannelId) content.successor_channel_id = input.successorChannelId;
    return content;
}

/** A kind-30110 version event, without a binding tag (a pre-0.3.0 version). */
function buildDescriptorEvent(input: { deviceSk: Uint8Array; content: DescriptorContent }): NostrEvent {
    const did = descriptorId(input.content);
    const { nostrSk, nostrPk } = deriveNostrKey(input.deviceSk);
    return signNostrEvent(
        {
            pubkey: nostrPk,
            created_at: input.content.created_at,
            kind: 30110,
            tags: [
                ['d', versionDtag(did)],
                ['t', input.content.channel_id],
                ...(input.content.supersedes ? [['s', input.content.supersedes]] : []),
                ['descriptor_id', did],
            ],
            content: JSON.stringify(input.content),
        },
        nostrSk
    );
}

/** A kind-30111 post event. */
function buildPostEvent(input: {
    deviceSk: Uint8Array;
    content: PostContent;
    createdAt: number;
    controlSig?: string;
}): NostrEvent {
    const pid = postId(input.content);
    const { nostrSk, nostrPk } = deriveNostrKey(input.deviceSk);
    const tags = [
        ['d', postDtag(input.content.channel_id, pid)],
        ['t', input.content.channel_id],
        ['post_id', pid],
    ];
    if (input.controlSig) tags.push(['control_sig', input.controlSig]);
    return signNostrEvent(
        { pubkey: nostrPk, created_at: input.createdAt, kind: 30111, tags, content: JSON.stringify(input.content) },
        nostrSk
    );
}

/** These versions carry no binding tag, so liveness and the host keys are never asked. */
const unasked = async (): Promise<never> => {
    throw new Error('not asked for a version without a binding tag');
};
function resolveChain(events: NostrEvent[], cid: string, o: { isBound: IsBound }) {
    const reads: ChainReads = { liveness: unasked, hostKeys: unasked, verifyBip322: unasked, ...o };
    return resolveChannelChain(events, cid, reads);
}
/** The on-chain check, for a test that must not reach it. */
const unreached = async (): Promise<boolean> => {
    throw new Error('the on-chain check was reached');
};

/**
 * The channel derivations MUST match the normative spec vectors oc-chat-protocol
 * vc14 (descriptor id + d-tag + policy-rooted match), vc15 (governance hash-
 * chain supersession), vc16 (public post id + recipient-exclusion), vc17
 * (height-anchored UTXO write-proof arithmetic) — otherwise a publisher and a
 * verifier disagree on the id/d-tag and a channel silently won't resolve.
 *
 * Authorship/governance uses the device-record binding model (an inbox key bound
 * to an address via the kind-30078 record), NOT a per-edit BIP-322 ceremony — so
 * the verify/chain tests inject an `isBound` oracle.
 */

const FOUNDER = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const ADMIN2 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const STRANGER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const FOUNDER_INBOX = 'abd5c03b14d458675ee19c6da072374fddd7a77c09cf083197f018aa58613f17';
const CHANNEL_ID = '96199b4355ca664a461d1e7bd466e58ae9697309ebc876970dd648475ea84639';

const UTXO_FLOOR: ChannelWrite = {
    policy: 'utxo-floor',
    utxo_floor_confs: 144,
    utxo_floor_sats: 0,
    allowlist_root: null,
    rooted: true,
};

// vc14 descriptor (genesis), byte-for-byte (fixed founder_inbox_pubkey).
const DESC_V1: DescriptorContent = {
    v: 1,
    channel_id: CHANNEL_ID,
    slug: 'bitcoin-talk',
    founder_address: FOUNDER,
    founder_inbox_pubkey: FOUNDER_INBOX,
    read: 'public',
    encryption: null,
    write: UTXO_FLOOR,
    admins: [FOUNDER],
    moderators: [],
    title: 'Bitcoin Talk',
    description: 'a public channel',
    avatar: null,
    rules: null,
    directory_opt_in: false,
    created_at: 1733600000,
    supersedes: null,
};

// vc15 descriptor (adds an admin, supersedes v1).
const DESC_V2: DescriptorContent = {
    ...DESC_V1,
    admins: [FOUNDER, ADMIN2],
    created_at: 1733686400,
    supersedes: '9aa4bb9b5064ac12d982729696f087cdc192b1d85b5909d652095798004a7436',
};

// vc16 public post, byte-for-byte (note: NO created_at — that's event-level).
const POST: PostContent = {
    v: 1,
    kind: 'chat-channel',
    channel_id: CHANNEL_ID,
    author_address: FOUNDER,
    author_inbox_pubkey: FOUNDER_INBOX,
    body: 'gm — sats as signal',
    seq: 0,
    parent_id: null,
    write_proof: {
        outpoint: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90:0',
        value_sats: 50000,
        anchor_block_height: 800000,
        anchor_block_hash: '00000000000000000002a7c4c1e48d76c5a37902165a270156b7a8d72728a054',
    },
};

const yes = async () => true;
const no = async () => false;

// ── Verify/governance fixtures: descriptors whose founder_inbox_pubkey is the
//    REAL derived pubkey of a test device, so event.pubkey checks line up. ──
const FOUNDER_DEVICE = new Uint8Array(32).fill(7);
const ADMIN_DEVICE = new Uint8Array(32).fill(11);
const founderInbox = deriveChatIdentity(FOUNDER_DEVICE).nostrPk;
const adminInbox = deriveChatIdentity(ADMIN_DEVICE).nostrPk;

const vDescV1 = buildDescriptorContent({
    founderAddress: FOUNDER,
    founderInboxPubkey: founderInbox,
    slug: 'bitcoin-talk',
    write: UTXO_FLOOR,
    admins: [FOUNDER],
    title: 'Bitcoin Talk',
    description: 'a public channel',
    createdAt: 1733600000,
});
const vEvV1 = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: vDescV1 });
const vDescV2 = buildDescriptorContent({
    founderAddress: FOUNDER,
    founderInboxPubkey: founderInbox,
    slug: 'bitcoin-talk',
    write: UTXO_FLOOR,
    admins: [FOUNDER, ADMIN2],
    title: 'Bitcoin Talk',
    description: 'a public channel',
    createdAt: 1733686400,
    supersedes: descriptorId(vDescV1),
});
const vEvV2Founder = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: vDescV2 });
const vEvV2Admin = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: vDescV2 });

// A realistic binding oracle: founderInbox→FOUNDER, adminInbox→ADMIN2.
const boundReal = async (pk: string, addr: string) =>
    (pk === founderInbox && addr === FOUNDER) || (pk === adminInbox && addr === ADMIN2);

describe('channels — descriptor identity (vc14, §8.3.1)', () => {
    it('reproduces channel_id from founder ‖ slug', () => {
        expect(channelId(FOUNDER, 'bitcoin-talk')).toBe(CHANNEL_ID);
    });

    it('reproduces the descriptor d-tag (salted channel_id hash)', () => {
        expect(descriptorDtag(CHANNEL_ID)).toBe(
            'oc-lock-chat-ch:pk_FAUvDJcFl86Od6ZbSMDD0TZmy00fLWbuqMxMh8sU'
        );
    });

    it('reproduces the content-addressed descriptor_id', () => {
        expect(descriptorId(DESC_V1)).toBe(
            '9aa4bb9b5064ac12d982729696f087cdc192b1d85b5909d652095798004a7436'
        );
    });

    it('asserts the utxo-floor ⇒ rooted:true policy match', () => {
        expect(policyRootedMatches(UTXO_FLOOR)).toBe(true);
        expect(policyRootedMatches({ ...UTXO_FLOOR, rooted: false })).toBe(false);
        expect(policyRootedMatches({ ...UTXO_FLOOR, policy: 'open', rooted: true })).toBe(false);
        expect(policyRootedMatches({ ...UTXO_FLOOR, policy: 'open', rooted: false })).toBe(true);
    });
});

describe('channels — governance hash-chain ids (vc15, §8.3.1)', () => {
    it('a supersede is a distinct id at the SAME d-tag, chained to v1', () => {
        expect(descriptorId(DESC_V2)).toBe(
            'ac9c802d12e242429f3116701367f927ba238a62f15a0018aea24e43c0fd28aa'
        );
        expect(DESC_V2.supersedes).toBe(descriptorId(DESC_V1));
        expect(descriptorId(DESC_V2)).not.toBe(descriptorId(DESC_V1));
        expect(descriptorDtag(DESC_V2.channel_id)).toBe(descriptorDtag(DESC_V1.channel_id));
    });
});

describe('channels — verifyDescriptor (device-record binding, §8.3.1)', () => {
    it('accepts a genesis signed by the founder inbox key, bound to the address', async () => {
        const r = await verifyDescriptor(vDescV1, vEvV1, { isBound: yes });
        expect(r).toMatchObject({ ok: true, channelId: CHANNEL_ID, signerAddress: FOUNDER });
    });

    it('rejects a genesis whose event pubkey ≠ founder_inbox_pubkey', async () => {
        const ev = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: vDescV1 });
        const r = await verifyDescriptor(vDescV1, ev, { isBound: yes });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects a genesis whose inbox key is NOT device-bound to the founder', async () => {
        const r = await verifyDescriptor(vDescV1, vEvV1, { isBound: no });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects an allowlist descriptor as unsupported (the v1 public-only client cannot resolve the writer set, so it would silently drop every post)', async () => {
        const allowlistDesc = {
            ...vDescV1,
            write: {
                policy: 'allowlist',
                utxo_floor_confs: 0,
                utxo_floor_sats: 0,
                allowlist_root: 'aa'.repeat(32),
                rooted: false,
            },
        } as DescriptorContent;
        const r = await verifyDescriptor(allowlistDesc, vEvV1, { isBound: yes });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNSUPPORTED' });
    });

    it('accepts a supersede signed by a PRIOR-epoch admin (the founder)', async () => {
        const r = await verifyDescriptor(vDescV2, vEvV2Founder, {
            priorEpoch: vDescV1,
            isBound: boundReal,
        });
        expect(r).toMatchObject({ ok: true, signerAddress: FOUNDER });
    });

    it('rejects a supersede by a signer NOT in the prior epoch', async () => {
        // ADMIN2 is added BY v2, so adminInbox→ADMIN2 is not authorized by v1.
        const r = await verifyDescriptor(vDescV2, vEvV2Admin, {
            priorEpoch: vDescV1,
            isBound: boundReal,
        });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects a supersede that mutates founder_inbox_pubkey (trust-root swap)', async () => {
        // prior = v2 (ADMIN2 is a real admin). An admin-signed edit that redirects
        // the channel's trust-root key to the admin's own device is unauthorized.
        const v3 = buildDescriptorContent({
            founderAddress: FOUNDER,
            founderInboxPubkey: adminInbox, // ← mutated trust root
            slug: 'bitcoin-talk',
            write: UTXO_FLOOR,
            admins: [FOUNDER, ADMIN2],
            title: 'Bitcoin Talk',
            createdAt: 1733700000,
            supersedes: descriptorId(vDescV2),
        });
        const ev = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: v3 });
        const r = await verifyDescriptor(v3, ev, { priorEpoch: vDescV2, isBound: boundReal });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects an ADMIN-signed supersede that removes a prior admin (no coup)', async () => {
        // prior = v2 (admins [FOUNDER, ADMIN2]); an admin-signed edit dropping the
        // founder (or any prior admin) from the roster is a governance coup.
        const v3 = buildDescriptorContent({
            founderAddress: FOUNDER,
            founderInboxPubkey: founderInbox,
            slug: 'bitcoin-talk',
            write: UTXO_FLOOR,
            admins: [ADMIN2], // dropped FOUNDER
            title: 'Bitcoin Talk',
            createdAt: 1733700000,
            supersedes: descriptorId(vDescV2),
        });
        const ev = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: v3 });
        const r = await verifyDescriptor(v3, ev, { priorEpoch: vDescV2, isBound: boundReal });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('a FOUNDER-signed supersede MAY shrink the admin set', async () => {
        const v3 = buildDescriptorContent({
            founderAddress: FOUNDER,
            founderInboxPubkey: founderInbox,
            slug: 'bitcoin-talk',
            write: UTXO_FLOOR,
            admins: [FOUNDER], // founder removes ADMIN2 — allowed (trust root)
            title: 'Bitcoin Talk',
            createdAt: 1733700000,
            supersedes: descriptorId(vDescV2),
        });
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: v3 });
        const r = await verifyDescriptor(v3, ev, { priorEpoch: vDescV2, isBound: boundReal });
        expect(r).toMatchObject({ ok: true, signerAddress: FOUNDER });
    });

    it('rejects a broken supersede link', async () => {
        const broken = { ...vDescV2, supersedes: 'deadbeef' };
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: broken });
        const r = await verifyDescriptor(broken, ev, { priorEpoch: vDescV1, isBound: boundReal });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects a private (v2-reserved) descriptor as unsupported', async () => {
        const priv = { ...vDescV1, read: 'members' } as unknown as DescriptorContent;
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: priv });
        const r = await verifyDescriptor(priv, ev, { isBound: yes });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNSUPPORTED' });
    });

    it('rejects a policy/rooted mismatch', async () => {
        const bad = { ...vDescV1, write: { ...UTXO_FLOOR, rooted: false } };
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: bad });
        const r = await verifyDescriptor(bad, ev, { isBound: yes });
        expect(r).toEqual({ ok: false, error: 'E_CH_POLICY_INVALID' });
    });

    it('rejects a tampered event (content no longer hashes to the descriptor)', async () => {
        const tampered = { ...vEvV1, content: JSON.stringify({ ...vDescV1, title: 'Hijacked' }) };
        const r = await verifyDescriptor(vDescV1, tampered, { isBound: yes });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });
});

describe('channels — close/retire (§8.3.8)', () => {
    // A close: a founder-signed supersede of vDescV2 that flips status → closed.
    const closed = buildDescriptorContent({
        founderAddress: FOUNDER,
        founderInboxPubkey: founderInbox,
        slug: 'bitcoin-talk',
        write: UTXO_FLOOR,
        admins: [FOUNDER, ADMIN2],
        title: 'Bitcoin Talk',
        description: 'a public channel',
        createdAt: 1733700000,
        supersedes: descriptorId(vDescV2),
        status: 'closed',
    });

    it('omits status when active (byte-compat) and carries it only when closed', () => {
        expect('status' in vDescV1).toBe(false);
        expect(closed.status).toBe('closed');
    });

    it('the founder may close the channel (status → closed)', async () => {
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: closed });
        const r = await verifyDescriptor(closed, ev, { priorEpoch: vDescV2, isBound: boundReal });
        expect(r.ok).toBe(true);
    });

    it('an ADMIN cannot close the channel — status change is founder-only (no coup)', async () => {
        const ev = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: closed });
        const r = await verifyDescriptor(closed, ev, { priorEpoch: vDescV2, isBound: boundReal });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('a closed channel is read-only — a new post is denied E_CH_CLOSED', async () => {
        const closedDesc = { ...DESC_V1, status: 'closed' } as DescriptorContent;
        const r = await checkWritePolicy(POST, closedDesc, { tipHeight: 800200, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CH_CLOSED' });
    });

    it('a closed channel still accepts a removal tombstone (moderation survives close)', async () => {
        const closedDesc = { ...DESC_V1, status: 'closed' } as DescriptorContent;
        const tombstone: PostContent = {
            v: 1,
            kind: 'chat-channel',
            channel_id: CHANNEL_ID,
            author_address: FOUNDER,
            author_inbox_pubkey: FOUNDER_INBOX,
            body: '',
            seq: 0,
            parent_id: null,
            removes: 'deadbeef',
        };
        const r = await checkWritePolicy(tombstone, closedDesc, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r.ok).toBe(true);
    });

    it('the founder may re-open a closed channel (status → active)', async () => {
        const reopened = buildDescriptorContent({
            founderAddress: FOUNDER,
            founderInboxPubkey: founderInbox,
            slug: 'bitcoin-talk',
            write: UTXO_FLOOR,
            admins: [FOUNDER, ADMIN2],
            title: 'Bitcoin Talk',
            description: 'a public channel',
            createdAt: 1733800000,
            supersedes: descriptorId(closed),
            status: 'active',
        });
        const ev = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: reopened });
        const r = await verifyDescriptor(reopened, ev, { priorEpoch: closed, isBound: boundReal });
        expect(r.ok).toBe(true);
    });
});

describe('channels — public post (vc16, §8.3.2 + §3)', () => {
    it('reproduces the content-addressed post_id (em-dash is UTF-8, not escaped)', () => {
        expect(postId(POST)).toBe(
            '2131724a5289867d5e75beac355d1480c2ff57a0d35be09a06a1040283592f50'
        );
    });

    it('reproduces the post d-tag', () => {
        expect(postDtag(CHANNEL_ID, postId(POST))).toBe(
            'oc-lock-chat-msg:gwZmxajXlg1Ql24vEPgGBRn3fozcsAcyGOTvmBdbcm4'
        );
    });

    it('commits a public attachment to post_id (content-addressed, tamper-evident)', () => {
        const withAtt: PostContent = {
            ...POST,
            attachment: { name: 'a.png', type: 'image/png', size: 3, data: 'AAAA' },
        };
        expect(postId(withAtt)).toMatch(/^[0-9a-f]{64}$/);
        // adding (or changing) the attachment yields a different id
        expect(postId(withAtt)).not.toBe(postId(POST));
    });

    it('rejects a chat-channel post carrying a non-empty recipients[] (E_CHANNEL_RECIPIENTS)', async () => {
        const r = await verifyPost(POST, DESC_V1, {
            tipHeight: 800200,
            recipients: [{ address: FOUNDER }],
            verifyBip322: unreached,
            verifyOnChain: unreached,
        });
        expect(r).toEqual({ ok: false, error: 'E_CHANNEL_RECIPIENTS' });
    });
});

describe('channels — height-anchored UTXO write-proof (vc17, §8.3.3)', () => {
    const policy = { utxo_floor_confs: 144, utxo_floor_sats: 10000 };
    const TIP = 800200;

    it('accepts a clearing proof (age + value)', () => {
        const v = evaluateWriteProof(
            { value_sats: 50000, anchor_block_height: 800000 },
            policy,
            TIP
        );
        expect(v).toMatchObject({
            ageConfs: 201,
            meetsAge: true,
            meetsValue: true,
            verdict: 'accept',
        });
    });

    it('rejects a too-young UTXO (E_CHAN_FLOOR)', () => {
        const v = evaluateWriteProof(
            { value_sats: 50000, anchor_block_height: 800180 },
            policy,
            TIP
        );
        expect(v).toMatchObject({ ageConfs: 21, meetsAge: false, verdict: 'E_CHAN_FLOOR' });
    });

    it('rejects a below-value UTXO even when aged (E_CHAN_FLOOR)', () => {
        const v = evaluateWriteProof(
            { value_sats: 5000, anchor_block_height: 800000 },
            policy,
            TIP
        );
        expect(v).toMatchObject({
            ageConfs: 201,
            meetsAge: true,
            meetsValue: false,
            verdict: 'E_CHAN_FLOOR',
        });
    });
});

// The write-policy GATE (non-authoritative — author auth is verifyPost's job).
describe('channels — write policy gate (checkWritePolicy §8.3.3)', () => {
    it('a stranger with a clearing proof + valid control_sig + a REAL on-chain coin may post under utxo-floor', async () => {
        const member: PostContent = { ...POST, author_address: STRANGER };
        const r = await checkWritePolicy(member, DESC_V1, {
            tipHeight: 800200,
            controlSig: 'sig',
            verifyBip322: yes,
            verifyOnChain: async () => true, // the claimed coin exists, unspent, owned
        });
        expect(r.ok).toBe(true);
    });

    it('a FORGED proof (numbers not backed by a real coin) is denied even with a valid control_sig', async () => {
        // The Bitcoin-load-bearing leg: control_sig proves address control, but the
        // claimed value/age must be REAL chain state. A coin that isn't there fails.
        const member: PostContent = { ...POST, author_address: STRANGER };
        const r = await checkWritePolicy(member, DESC_V1, {
            tipHeight: 800200,
            controlSig: 'sig',
            verifyBip322: yes,
            verifyOnChain: async () => false, // no matching unspent UTXO on chain
        });
        expect(r).toEqual({ ok: false, error: 'E_CHAN_FLOOR' });
    });

    it('the founder bypasses the write gate (role trust root)', async () => {
        const r = await checkWritePolicy(POST, DESC_V1, { tipHeight: 800200, verifyBip322: yes, verifyOnChain: unreached });
        expect(r.ok).toBe(true);
    });

    it('a member with no write_proof is denied (E_CHAN_FLOOR)', async () => {
        const member: PostContent = { ...POST, author_address: STRANGER, write_proof: undefined };
        const r = await checkWritePolicy(member, DESC_V1, { tipHeight: 800200, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CHAN_FLOOR' });
    });

    it('a too-young proof is denied (E_CHAN_FLOOR)', async () => {
        const member: PostContent = {
            ...POST,
            author_address: STRANGER,
            write_proof: { ...POST.write_proof!, anchor_block_height: 800180 },
        };
        const r = await checkWritePolicy(member, DESC_V1, {
            tipHeight: 800200,
            controlSig: 'sig',
            verifyBip322: yes, verifyOnChain: unreached,
        });
        expect(r).toEqual({ ok: false, error: 'E_CHAN_FLOOR' });
    });

    it('a founder-policy channel denies a non-roster writer (E_CH_NOT_WRITER)', async () => {
        const founderOnly: DescriptorContent = {
            ...DESC_V1,
            write: {
                policy: 'founder',
                utxo_floor_confs: 0,
                utxo_floor_sats: 0,
                allowlist_root: null,
                rooted: false,
            },
        };
        const member: PostContent = { ...POST, author_address: STRANGER, write_proof: undefined };
        const r = await checkWritePolicy(member, founderOnly, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CH_NOT_WRITER' });
    });

    it('a non chat-channel kind is E_CH_WRITE_DENIED (distinct from recipient-exclusion)', async () => {
        const wrongKind = { ...POST, kind: 'chat' } as unknown as PostContent;
        const r = await checkWritePolicy(wrongKind, DESC_V1, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CH_WRITE_DENIED' });
    });

    it('a moderation tombstone by a roster admin removes a post (§8.3.5)', async () => {
        const tombstone: PostContent = {
            v: 1,
            kind: 'chat-channel',
            channel_id: CHANNEL_ID,
            author_address: FOUNDER,
            author_inbox_pubkey: FOUNDER_INBOX,
            body: '',
            seq: 1,
            parent_id: null,
            removes: postId(POST),
        };
        const r = await checkWritePolicy(tombstone, DESC_V1, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toMatchObject({ ok: true, role: 'founder', isTombstone: true });
    });

    it('a removal by a roster admin counts whatever its body says (§8.3.5)', async () => {
        const removal: PostContent = {
            v: 1,
            kind: 'chat-channel',
            channel_id: CHANNEL_ID,
            author_address: FOUNDER,
            author_inbox_pubkey: FOUNDER_INBOX,
            body: 'Removed: spam.',
            seq: 1,
            parent_id: null,
            removes: postId(POST),
        };
        const r = await checkWritePolicy(removal, DESC_V1, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toMatchObject({ ok: true, role: 'founder', isTombstone: true });
        const stranger = { ...removal, author_address: STRANGER };
        expect(await checkWritePolicy(stranger, DESC_V1, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached })).toEqual({
            ok: false,
            error: 'E_CH_UNAUTHORIZED',
        });
    });

    it('a tombstone by a non-roster signer is E_CH_UNAUTHORIZED', async () => {
        const tombstone: PostContent = {
            v: 1,
            kind: 'chat-channel',
            channel_id: CHANNEL_ID,
            author_address: STRANGER,
            author_inbox_pubkey: FOUNDER_INBOX,
            body: '',
            seq: 1,
            parent_id: null,
            removes: postId(POST),
        };
        const r = await checkWritePolicy(tombstone, DESC_V1, { tipHeight: 0, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });
});

// AUTHORITATIVE verifyPost: the author device sig + kind-30078 binding are
// MANDATORY — there is no unauthenticated accept path.
describe('channels — verifyPost authorship is mandatory (§8.3.2)', () => {
    const POST_DEVICE = new Uint8Array(32).fill(13);
    const postInbox = deriveChatIdentity(POST_DEVICE).nostrPk;
    const authedPost: PostContent = {
        ...POST,
        author_address: FOUNDER,
        author_inbox_pubkey: postInbox,
    };
    const authedEvent = buildPostEvent({
        deviceSk: POST_DEVICE,
        content: authedPost,
        createdAt: 1733700000,
    });

    it('rejects a post with NO event (cannot authenticate the author)', async () => {
        const r = await verifyPost(authedPost, DESC_V1, { tipHeight: 800200, verifyBip322: yes, verifyOnChain: unreached });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('accepts an authenticated founder post (event sig + device binding)', async () => {
        const r = await verifyPost(authedPost, DESC_V1, {
            tipHeight: 800200,
            event: authedEvent,
            isBound: yes,
            verifyBip322: yes, verifyOnChain: unreached,
        });
        expect(r).toMatchObject({ ok: true, role: 'founder' });
    });

    it('rejects a post whose event pubkey ≠ author_inbox_pubkey (spoofed author)', async () => {
        const wrongSigner = buildPostEvent({
            deviceSk: new Uint8Array(32).fill(99),
            content: authedPost,
            createdAt: 1733700000,
        });
        const r = await verifyPost(authedPost, DESC_V1, {
            tipHeight: 800200,
            event: wrongSigner,
            isBound: yes,
            verifyBip322: yes, verifyOnChain: unreached,
        });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('rejects when the inbox key is NOT device-bound to author_address', async () => {
        const r = await verifyPost(authedPost, DESC_V1, {
            tipHeight: 800200,
            event: authedEvent,
            isBound: no,
            verifyBip322: yes, verifyOnChain: unreached,
        });
        expect(r).toEqual({ ok: false, error: 'E_CH_UNAUTHORIZED' });
    });

    it('still applies recipient-exclusion before the auth requirement', async () => {
        const r = await verifyPost(authedPost, DESC_V1, {
            tipHeight: 800200,
            recipients: [{ address: FOUNDER }],
            verifyBip322: unreached,
            verifyOnChain: unreached,
        });
        expect(r).toEqual({ ok: false, error: 'E_CHANNEL_RECIPIENTS' });
    });
});

describe('channels — roles, allowlist root, address shape', () => {
    it('roleOf resolves founder / admin / moderator / member', () => {
        const d: DescriptorContent = { ...DESC_V1, admins: [FOUNDER, ADMIN2], moderators: ['m'] };
        expect(roleOf(FOUNDER, d)).toBe('founder');
        expect(roleOf(ADMIN2, d)).toBe('admin');
        expect(roleOf('m', d)).toBe('moderator');
        expect(roleOf('nobody', d)).toBe('member');
    });

    it('allowlistRoot is order-independent + dedup-stable', () => {
        expect(allowlistRoot([FOUNDER, ADMIN2])).toBe(allowlistRoot([ADMIN2, FOUNDER, FOUNDER]));
    });

    it('isBitcoinAddress accepts bech32/base58, rejects did:oc', () => {
        expect(isBitcoinAddress(FOUNDER)).toBe(true);
        expect(isBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
        expect(isBitcoinAddress('did:oc:351d9e47fc5bc8d667900a0b1ecf296f')).toBe(false);
    });
});

describe('channels — governance chain resolution (resolveChannelChain)', () => {
    it('walks genesis → supersede and returns the freshest valid tip (epochs=2)', async () => {
        const res = await resolveChain([vEvV1, vEvV2Founder], vDescV1.channel_id, {
            isBound: boundReal,
        });
        expect(res?.descriptorId).toBe(descriptorId(vDescV2));
        expect(res?.epochs).toBe(2);
    });

    it('falls back to the genesis when the supersede fails authorization', async () => {
        const res = await resolveChain([vEvV1, vEvV2Admin], vDescV1.channel_id, {
            isBound: boundReal,
        });
        expect(res?.descriptorId).toBe(descriptorId(vDescV1));
        expect(res?.epochs).toBe(1);
    });

    it('ignores a valid chain for a different channel_id under the same d-tag', async () => {
        // STRANGER founds their own channel and grows a longer valid chain.
        const sDesc = (admins: string[], createdAt: number, supersedes: string | null) =>
            buildDescriptorContent({
                founderAddress: ADMIN2,
                founderInboxPubkey: adminInbox,
                slug: 'bitcoin-talk',
                write: UTXO_FLOOR,
                admins,
                title: 'Other',
                description: 'another channel',
                createdAt,
                ...(supersedes ? { supersedes } : {}),
            });
        const s1 = sDesc([ADMIN2], 1733600000, null);
        const s2 = sDesc([ADMIN2, STRANGER], 1733600100, descriptorId(s1));
        const s3 = sDesc([ADMIN2], 1733600200, descriptorId(s2));
        const others = [s1, s2, s3].map((content) =>
            buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content })
        );
        const res = await resolveChain([vEvV1, ...others], vDescV1.channel_id, {
            isBound: boundReal,
        });
        expect(res?.descriptor.channel_id).toBe(vDescV1.channel_id);
        expect(res?.descriptorId).toBe(descriptorId(vDescV1));
        // …and the other channel still resolves under its own id.
        const own = await resolveChain(others, s1.channel_id, { isBound: boundReal });
        expect(own?.epochs).toBe(3);
    });

    it('a branch the founder did not sign loses at a fork the founder did sign, however long', async () => {
        const at = (admins: string[], createdAt: number, supersedes: DescriptorContent) =>
            buildDescriptorContent({
                founderAddress: FOUNDER,
                founderInboxPubkey: founderInbox,
                slug: 'bitcoin-talk',
                write: UTXO_FLOOR,
                admins,
                title: 'Bitcoin Talk',
                description: 'a public channel',
                createdAt,
                supersedes: descriptorId(supersedes),
            });
        // v2 (founder) made ADMIN2 an admin. The founder then removes ADMIN2 (v3).
        const removed = at([FOUNDER], 1733700000, vDescV2);
        // ADMIN2 forks from v2, where it was still an admin, and grows a longer branch.
        const fork1 = { ...at([FOUNDER, ADMIN2], 1733700100, vDescV2), title: 'Taken' };
        const fork2 = { ...at([FOUNDER, ADMIN2], 1733700200, fork1), title: 'Taken' };
        const events = [
            vEvV1,
            vEvV2Founder,
            buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: removed }),
            buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: fork1 }),
            buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: fork2 }),
        ];
        const res = await resolveChain(events, vDescV1.channel_id, { isBound: boundReal });
        expect(res?.descriptorId).toBe(descriptorId(removed));
        expect(res?.descriptor.admins).toEqual([FOUNDER]);
    });

    it('returns null when nothing validates', async () => {
        const res = await resolveChain([vEvV1], vDescV1.channel_id, { isBound: no });
        expect(res).toBeNull();
    });

    // Anyone can put a descriptor's exact content under their own key: the
    // descriptor_id is the same, only the event's pubkey and date differ.
    const STRANGER_SK = new Uint8Array(32).fill(44);
    const resign = (ev: NostrEvent, sk: Uint8Array, createdAt: number): NostrEvent => {
        const pubkey = bytesToHex(schnorr.getPublicKey(sk));
        const body = JSON.stringify([0, pubkey, createdAt, ev.kind, ev.tags, ev.content]);
        const id = bytesToHex(sha256(new TextEncoder().encode(body)));
        return { ...ev, pubkey, created_at: createdAt, id, sig: bytesToHex(schnorr.sign(id, sk)) };
    };
    // v3: the founder closes the channel and drops ADMIN2.
    const vDescV3Closed = buildDescriptorContent({
        founderAddress: FOUNDER,
        founderInboxPubkey: founderInbox,
        slug: 'bitcoin-talk',
        write: UTXO_FLOOR,
        admins: [FOUNDER],
        title: 'Bitcoin Talk',
        description: 'a public channel',
        createdAt: 1733700000,
        supersedes: descriptorId(vDescV2),
        status: 'closed',
    });
    const vEvV3Closed = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: vDescV3Closed });

    it("a stranger's copy of the latest descriptor does not roll the channel back", async () => {
        const copy = resign(vEvV3Closed, STRANGER_SK, vEvV3Closed.created_at - 1);
        for (const order of [
            [vEvV1, vEvV2Founder, vEvV3Closed, copy],
            [vEvV1, vEvV2Founder, copy, vEvV3Closed],
        ]) {
            const res = await resolveChain(order, vDescV1.channel_id, {
                isBound: boundReal,
            });
            expect(res?.descriptorId).toBe(descriptorId(vDescV3Closed));
            expect(res?.epochs).toBe(3);
            expect(res?.descriptor.status).toBe('closed');
            expect(res?.descriptor.admins).toEqual([FOUNDER]);
        }
    });

    it("a stranger's copy of the genesis does not make the channel vanish", async () => {
        const copy = resign(vEvV1, STRANGER_SK, vEvV1.created_at - 1);
        for (const order of [
            [vEvV1, copy],
            [copy, vEvV1],
        ]) {
            const res = await resolveChain(order, vDescV1.channel_id, {
                isBound: boundReal,
            });
            expect(res?.descriptorId).toBe(descriptorId(vDescV1));
            expect(res?.epochs).toBe(1);
        }
    });

    it("a stranger's re-dated copy does not decide between two admin branches", async () => {
        // ADMIN2 (an admin since v2) forks v2 twice; the founder signs neither, so
        // the fresher branch wins. A stranger's copy of the older one, dated far
        // ahead, must not change that.
        const branch = (title: string, createdAt: number) =>
            buildDescriptorContent({
                founderAddress: FOUNDER,
                founderInboxPubkey: founderInbox,
                slug: 'bitcoin-talk',
                write: UTXO_FLOOR,
                admins: [FOUNDER, ADMIN2],
                title,
                description: 'a public channel',
                createdAt,
                supersedes: descriptorId(vDescV2),
            });
        const older = buildDescriptorEvent({
            deviceSk: ADMIN_DEVICE,
            content: branch('A', 1733700100),
        });
        const fresher = buildDescriptorEvent({
            deviceSk: ADMIN_DEVICE,
            content: branch('B', 1733700200),
        });
        const events = [
            vEvV1,
            vEvV2Founder,
            older,
            fresher,
            resign(older, STRANGER_SK, 1999999999),
        ];
        const res = await resolveChain(events, vDescV1.channel_id, { isBound: boundReal });
        expect(res?.descriptor.title).toBe('B');
    });

    it("an admin's copy of a founder-signed epoch keeps it the founder's at a fork", async () => {
        // The founder retitles (v3). ADMIN2 re-signs that same v3, which admin
        // rules also allow, and forks a longer branch from v2. v3 is still the
        // founder's decision, so the fork is overruled.
        const v3 = buildDescriptorContent({
            founderAddress: FOUNDER,
            founderInboxPubkey: founderInbox,
            slug: 'bitcoin-talk',
            write: UTXO_FLOOR,
            admins: [FOUNDER, ADMIN2],
            title: 'Founder title',
            description: 'a public channel',
            createdAt: 1733700000,
            supersedes: descriptorId(vDescV2),
        });
        const fork1 = { ...v3, title: 'Taken', created_at: 1733700100 };
        const fork2 = {
            ...fork1,
            created_at: 1733700200,
            supersedes: descriptorId(fork1),
        };
        const founderV3 = buildDescriptorEvent({ deviceSk: FOUNDER_DEVICE, content: v3 });
        const adminV3 = buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: v3 });
        for (const copies of [
            [adminV3, founderV3],
            [founderV3, adminV3],
        ]) {
            const events = [
                vEvV1,
                vEvV2Founder,
                ...copies,
                buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: fork1 }),
                buildDescriptorEvent({ deviceSk: ADMIN_DEVICE, content: fork2 }),
            ];
            const res = await resolveChain(events, vDescV1.channel_id, {
                isBound: boundReal,
            });
            expect(res?.descriptor.title).toBe('Founder title');
        }
    });
});


describe('channels — deterministic feed order (orderChannelPosts)', () => {
    const mk = (createdAt: number, pid: string): ChannelPost =>
        ({
            post: POST,
            postId: pid,
            event: { created_at: createdAt } as ChannelPost['event'],
        }) as ChannelPost;

    it('orders by created_at, then by content-addressed post_id (stable across clients)', () => {
        const a = mk(100, 'ffff');
        const b = mk(50, 'bbbb');
        const c = mk(100, 'aaaa'); // same time as a → post_id tiebreak puts c before a
        const ordered = orderChannelPosts([a, b, c]).map((p) => p.postId);
        expect(ordered).toEqual(['bbbb', 'aaaa', 'ffff']);
    });
});


describe('channels — a feed of posts (verifyChannelPosts, §8.3.2, §8.3.5)', () => {
    const open: DescriptorContent = { ...vDescV1, write: { ...UTXO_FLOOR, policy: 'open', rooted: false } };
    const STRANGER_DEVICE = new Uint8Array(32).fill(13);
    const strangerInbox = deriveChatIdentity(STRANGER_DEVICE).nostrPk;
    const bound: IsBound = async (pk, addr) =>
        (await boundReal(pk, addr)) || (pk === strangerInbox && addr === STRANGER);
    const post = (body: string, extra: Partial<PostContent> = {}): PostContent => ({
        v: 1,
        kind: 'chat-channel',
        channel_id: open.channel_id,
        author_address: STRANGER,
        author_inbox_pubkey: strangerInbox,
        body,
        seq: 0,
        parent_id: null,
        ...extra,
    });
    const feed = (events: NostrEvent[], d: DescriptorContent = open) =>
        verifyChannelPosts(events, d, { tipHeight: 0, isBound: bound, verifyBip322: unreached, verifyOnChain: unreached });

    it('keeps posts that verify, in feed order, and drops the rest', async () => {
        const a = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('a'), createdAt: 200 });
        const b = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('b'), createdAt: 100 });
        // Signed by a key not bound to the author it names.
        const spoof = buildPostEvent({ deviceSk: ADMIN_DEVICE, content: { ...post('c'), author_inbox_pubkey: adminInbox }, createdAt: 150 });
        const elsewhere = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('d', { channel_id: 'e'.repeat(64) }), createdAt: 120 });
        const got = await feed([a, b, spoof, elsewhere]);
        expect(got.map((p) => p.post.body)).toEqual(['b', 'a']);
    });

    it('a removal by a roster admin takes the post out; one by a stranger does not', async () => {
        const target = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('spam'), createdAt: 100 });
        const pid = postId(post('spam'));
        const byFounder = buildPostEvent({
            deviceSk: FOUNDER_DEVICE,
            content: { ...post(''), author_address: FOUNDER, author_inbox_pubkey: founderInbox, removes: pid },
            createdAt: 110,
        });
        const byStranger = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('', { removes: pid }), createdAt: 110 });
        expect(await feed([target, byStranger])).toHaveLength(1);
        expect(await feed([target, byFounder])).toHaveLength(0);
    });

    it('two copies of one post count once, at the lower created_at', async () => {
        const first = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('x'), createdAt: 300 });
        const again = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('x'), createdAt: 100 });
        const got = await feed([first, again]);
        expect(got).toHaveLength(1);
        expect(got[0]!.event.created_at).toBe(100);
    });

    it('a closed channel shows what was posted but takes no new post through the gate', async () => {
        const p = buildPostEvent({ deviceSk: STRANGER_DEVICE, content: post('late'), createdAt: 100 });
        expect(await feed([p], { ...open, status: 'closed' })).toHaveLength(0);
    });
});
