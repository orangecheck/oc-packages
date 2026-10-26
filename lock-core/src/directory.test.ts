// The directory rule (oc-chat-protocol SPEC §8.2, 0.4.0) against the spec's own
// vectors vc22–vc25, plus what the vectors do not reach: content shape, unread
// anchors and the Esplora coin reader.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    channelClaimId,
    channelDirectoryDtag,
    channelId,
    type CoinFacts,
    claimId,
    directoryAnchor,
    directoryDtag,
    DIRECTORY_PARAMS,
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
// In CI the vectors are checked out (OC_CHAT_VECTORS_DIR); a missing set must fail, not skip.
if (!DIR && process.env.CI) throw new Error('oc-chat-protocol test vectors not found: set OC_CHAT_VECTORS_DIR');
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
        // The lower attestation is passed over; the higher one's header cannot be read.
        const unread = new Set<number>(v.inputs.unread_heights_with_wrong_low_root);
        const partly = {
            getHeaderAt: async (h: number) => {
                if (unread.has(h)) throw new Error('rate limited');
                const hex = v.inputs.headers_with_wrong_low_root[h];
                return hex ? Uint8Array.from(Buffer.from(hex, 'hex')) : null;
            },
        };
        expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, partly)).toEqual(
            v.expected.anchor_when_low_header_mismatches_and_high_unread
        );
        // No block at the lowest attestation's height (null) passes it over to the next one that matches.
        const [low, high] = v.expected.attestation_heights as number[];
        const noLowBlock = {
            getHeaderAt: async (h: number) => {
                if (h === low) return null;
                const hex = v.inputs.headers_with_wrong_low_root[h];
                return hex ? Uint8Array.from(Buffer.from(hex, 'hex')) : null;
            },
        };
        expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, noLowBlock)).toBe(high);
        // At most 8 Bitcoin attestations anchor; with 9, no header is even read.
        const capHeaders = v.inputs.headers_for_8_and_9 as Record<string, string>;
        let headerReads = 0;
        const counted = {
            getHeaderAt: async (h: number) => {
                headerReads++;
                return capHeaders[h] ? Uint8Array.from(Buffer.from(capHeaders[h], 'hex')) : null;
            },
        };
        expect(await directoryAnchor(v.inputs.ots_with_8_attestations, v.inputs.claim_id, counted)).toBe(v.expected.anchor_with_8_attestations);
        headerReads = 0;
        expect(await directoryAnchor(v.inputs.ots_with_9_attestations, v.inputs.claim_id, counted)).toBe(v.expected.anchor_with_9_attestations);
        expect(headerReads).toBe(0);
        // A header of any other length, or not bytes at all, is a read without an answer.
        for (const bad of [new Uint8Array(79), new Uint8Array(81), 'header']) {
            const odd = { getHeaderAt: async () => bad as unknown as Uint8Array };
            expect(await directoryAnchor(v.inputs.ots, v.inputs.claim_id, odd)).toEqual({ unread: v.expected.attestation_heights[0] });
        }
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

    it('a holding claim names the coin it stands on: its own, or the last valid re-point', async () => {
        const at = async (file: string, name: string) => {
            const v = vector(file);
            const c = (v.cases as VCase[]).find((x) => x.name === name) as VCase;
            const { records, reader } = fromVector(c, v.inputs.tip);
            return { c, out: await resolveDirectory(records, v.inputs.tip, reader) };
        };
        const own = await at('vc24-directory-resolution.json', 'later funded claimant ignored');
        const ownRec = own.c.records.find((r) => r.kind === 'listing' && r.address === own.c.expected.holder);
        expect(own.out.result === 'holds' && own.out.coin).toBe(ownRec?.outpoint ?? `own:${ownRec?.claim_id}`);
        const two = await at('vc25-directory-repoints.json', 'a chain of two re-points');
        const twoRec = two.c.records.find((r) => r.kind === 'listing' && r.address === two.c.expected.holder && r.repoints?.length);
        expect(two.out.result === 'holds' && two.out.coin).toBe(twoRec?.repoints?.[1]?.outpoint);
        const early = await at('vc25-directory-repoints.json', 'a re-point too early for its coin ends the chain where it stands');
        expect(early.out.result).toBe('holds');
    });

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

    it('takes the content handle only in its own shape, and an address only in canonical form', () => {
        expect(parseDirectoryContent(listing({ handle: 'ALICE' }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({ address: ADDR.toUpperCase() }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({ address: 'bc1Q' + ADDR.slice(4) }), 'alice')).toBeNull();
        expect(parseDirectoryContent(listing({ address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' }), 'alice')).not.toBeNull();
    });

    it('drops a chain that names a coin twice', () => {
        const link = (prev: string, to: string) => ({ prev, outpoint: to, nonce: NONCE, ots: 'AQ==' });
        expect(parseDirectoryContent(listing({}, { repoints: [link(`${TX}:0`, `${TX}:0`)] }), 'alice')).toBeNull();
        expect(
            parseDirectoryContent(listing({}, { repoints: [link(`${TX}:0`, `${TX}:1`), link(`${TX}:1`, `${TX}:0`)] }), 'alice')
        ).toBeNull();
        expect(
            parseDirectoryContent(listing({}, { repoints: [link(`${TX}:0`, `${TX}:1`), link(`${TX}:1`, `${TX}:2`)] }), 'alice')
        ).not.toBeNull();
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
        slug: 'bitcoin-talk',
        channel_id: channelId(ADDR, 'bitcoin-talk'),
        founder_address: ADDR,
        founder_inbox_pubkey: 'ef'.repeat(32),
        title: 'Bitcoin talk',
        ...extra,
    };
};

describe('parseChannelDirectoryContent (§8.3.6)', () => {
    it('reads the founder fields as the address and inbox key, with the claim in its own namespace', () => {
        const p = parseChannelDirectoryContent(channel(), 'alice');
        const person = parseDirectoryContent(listing(), 'alice');
        expect(p).toEqual({ ...person, claimId: channelClaimId({ handle: 'alice', address: ADDR, outpoint: `${TX}:0`, nonce: NONCE }) });
        expect(p && p.kind === 'listing' && p.claimId).not.toBe(person && person.kind === 'listing' && person.claimId);
        expect(parseChannelDirectoryContent(channel({ inbox_pubkey: '11'.repeat(32), address: 'bc1qother' }), 'alice')).toEqual(p);
        expect(parseChannelDirectoryContent(listing(), 'alice')).toBeNull();
        expect(parseDirectoryContent(channel(), 'alice')).toBeNull();
    });

    it('drops a live listing whose channel_id is not its founder and slug, and any did:oc founder', () => {
        expect(parseChannelDirectoryContent(channel({ channel_id: channelId(ADDR, 'other') }), 'alice')).toBeNull();
        expect(parseChannelDirectoryContent(channel({ slug: undefined }), 'alice')).toBeNull();
        // §8.3.1's slug shape: [a-z0-9-]{3,48}.
        expect(parseChannelDirectoryContent(channel({ slug: 'Bitcoin-Talk' }), 'alice')).toBeNull();
        expect(parseChannelDirectoryContent(channel({ slug: 'bt', channel_id: channelId(ADDR, 'bt') }), 'alice')).toBeNull();
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
    const tx = { txid: TX, status: { confirmed: true, block_height: 920374 }, vout: [{ value: 546, scriptpubkey_address: ADDR }] };

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
        const spend404 = esploraCoinReader({
            baseUrl: B,
            fetch: answers({ [`${B}/tx/${TX}`]: { status: 200, body: tx }, [`${B}/tx/${TX}/outspend/0`]: { status: 404 } }),
        });
        expect(await spend404(`${TX}:0`)).toBe('no-answer');
    });

    it('an answer out of shape is no-answer, never a coin', async () => {
        const read = (txBody: unknown, spendBody: unknown) =>
            esploraCoinReader({
                baseUrl: B,
                fetch: answers({
                    [`${B}/tx/${TX}`]: { status: 200, body: txBody },
                    [`${B}/tx/${TX}/outspend/0`]: { status: 200, body: spendBody },
                }),
            })(`${TX}:0`);
        const unspent = { spent: false };
        for (const [txBody, spendBody] of [
            [{}, unspent],
            [null, unspent],
            [{ ...tx, txid: 'ff'.repeat(32) }, unspent],
            [{ ...tx, status: { confirmed: true } }, unspent],
            [{ ...tx, status: { confirmed: 'true', block_height: 1 } }, unspent],
            [{ ...tx, vout: {} }, unspent],
            [{ ...tx, vout: [{ value: '546', scriptpubkey_address: ADDR }] }, unspent],
            [{ ...tx, vout: [null] }, unspent],
            [tx, {}],
            [tx, null],
            [tx, { spent: 'true' }],
            [tx, { spent: 1, status: { confirmed: true, block_height: 930000 } }],
            [tx, { spent: true }],
            [tx, { spent: true, status: { confirmed: true } }],
        ] as const) {
            expect(await read(txBody, spendBody), JSON.stringify([txBody, spendBody])).toBe('no-answer');
        }
        expect(await read({ ...tx, vout: [] }, unspent)).toEqual({ confirmedAt: null, value: 0, paysTo: '', spendHeight: null });
        expect(await read({ ...tx, status: { confirmed: false } }, unspent)).toEqual({ confirmedAt: null, value: 546, paysTo: ADDR, spendHeight: null });
    });

    it('refuses option keys it does not read', () => {
        expect(() => esploraCoinReader({ baseURL: B } as never)).toThrow(/does not read option "baseURL"/);
    });
});

describe('resolveDirectory at its edges', () => {
    const tip = 930000;
    const BOB = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
    const rec = (address: string, key: string, id: string, anchor: number, outpoint = `own:${id}`): DirectoryRecord => ({
        kind: 'listing',
        address,
        key,
        createdAt: 1,
        claimId: id,
        outpoint,
        anchor,
        repoints: [],
        source: 'directory',
    });
    const coin: CoinFacts = { confirmedAt: 900000, value: 5000, paysTo: '', spendHeight: null };
    const okReader = {
        boundKeys: async (a: string) => (a === ADDR ? ['ka'] : ['kb']),
        coin: async (o: string) => ({ ...coin, paysTo: o.endsWith('bob') ? BOB : ADDR }),
    };

    it('refuses params that are not exactly its shape', async () => {
        const run = (p: unknown) => resolveDirectory([], tip, okReader, p as never);
        await expect(run({ ...DIRECTORY_PARAMS, floor_sats: 1 })).rejects.toThrow(/no option "floor_sats"/);
        await expect(run({ ...DIRECTORY_PARAMS, bounds: { bindingReads: 256 } })).rejects.toThrow(/needs "coinReads"/);
        await expect(run({ ...DIRECTORY_PARAMS, floorConfs: 1.5 })).rejects.toThrow(/whole non-negative/);
        await expect(run({ ...DIRECTORY_PARAMS, repointBlocks: -1 })).rejects.toThrow(/whole non-negative/);
        expect((await run(DIRECTORY_PARAMS)).result).toBe('E_DIR_UNVERIFIED');
    });

    it('a reader that throws or answers out of shape has not answered', async () => {
        const recs = [rec(ADDR, 'ka', 'aa'.repeat(32), 925000, 'own:alice'), rec(BOB, 'kb', 'bb'.repeat(32), 925010, 'own:bob')];
        for (const reader of [
            { ...okReader, coin: async () => Promise.reject(new Error('down')) },
            { ...okReader, coin: async () => ({ confirmedAt: '900000' }) as never },
            { ...okReader, coin: async () => null as never },
            { ...okReader, boundKeys: async () => Promise.reject(new Error('down')) },
            { ...okReader, boundKeys: async () => 'ka' as never },
        ]) {
            expect((await resolveDirectory(recs, tip, reader)).result).toBe('E_DIR_UNRESOLVED');
        }
        expect(await resolveDirectory(recs, tip, okReader)).toMatchObject({ result: 'holds', holder: ADDR });
    });

    it('drops, before any read, a record whose bech32 address is not lowercase, and a chain that names a coin twice', async () => {
        const upper = rec(ADDR.toUpperCase(), 'ka', 'aa'.repeat(32), 925000, 'own:alice');
        const loop: DirectoryRecord = {
            ...rec(ADDR, 'ka', 'cc'.repeat(32), 925001, 'own:alice2'),
            repoints: [{ repointId: 'dd'.repeat(32), prev: 'own:alice2', outpoint: 'own:alice2', anchor: 925002 }],
        };
        const out = await resolveDirectory([upper, loop, rec(BOB, 'kb', 'bb'.repeat(32), 925010, 'own:bob')], tip, okReader);
        expect(out).toMatchObject({ result: 'holds', holder: BOB });
        expect(out.reads).toEqual(['binding ' + BOB, 'coin ' + 'bb'.repeat(6)]);
    });
});
