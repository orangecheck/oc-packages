// Which reads ask a relay its NIP-11 page (nostr-core relayMaxLimit): each read of
// tally, show and verify with --relay, the anchored poll's stamp read included,
// and none without it. Relays are planted per URL and paged by the real reader;
// the chain is planted too. Nothing leaves the process.

import { hexToBytes } from '@noble/hashes/utils';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { stamp } from '@orangecheck/stamp-core';
import { base64Encode, type BlockHeaderSource } from '@orangecheck/stamp-ots';
import { ballotId, ballotStampContent, pollId, type Ballot, type Poll } from '@orangecheck/vote-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const planted = vi.hoisted(() => ({
    /** What each relay holds. */
    held: new Map<string, unknown[]>(),
    /** DEFAULT_RELAYS for this file: set per test. */
    defaults: [] as string[],
    /** Block headers by height, and the chain's tip. */
    roots: new Map<number, Uint8Array>(),
    tip: 0,
}));

const CLOSE = 925_000;
const DEADLINE_ISO = '2026-12-01T00:00:00Z';
const DEADLINE = Date.parse(DEADLINE_ISO) / 1000;

vi.mock('./nostr.js', async (original) => {
    const real = await original<typeof import('./nostr.js')>();
    const matches = (e: Record<string, unknown>, f: Record<string, unknown>) => {
        const at = e.created_at as number;
        if (Array.isArray(f.kinds) && !f.kinds.includes(e.kind)) return false;
        if (typeof f.until === 'number' && at > f.until) return false;
        if (typeof f.since === 'number' && at < f.since) return false;
        for (const [k, v] of Object.entries(f)) {
            if (!k.startsWith('#') || !Array.isArray(v)) continue;
            if (!(e.tags as string[][]).some((t) => t[0] === k.slice(1) && v.includes(t[1]))) return false;
        }
        return true;
    };
    /** Each relay answers alone: newest first, at most the page asked and 500, then EOSE. */
    const query: import('./nostr.js').QueryFn = async (filter, relays) => {
        const f = filter as Record<string, unknown>;
        const relayStatus = relays.map((relay) => {
            const page = ((planted.held.get(relay) ?? []) as Record<string, unknown>[])
                .filter((e) => matches(e, f))
                .sort((a, b) => (b.created_at as number) - (a.created_at as number))
                .slice(0, Math.min((f.limit as number | undefined) ?? 500, 500));
            return { relay, ok: true, eose: true, events: page.length, rejected: 0, page };
        });
        return {
            events: relayStatus.flatMap((s) => s.page) as never,
            relayStatus: relayStatus.map(({ page: _, ...s }) => s),
        };
    };
    return {
        ...real,
        DEFAULT_RELAYS: planted.defaults,
        fetchPollEvents: (id: string, relays?: readonly string[], _q?: unknown, maxLimit?: import('./nostr.js').MaxLimit) =>
            real.fetchPollEvents(id, relays, query, maxLimit),
        fetchBallotEvents: (id: string, relays?: readonly string[], _q?: unknown, maxLimit?: import('./nostr.js').MaxLimit) =>
            real.fetchBallotEvents(id, relays, query, maxLimit),
        fetchRevealEvents: (id: string, relays?: readonly string[], _q?: unknown, maxLimit?: import('./nostr.js').MaxLimit) =>
            real.fetchRevealEvents(id, relays, query, maxLimit),
        queryPaged: (f: never, relays?: readonly string[], _q?: unknown, maxLimit?: import('./nostr.js').MaxLimit) =>
            real.queryPaged(f, relays, query, maxLimit),
    };
});
vi.mock('@orangecheck/vote-core', async (original) => ({
    ...(await original<typeof import('@orangecheck/vote-core')>()),
    // median_time_past rises 600 s a block and block CLOSE lands on the deadline.
    mempoolBlockTimeSource: () => ({
        blockHeightAtTimestamp: async () => CLOSE,
        medianTimePast: async (h: number) => {
            if (h > planted.tip) throw new Error('no such block');
            return DEADLINE + (h - CLOSE) * 600;
        },
        tipHeight: async () => planted.tip,
    }),
}));
vi.mock('@orangecheck/stamp-ots', async (original) => ({
    ...(await original<typeof import('@orangecheck/stamp-ots')>()),
    mempoolHeaderSource: (): BlockHeaderSource => ({
        async getHeaderAt(height) {
            const root = planted.roots.get(height);
            if (!root) return null;
            const h = new Uint8Array(80);
            h.set(root, 36);
            return h;
        },
    }),
}));

import { runShow } from './commands/show.js';
import { runTally } from './commands/tally.js';
import { runVerify } from './commands/verify.js';
import { buildBallotEvent, buildPollEvent } from './events.js';

const MEMPOOL = 'http://explorer.test/api';
const key = (n: number) => n.toString(16).padStart(2, '0').repeat(32);
const CREATOR_KEY = key(0x11);
const CREATOR = addressFromPrivateKey(CREATOR_KEY, 'p2wpkh');
const ALICE_KEY = key(0x22);
const ALICE = addressFromPrivateKey(ALICE_KEY, 'p2wpkh');

// Anchored: its deadline is after the cutover, so a ballot counts by the block that anchors it.
const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: CREATOR,
    question: 'anchored?',
    options: [
        { id: 'yes', label: 'yes' },
        { id: 'no', label: 'no' },
    ],
    deadline: DEADLINE_ISO,
    snapshot_block: 900_000,
    weight_mode: 'one_per_address',
    weight_params: null,
    min_sats: 0,
    min_days: 0,
    mode: 'public',
    reveal_pk: null,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-11-16T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
poll.sig.value = signMessage(CREATOR, pollId(poll), CREATOR_KEY);
const pid = pollId(poll);
const yes: Ballot = {
    v: 0,
    kind: 'oc-vote/ballot',
    poll_id: pid,
    voter: ALICE,
    option: 'yes',
    attestation_id: null,
    secret: null,
    created_at: '2026-11-20T00:00:00Z',
    sig: { alg: 'bip322', pubkey: ALICE, value: '' },
};
yes.sig.value = signMessage(ALICE, ballotId(yes), ALICE_KEY);

const BITCOIN_TAG = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
/** An OTS proof with no operations: a Bitcoin attestation over the digest itself. */
function directProof(height: number): Uint8Array {
    const payload: number[] = [];
    let n = height;
    do {
        let b = n & 0x7f;
        n = Math.floor(n / 128);
        if (n > 0) b |= 0x80;
        payload.push(b);
    } while (n > 0);
    return new Uint8Array([0x00, ...BITCOIN_TAG, payload.length, ...payload]);
}

const pollEvent = buildPollEvent(poll);
const ballotEvent = buildBallotEvent(yes);
let stampEvent: Record<string, unknown>;

/** NIP-11 GETs made this test, by host; and the page each host declares. */
const gets: string[] = [];
const declares = new Map<string, number>();
/** Each test names relays no earlier test asked, since nostr-core keeps a declared page per URL. */
let run = 0;
const five = () => {
    run++;
    return ['a', 'b', 'c', 'd', 'e'].map((x) => `wss://${x}${run}.test`);
};

beforeAll(async () => {
    // A stamp of the ballot anchored three blocks before the close.
    const c = ballotStampContent(yes);
    const env = await stamp({
        content: { hash: c.hash, length: c.length },
        mime: c.mime,
        signer: { address: CREATOR, signMessage: async (m) => signMessage(CREATOR, m, CREATOR_KEY) },
        signedAt: '2026-11-20T00:00:00Z',
    });
    planted.roots.set(CLOSE - 3, hexToBytes(env.id));
    const s = {
        ...env,
        ots: {
            status: 'confirmed',
            proof: base64Encode(directProof(CLOSE - 3)),
            calendars: [],
            block_height: 1,
            block_hash: '00'.repeat(32),
            upgraded_at: '2026-11-20T01:00:00Z',
        },
    };
    stampEvent = { id: 'stamp-1', pubkey: '00'.repeat(32), sig: '', created_at: 1_000, kind: 30083, tags: [['t', c.hash]], content: JSON.stringify(s) };
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (new Headers(init?.headers).get('accept') === 'application/nostr+json') {
            const host = new URL(url).hostname;
            gets.push(host);
            const page = declares.get(host);
            return page === undefined ? new Response('', { status: 404 }) : Response.json({ limitation: { max_limit: page } });
        }
        // A voter's coins: none needed, one ballot per address.
        if (url.startsWith(MEMPOOL)) return Response.json([]);
        throw new Error(`unexpected fetch ${url}`);
    });
});

beforeEach(() => {
    // resolveCloseBlock reads no chain for a deadline still to come by the wall clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-02T00:00:00Z'));
    planted.tip = CLOSE + 36 + 6;
    planted.held.clear();
    planted.defaults.splice(0);
    gets.splice(0);
    declares.clear();
});
afterEach(() => vi.useRealTimers());
afterAll(() => vi.unstubAllGlobals());

/** `run` with its JSON on stdout read back, or the error it stopped on. */
async function out(run: () => Promise<void>): Promise<Record<string, unknown>> {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((c) => {
        chunks.push(String(c));
        return true;
    });
    try {
        await run();
        return JSON.parse(chunks.join('')) as Record<string, unknown>;
    } catch (e) {
        return { error: (e as Error).message };
    } finally {
        spy.mockRestore();
    }
}

describe('oc-vote tally with --relay asks each named relay its page for the stamp read too', () => {
    it('a named relay that sent no ballot, declares a page of 50 and holds the ballot stamp holds the count short of final', async () => {
        const relays = five();
        for (const r of relays.slice(0, 4)) planted.held.set(r, [pollEvent, ballotEvent, stampEvent]);
        planted.held.set(relays[4]!, [stampEvent]);
        const e = new URL(relays[4]!).hostname;
        declares.set(e, 50);
        const r = await out(() => runTally({ pollId: pid, relays, mempoolBase: MEMPOOL, json: true }));
        expect(r).toMatchObject({ state: 'provisional', not_final_because: `the stamp lookup did not finish on ${relays[4]}` });
        expect(gets).toContain(e);
    });

    it('the same relay declaring 500: the count is final', async () => {
        const relays = five();
        for (const r of relays.slice(0, 4)) planted.held.set(r, [pollEvent, ballotEvent, stampEvent]);
        planted.held.set(relays[4]!, [stampEvent]);
        declares.set(new URL(relays[4]!).hostname, 500);
        const r = await out(() => runTally({ pollId: pid, relays, mempoolBase: MEMPOOL, json: true }));
        expect(r).toMatchObject({ state: 'tallied', counted: [ballotId(yes)] });
    });
});

describe('without --relay no relay is asked its NIP-11 page', () => {
    // The default relays hold everything, and one declares 50: asked, it would cut every read short.
    const defaults = () => {
        const relays = five();
        for (const r of relays) planted.held.set(r, [pollEvent, ballotEvent, stampEvent]);
        declares.set(new URL(relays[4]!).hostname, 50);
        planted.defaults.push(...relays);
    };

    it('tally', async () => {
        defaults();
        const r = await out(() => runTally({ pollId: pid, mempoolBase: MEMPOOL, json: true }));
        expect(r).toMatchObject({ state: 'tallied', counted: [ballotId(yes)] });
        expect(gets).toEqual([]);
    });

    it('show', async () => {
        defaults();
        expect(await out(() => runShow({ pollId: pid, json: true }))).toMatchObject({ ballot_count: 1 });
        expect(gets).toEqual([]);
    });

    it('verify', async () => {
        defaults();
        expect(await out(() => runVerify({ pollId: pid, json: true }))).not.toHaveProperty('error');
        expect(gets).toEqual([]);
    });

    it('and with --relay naming the same relays, each is asked, and the one declaring 50 cuts the ballot read short', async () => {
        defaults();
        const named = [...planted.defaults];
        for (const run of [
            () => runShow({ pollId: pid, relays: named, json: true }),
            () => runVerify({ pollId: pid, relays: named, json: true }),
        ]) {
            expect(await out(run)).toEqual({
                error: expect.stringMatching(/^can't count: the ballot lookup was cut short on wss:\/\/e\d+\.test, so ballots/),
            });
        }
        expect(new Set(gets)).toEqual(new Set(named.map((r) => new URL(r).hostname)));
    });
});
