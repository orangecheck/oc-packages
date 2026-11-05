// `oc-vote tally` with a voter whose coins the explorer would not list (VO2).
// mempool.space answers 400 for an address with more than 500 unspent outputs,
// and anyone can push a voter there with about 125 USD of dust. The lookup
// threw a plain Error, so vote-core ended the whole tally and the CLI exited 1
// for that poll for good. The lookup now throws vote-core's UtxoUnreadError:
// the tally is `unread` (SPEC §8), the CLI names who could not be read and why,
// prints no totals, and exits 3, neither a count (0) nor a failure (1).

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { ballotId, pollId, type Ballot, type Poll } from '@orangecheck/vote-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBallotEvent, buildPollEvent } from './events.js';
import type { NostrEvent } from './nostr.js';

const read = vi.hoisted(() => ({
    relays: ['wss://a.test', 'wss://b.test', 'wss://c.test', 'wss://d.test', 'wss://e.test'],
    poll: [] as unknown[],
    ballots: [] as unknown[],
}));
// Every relay answered in full; what they hold is set below.
vi.mock('./nostr.js', async (original) => {
    const all = read.relays.map((relay) => ({ relay, answered: true, truncated: false }));
    return {
        ...(await original<typeof import('./nostr.js')>()),
        fetchPollEvents: async () => ({ events: read.poll, complete: true }),
        fetchBallotEvents: async () => ({ events: read.ballots, complete: true, relays: all }),
        fetchRevealEvents: async () => ({ events: [], complete: true, relays: all }),
    };
});

import { runTally, UNREAD_EXIT } from './commands/tally.js';
import { mempoolSource, UTXO_FETCH_TIMEOUT_MS } from './utxos.js';

/** mempool.space's answer for an address past its cap, as read signed out on 2026-11-05T11:52:20Z. */
const CAP_BODY = 'Too many unspent transaction outputs (>500). Contact support to raise limits.';
const BASE = 'http://explorer.test/api';

const key = (n: number) => n.toString(16).padStart(2, '0').repeat(32);
const signer = (n: number) => {
    const k = key(n);
    const address = addressFromPrivateKey(k, 'p2wpkh');
    return { address, sign: (m: string) => signMessage(address, m, k) };
};
const creator = signer(0x11);
const [A, B, C] = [signer(0x22), signer(0x33), signer(0x44)];
const SATS: Record<string, number> = { [A.address]: 100_000, [B.address]: 300_000, [C.address]: 50_000 };

// Clock-dated: the deadline is before 2026-11-15.
const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: creator.address,
    question: 'Ship it?',
    options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
    ],
    deadline: '2026-10-21T00:00:00Z',
    snapshot_block: 900_000,
    weight_mode: 'sats',
    weight_params: null,
    min_sats: 0,
    min_days: 0,
    mode: 'public',
    reveal_pk: null,
    tiebreak: 'latest',
    notes: null,
    created_at: '2026-10-01T00:00:00Z',
    sig: { alg: 'bip322', pubkey: creator.address, value: '' },
};
poll.sig.value = creator.sign(pollId(poll));
const pid = pollId(poll);

function ballot(voter: ReturnType<typeof signer>, option: string, created_at: string): Ballot {
    const b: Ballot = {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pid,
        voter: voter.address,
        option,
        attestation_id: null,
        secret: null,
        created_at,
        sig: { alg: 'bip322', pubkey: voter.address, value: '' },
    };
    b.sig.value = voter.sign(ballotId(b));
    return b;
}

/** What the explorer answers for an address's coins, by address; unset is its SATS in one coin. */
const coins = new Map<string, () => Response | Promise<Response>>();
const capped = () => new Response(CAP_BODY, { status: 400, headers: { 'content-type': 'text/plain' } });

beforeEach(() => {
    read.poll = [buildPollEvent(poll)];
    read.ballots = [
        buildBallotEvent(ballot(A, 'yes', '2026-10-10T00:00:00Z')),
        buildBallotEvent(ballot(B, 'no', '2026-10-11T00:00:00Z')),
        buildBallotEvent(ballot(C, 'yes', '2026-10-12T00:00:00Z')),
    ] satisfies NostrEvent[];
    coins.clear();
    vi.stubGlobal('fetch', async (url: string) => {
        if (url === `${BASE}/blocks/tip/height`) return new Response('900100');
        const m = /\/address\/([^/]+)\/utxo$/.exec(url);
        if (!m) return new Response('', { status: 404 });
        const answer = coins.get(m[1]!);
        if (answer) return answer();
        const value = SATS[m[1]!] ?? 0;
        return new Response(
            JSON.stringify([
                { txid: '00'.repeat(32), vout: 0, value, status: { confirmed: true, block_height: 800_000 } },
            ])
        );
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.exitCode = 0;
});

/** One `oc-vote tally` run: what it printed, and the exit code it set. */
async function tally(json: boolean) {
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    await runTally({ pollId: pid, relays: read.relays, mempoolBase: BASE, json });
    return { out: out.join(''), exitCode: process.exitCode };
}

describe('oc-vote tally with a voter the explorer will not list', () => {
    it('reads unread, naming the voter and why, with no totals, and exits 3', async () => {
        coins.set(B.address, capped);
        const { out, exitCode } = await tally(true);
        const r = JSON.parse(out) as Record<string, unknown>;
        expect(r).toMatchObject({
            poll_id: pid,
            state: 'unread',
            basis: 'voter_clocks',
            snapshot_block: 900_000,
            unread: [{ voter: B.address, reason: 'utxo_cap_unread' }],
        });
        for (const total of ['tallies', 'turnout', 'counted']) expect(r).not.toHaveProperty(total);
        expect(exitCode).toBe(3);
    });

    it('says so in words, and that tallying again from that explorer will not help', async () => {
        coins.set(B.address, capped);
        coins.set(C.address, () => new Response('', { status: 503 }));
        const { out, exitCode } = await tally(false);
        expect(out).toContain('STATE:      unread — not counted: 2 voters could not be read at block 900000');
        expect(out).toMatch(new RegExp(`${B.address} +utxo_cap_unread +.*won't help`));
        expect(out).toMatch(new RegExp(`${C.address} +chain_unread +.*tally again once it answers`));
        // No count: no counted or turnout line, no bars, no shares.
        expect(out).not.toMatch(/^ {2}(counted|turnout):|█|%/m);
        expect(exitCode).toBe(3);
    });

    it('a count where every voter was read is tallied and leaves the exit code alone', async () => {
        const { out, exitCode } = await tally(true);
        expect(JSON.parse(out)).toMatchObject({ state: 'tallied', tallies: { yes: 150_000, no: 300_000 } });
        expect(exitCode).toBe(0);
        expect(UNREAD_EXIT).not.toBe(1);
    });
});

describe("the explorer's answers for a voter's coins", () => {
    const ask = () => mempoolSource(BASE).fetchUtxos(A.address);
    const answers: { what: string; answer: () => Response | Promise<Response>; reason: string }[] = [
        { what: 'its 500-output cap (400)', answer: capped, reason: 'utxo_cap_unread' },
        {
            what: 'the cap in other words, any case (400)',
            answer: () => new Response('Too many unspent outputs', { status: 400 }),
            reason: 'utxo_cap_unread',
        },
        { what: 'a rate limit (429)', answer: () => new Response('', { status: 429 }), reason: 'chain_unread' },
        { what: 'a server error (500)', answer: () => new Response('', { status: 500 }), reason: 'chain_unread' },
        { what: 'no service (503)', answer: () => new Response('', { status: 503 }), reason: 'chain_unread' },
        {
            what: 'no answer at all',
            answer: () => Promise.reject(new TypeError('fetch failed')),
            reason: 'chain_unread',
        },
        { what: 'a 200 that is not a coin list', answer: () => new Response('<html>'), reason: 'chain_unread' },
        {
            what: 'a 200 whose coin has no value',
            answer: () => new Response('[{"txid":"x","vout":0,"status":{"confirmed":true,"block_height":1}}]'),
            reason: 'chain_unread',
        },
        {
            what: 'any other refusal (400)',
            answer: () => new Response('Invalid Bitcoin address', { status: 400 }),
            reason: 'provider_refused_unread',
        },
        { what: 'a refusal (403)', answer: () => new Response('', { status: 403 }), reason: 'provider_refused_unread' },
        { what: 'a refusal (404)', answer: () => new Response('', { status: 404 }), reason: 'provider_refused_unread' },
    ];
    it.each(answers)('$what is $reason', async ({ answer, reason }) => {
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        coins.set(A.address, answer);
        const err = await ask().then(
            () => null,
            (e: unknown) => e
        );
        expect(err).toMatchObject({ name: 'UtxoUnreadError', reason });
    });

    it('reads a coin list it was given', async () => {
        coins.set(
            A.address,
            () =>
                new Response(
                    JSON.stringify([
                        { txid: 'a', vout: 0, value: 5000, status: { confirmed: true, block_height: 899_000 } },
                        { txid: 'b', vout: 1, value: 7000, status: { confirmed: false } },
                    ])
                )
        );
        expect(await ask()).toEqual([{ value: 5000, confirmed_height: 899_000 }]);
    });

    it('gives up after its own timeout, as chain_unread', async () => {
        vi.useFakeTimers();
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        let signal: AbortSignal | undefined;
        vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
            signal = init?.signal ?? undefined;
            return new Promise<Response>((_, reject) =>
                signal?.addEventListener('abort', () =>
                    reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
                )
            );
        });
        let settled: unknown = 'pending';
        const p = ask().then(
            () => (settled = 'answered'),
            (e: unknown) => (settled = e)
        );
        await vi.advanceTimersByTimeAsync(UTXO_FETCH_TIMEOUT_MS - 1);
        expect(settled).toBe('pending');
        await vi.advanceTimersByTimeAsync(1);
        await p;
        expect(signal?.aborted).toBe(true);
        expect(settled).toMatchObject({ name: 'UtxoUnreadError', reason: 'chain_unread' });
    });

    it('says what threw by name, never the address, and still reads chain_unread', async () => {
        const lines: string[] = [];
        vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
            lines.push(String(chunk));
            return true;
        });
        coins.set(A.address, () => {
            throw new TypeError(`cannot read ${A.address}`);
        });
        await expect(ask()).rejects.toMatchObject({ name: 'UtxoUnreadError', reason: 'chain_unread' });
        expect(lines).toEqual(['oc-vote: coin lookup threw TypeError; read as chain_unread\n']);
    });
});
