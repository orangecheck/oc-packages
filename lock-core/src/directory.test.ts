// The directory rule (oc-chat-protocol SPEC §8.2, 0.4.0) against the spec's own
// vectors vc22–vc25, plus what the vectors do not reach: content shape, unread
// anchors and the Esplora coin reader.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    channelDirectoryDtag,
    channelId,
    type CoinFacts,
    claimId,
    directoryAnchor,
    directoryDtag,
    type DirectoryRecord,
    esploraCoinReader,
    parseChannelDirectoryContent,
    parseDirectoryContent,
    repointId,
    resolveDirectory,
} from './directory-entry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** OC_CHAT_VECTORS_DIR (CI), else a sibling clone of oc-chat-protocol, else skip. */
function vectorsDir(): string | null {
    if (process.env.OC_CHAT_VECTORS_DIR && existsSync(process.env.OC_CHAT_VECTORS_DIR)) {
        return process.env.OC_CHAT_VECTORS_DIR;
    }
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-chat-protocol', 'test-vectors');
    return existsSync(join(sibling, 'vc25-directory-repoints.json')) ? sibling : null;
}
const DIR = vectorsDir();
const vector = (name: string) => JSON.parse(readFileSync(join(DIR as string, name), 'utf8'));

type VCoin = { confirmed_at: number; value: number; pays_to?: string; spend: { confirmations: number } | null } | 'no-answer';
type VRecord = {
    kind: 'listing' | 'tombstone';
    address: string;
    key: string;
    created_at: number;
    claim_id?: string;
    anchor?: number | null;
    outpoint?: string;
    coin?: VCoin;
    repoints?: Array<{ repoint_id: string; prev: string; outpoint: string; anchor: number | null; coin: VCoin }>;
    ends?: string;
    source: 'directory' | 'public';
};
type VCase = {
    name: string;
    addresses: Record<string, { binding: 'answered' | 'no-answer'; bound_keys: string[] }>;
    records: VRecord[];
    expected: { result: string; holder: string | null; reads: string[] };
};

/** A vector case as the walk's input: records, and a reader answering from the case's facts. */
function fromVector(c: VCase, tip: number) {
    const coins = new Map<string, CoinFacts | 'no-answer'>();
    const facts = (v: VCoin, address: string): CoinFacts | 'no-answer' =>
        v === 'no-answer'
            ? v
            : {
                  confirmedAt: v.confirmed_at,
                  value: v.value,
                  paysTo: v.pays_to ?? address,
                  spendHeight: v.spend && v.spend.confirmations > 0 ? tip - v.spend.confirmations + 1 : null,
              };
    const records: DirectoryRecord[] = c.records.map((r) => {
        if (r.kind === 'tombstone') {
            return { kind: 'tombstone', address: r.address, key: r.key, createdAt: r.created_at, ends: r.ends as string, source: r.source };
        }
        const outpoint = r.outpoint ?? `own:${r.claim_id}`;
        coins.set(outpoint, facts(r.coin as VCoin, r.address));
        for (const p of r.repoints ?? []) coins.set(p.outpoint, facts(p.coin, r.address));
        return {
            kind: 'listing',
            address: r.address,
            key: r.key,
            createdAt: r.created_at,
            claimId: r.claim_id as string,
            outpoint,
            anchor: r.anchor ?? null,
            repoints: (r.repoints ?? []).map((p) => ({ repointId: p.repoint_id, prev: p.prev, outpoint: p.outpoint, anchor: p.anchor })),
            source: r.source,
        };
    });
    const reader = {
        boundKeys: async (address: string) => {
            const a = c.addresses[address];
            return !a || a.binding === 'no-answer' ? ('no-answer' as const) : a.bound_keys;
        },
        coin: async (outpoint: string) => coins.get(outpoint) ?? ('no-answer' as const),
    };
    return { records, reader };
}

describe.skipIf(!DIR)('the spec vectors (oc-chat-protocol test-vectors)', () => {
    it('vc22: claim_id, and the legacy claim with nonce = listing_id', () => {
        const v = vector('vc22-directory-claim-id.json');
        const { claim, other_address, legacy_v1_listing_id } = v.inputs;
        expect(claimId(claim)).toBe(v.expected.claim_id);
        expect(claimId({ ...claim, address: other_address })).toBe(v.expected.claim_id_in_listing_for_other_address);
        expect(claimId({ handle: 'alice', address: claim.address, outpoint: claim.outpoint, nonce: legacy_v1_listing_id })).toBe(
            v.expected.legacy_claim_id
        );
        const ch = v.inputs.channel_listing;
        expect(channelId(ch.founder_address, ch.slug)).toBe(v.expected.channel_id);
        const parsed = parseChannelDirectoryContent(ch, ch.handle);
        expect(parsed && parsed.kind === 'listing' && parsed.claimId).toBe(v.expected.channel_claim_id);
    });

    it('vc07: the d-tag is a salted hash of the handle', () => {
        const v = vector('vc07-directory-dtag.json');
        expect(directoryDtag(v.inputs.handle.toUpperCase())).toBe(v.expected.d_tag);
    });

    it('vc23: the anchor is the lowest attestation whose header matches', async () => {
        const v = vector('vc23-directory-claim-anchor.json');
        const source = (hs: Record<string, string>) => ({
            getHeaderAt: async (h: number) => (hs[h] ? Uint8Array.from(Buffer.from(hs[h], 'hex')) : null),
        });
        expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, source(v.inputs.headers))).toBe(v.expected.anchor_height);
        expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, source(v.inputs.headers_with_wrong_low_root))).toBe(
            v.expected.anchor_height_when_low_header_mismatches
        );
        expect(await directoryAnchor(v.inputs.ots, v.inputs.other_digest, source(v.inputs.headers))).toBeNull();
    });

    for (const file of ['vc24-directory-resolution.json', 'vc25-directory-repoints.json']) {
        const v = DIR ? vector(file) : { cases: [], inputs: { tip: 0 } };
        for (const c of v.cases as VCase[]) {
            it(`${file.slice(0, 4)}: ${c.name}`, async () => {
                const { records, reader } = fromVector(c, v.inputs.tip);
                const out = await resolveDirectory(records, v.inputs.tip, reader);
                expect({ result: out.result, holder: out.holder, reads: out.reads }).toEqual(c.expected);
            });
        }
    }

    it('vc25: repoint_id', () => {
        const v = vector('vc25-directory-repoints.json');
        const r = v.inputs.repoint_id;
        expect(repointId({ claim: r.claim_id, prev: r.prev, outpoint: r.outpoint, nonce: r.nonce })).toBe(
            v.expected_repoint_id.repoint_id
        );
        expect(repointId({ claim: v.inputs.other_claim_id, prev: r.prev, outpoint: r.outpoint, nonce: r.nonce })).toBe(
            v.expected_repoint_id.repoint_id_for_other_claim
        );
    });
});

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';
const TX = 'ab'.repeat(32);
const NONCE = 'cd'.repeat(32);
const listing = (extra: Record<string, unknown> = {}, claim: Record<string, unknown> = {}) => ({
    v: 2,
    handle: 'alice',
    address: ADDR,
    inbox_pubkey: 'ef'.repeat(32),
    claim: { outpoint: `${TX}:0`, nonce: NONCE, ots: 'AQ==', ...claim },
    opted_in: true,
    created_at: 1790000000,
    ...extra,
});

describe('parseDirectoryContent (§8.2.5 (1))', () => {
    it('keeps a v2 listing and recomputes its claim from its own fields', () => {
        const p = parseDirectoryContent(listing(), 'Alice');
        expect(p?.kind).toBe('listing');
        expect(p && p.kind === 'listing' && p.claimId).toBe(claimId({ handle: 'alice', address: ADDR, outpoint: `${TX}:0`, nonce: NONCE }));
    });

    it('drops another handle, v1, an unshaped claim, and a non-boolean opted_in', () => {
        expect(parseDirectoryContent(listing(), 'bob')).toBeNull();
        expect(parseDirectoryContent(listing({ v: 1 }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({}, { outpoint: TX }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({}, { nonce: 'xyz' }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({ opted_in: 'yes' }), 'alice')).toBeNull();
    });

    it('keeps re-points only as one chain from the claim coin, at most 16', () => {
        const link = (prev: string, i: number) => ({ prev, outpoint: `${TX}:${i}`, nonce: NONCE, ots: 'AQ==' });
        const chain = (n: number) => Array.from({ length: n }, (_, i) => link(`${TX}:${i}`, i + 1));
        expect(parseDirectoryContent(listing({}, { repoints: chain(16) }), 'alice')).not.toBeNull();
        expect(parseDirectoryContent(listing({}, { repoints: chain(17) }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({}, { repoints: [link(`${TX}:0`, 1), link(`${TX}:0`, 2)] }), 'alice')).toBeNull();
    });

    it('keeps a tombstone that names the claim it ends', () => {
        expect(parseDirectoryContent({ v: 2, handle: 'alice', address: ADDR, opted_in: false, ends: NONCE, created_at: 1 }, 'alice')).toEqual({
            kind: 'tombstone',
            address: ADDR,
            createdAt: 1,
            ends: NONCE,
        });
        expect(parseDirectoryContent({ v: 2, handle: 'alice', address: ADDR, opted_in: false, created_at: 1 }, 'alice')).toBeNull();
    });
});

const channel = (extra: Record<string, unknown> = {}) => {
    const { address: _a, inbox_pubkey: _i, ...rest } = listing();
    return {
        ...rest,
        slug: 'Bitcoin-Talk',
        channel_id: channelId(ADDR, 'bitcoin-talk'),
        founder_address: ADDR,
        founder_inbox_pubkey: 'ef'.repeat(32),
        title: 'Bitcoin talk',
        ...extra,
    };
};

describe('parseChannelDirectoryContent (§8.3.6)', () => {
    it('reads the founder fields as the address and inbox key, with the same claim', () => {
        const p = parseChannelDirectoryContent(channel(), 'alice');
        expect(p).toEqual(parseDirectoryContent(listing(), 'alice'));
        expect(parseChannelDirectoryContent(channel({ inbox_pubkey: '11'.repeat(32), address: 'bc1qother' }), 'alice')).toEqual(p);
        expect(parseChannelDirectoryContent(listing(), 'alice')).toBeNull();
        expect(parseDirectoryContent(channel(), 'alice')).toBeNull();
    });

    it('drops a live listing whose channel_id is not its founder and slug, and any did:oc founder', () => {
        expect(parseChannelDirectoryContent(channel({ channel_id: channelId(ADDR, 'other') }), 'alice')).toBeNull();
        expect(parseChannelDirectoryContent(channel({ slug: undefined }), 'alice')).toBeNull();
        const did = 'did:oc:' + 'a'.repeat(32);
        expect(parseChannelDirectoryContent(channel({ founder_address: did, channel_id: channelId(did, 'bitcoin-talk') }), 'alice')).toBeNull();
        expect(
            parseChannelDirectoryContent({ v: 2, handle: 'alice', founder_address: did, opted_in: false, ends: NONCE, created_at: 1 }, 'alice')
        ).toBeNull();
    });

    it('keeps a tombstone whatever its slug and channel_id say', () => {
        expect(
            parseChannelDirectoryContent(
                { v: 2, handle: 'alice', founder_address: ADDR, opted_in: false, ends: NONCE, created_at: 1, channel_id: 'x' },
                'alice'
            )
        ).toEqual({ kind: 'tombstone', address: ADDR, createdAt: 1, ends: NONCE });
    });

    it('lives under its own d-tag namespace', () => {
        expect(channelDirectoryDtag('Alice')).toMatch(/^oc-lock-chat-chdir:[A-Za-z0-9_-]{43}$/);
        expect(channelDirectoryDtag('alice').slice(19)).not.toBe(directoryDtag('alice').slice(17));
    });
});

describe('a header that cannot be read (§8.2.5 (4))', () => {
    const tip = 930000;
    const holder = (anchor: DirectoryRecord extends infer R ? (R extends { kind: 'listing' } ? R['anchor'] : never) : never, source: 'directory' | 'public', key = 'ka', address = ADDR): DirectoryRecord => ({
        kind: 'listing',
        address,
        key,
        createdAt: 1,
        claimId: address === ADDR ? 'aa'.repeat(32) : 'bb'.repeat(32),
        outpoint: `own:${address}`,
        anchor,
        repoints: [],
        source,
    });
    const good: CoinFacts = { confirmedAt: 900000, value: 5000, paysTo: '', spendHeight: null };
    const reader = (bound: Record<string, string[]>) => ({
        boundKeys: async (a: string) => bound[a] ?? [],
        coin: async (o: string) => ({ ...good, paysTo: o.slice(4) }),
    });
    const BOB = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

    it('before a holder on a directory relay, is E_DIR_UNRESOLVED', async () => {
        const out = await resolveDirectory(
            [holder({ unread: 925000 }, 'directory'), holder(925010, 'directory', 'kb', BOB)],
            tip,
            reader({ [ADDR]: ['ka'], [BOB]: ['kb'] })
        );
        expect(out.result).toBe('E_DIR_UNRESOLVED');
    });

    it('on a public relay only, ends the audit and leaves the directory answer', async () => {
        const out = await resolveDirectory(
            [holder({ unread: 925000 }, 'public'), holder(925010, 'directory', 'kb', BOB)],
            tip,
            reader({ [ADDR]: ['ka'], [BOB]: ['kb'] })
        );
        expect(out).toMatchObject({ result: 'holds', holder: BOB });
    });

    it('directoryAnchor answers { unread } for a header source that throws', async () => {
        const v = DIR ? vector('vc23-directory-claim-anchor.json') : null;
        if (!v) return;
        const throws = { getHeaderAt: async () => Promise.reject(new Error('down')) };
        expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, throws)).toEqual({ unread: v.expected.attestation_heights[0] });
    });
});

describe('esploraCoinReader', () => {
    const answers = (map: Record<string, { status: number; body?: unknown }>) =>
        (async (url: string) => {
            const a = map[url];
            if (!a) throw new TypeError('fetch failed');
            return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status });
        }) as typeof fetch;
    const B = 'https://esplora.test/api';
    const tx = { status: { confirmed: true, block_height: 920374 }, vout: [{ value: 546, scriptpubkey_address: ADDR }] };

    it('reads confirmation, value, address and a confirmed spend', async () => {
        const read = esploraCoinReader({
            baseUrl: B,
            fetch: answers({
                [`${B}/tx/${TX}`]: { status: 200, body: tx },
                [`${B}/tx/${TX}/outspend/0`]: { status: 200, body: { spent: true, status: { confirmed: true, block_height: 930000 } } },
            }),
        });
        expect(await read(`${TX}:0`)).toEqual({ confirmedAt: 920374, value: 546, paysTo: ADDR, spendHeight: 930000 });
    });

    it('an unconfirmed spend is no spend yet; a missing coin clears nothing; an outage is no-answer', async () => {
        const mempoolSpend = esploraCoinReader({
            baseUrl: B,
            fetch: answers({
                [`${B}/tx/${TX}`]: { status: 200, body: tx },
                [`${B}/tx/${TX}/outspend/0`]: { status: 200, body: { spent: true, status: { confirmed: false } } },
            }),
        });
        expect((await mempoolSpend(`${TX}:0`)) as CoinFacts).toMatchObject({ spendHeight: null });
        const missing = esploraCoinReader({ baseUrl: B, fetch: answers({ [`${B}/tx/${TX}`]: { status: 404 } }) });
        expect(await missing(`${TX}:0`)).toEqual({ confirmedAt: null, value: 0, paysTo: '', spendHeight: null });
        const down = esploraCoinReader({ baseUrl: B, fetch: answers({ [`${B}/tx/${TX}`]: { status: 503 } }) });
        expect(await down(`${TX}:0`)).toBe('no-answer');
        const noSpendRead = esploraCoinReader({ baseUrl: B, fetch: answers({ [`${B}/tx/${TX}`]: { status: 200, body: tx } }) });
        expect(await noSpendRead(`${TX}:0`)).toBe('no-answer');
    });
});
