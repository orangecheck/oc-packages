// `oc-vote tally` end to end, over relays that answer the way strfry does:
// newest first, `until` and `limit` honoured, at most 500 events a REQ, then
// EOSE. Real WebSockets, real Nostr signatures and BIP-322 ballots. Every
// relay and the coin source are on 127.0.0.1; nothing is published.
//
// Anyone can publish under a poll's tag, dated as they like. A count rests on
// the ballot read only when no relay was cut off and at least the floor (4 of
// 5) finished; otherwise it can't count, and says so.

import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { closeRelayPool } from '@orangecheck/nostr-core';
import { x25519 } from '@noble/curves/ed25519';
import { ballotId, pollId, revealId, type Ballot, type Poll, type Reveal } from '@orangecheck/vote-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import { runTally } from './commands/tally.js';
import { buildBallotEvent, buildPollEvent, buildRevealEvent } from './events.js';
import type { NostrEvent } from './nostr.js';

const CAP = 500;

let keySeq = 1;
function freshKey(): Uint8Array {
    const k = new Uint8Array(32);
    k[0] = 0x7f;
    k[30] = keySeq >> 8;
    k[31] = keySeq++ & 0xff;
    return k;
}

/** `e` signed by `sk` (a fresh key by default) and dated `at`. */
function signAt(e: Pick<NostrEvent, 'kind' | 'tags' | 'content'>, at: number, sk = freshKey()): NostrEvent {
    const pubkey = bytesToHex(schnorr.getPublicKey(sk));
    const id = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, at, e.kind, e.tags, e.content]))));
    return { id, pubkey, created_at: at, kind: e.kind, tags: e.tags, content: e.content, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
}

const kCreator = '11'.repeat(32);
const kAlice = '22'.repeat(32);
const kBob = '33'.repeat(32);
const kCarol = '44'.repeat(32);
const CREATOR = addressFromPrivateKey(kCreator, 'p2wpkh');
const ALICE = addressFromPrivateKey(kAlice, 'p2wpkh');
const BOB = addressFromPrivateKey(kBob, 'p2wpkh');
const CAROL = addressFromPrivateKey(kCarol, 'p2wpkh');
const SATS: Record<string, number> = { [ALICE]: 100_000, [BOB]: 300_000, [CAROL]: 50_000 };

// Clock-dated: the deadline is before 2026-11-15.
const poll: Poll = {
    v: 0,
    kind: 'oc-vote/poll',
    creator: CREATOR,
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
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
poll.sig.value = signMessage(CREATOR, pollId(poll), kCreator);
const pid = pollId(poll);

function ballot(voter: string, key: string, option: string, created_at: string): Ballot {
    const b: Ballot = {
        v: 0,
        kind: 'oc-vote/ballot',
        poll_id: pid,
        voter,
        option,
        attestation_id: null,
        secret: null,
        created_at,
        sig: { alg: 'bip322', pubkey: voter, value: '' },
    };
    b.sig.value = signMessage(voter, ballotId(b), key);
    return b;
}
const aliceYes = ballot(ALICE, kAlice, 'yes', '2026-10-10T00:00:00Z');
// Alice's re-vote: under `latest` this is the one that counts.
const aliceNo = ballot(ALICE, kAlice, 'no', '2026-10-12T00:00:00Z');
const bobNo = ballot(BOB, kBob, 'no', '2026-10-11T00:00:00Z');
const carolYes = ballot(CAROL, kCarol, 'yes', '2026-10-13T00:00:00Z');

const DAY = 86_400;
const T0 = Date.parse('2026-10-10T00:00:00Z') / 1000;
/** A ballot as its voter's client publishes it: a fresh key per event. */
const asEvent = (b: Ballot, at: number) => signAt(buildBallotEvent(b), at);
const pollEvent = buildPollEvent(poll);
const aliceYesEv = asEvent(aliceYes, T0);
const bobNoEv = asEvent(bobNo, T0 + DAY);
const aliceNoEv = asEvent(aliceNo, T0 + 2 * DAY);
const carolYesEv = asEvent(carolYes, T0 + 3 * DAY);
const genuine = [pollEvent, aliceYesEv, bobNoEv, aliceNoEv, carolYesEv];

// The flood: dated after every genuine ballot, 100 events in one second from
// one key, each under its own d, and fresh-key copies, dated later still, of
// the genuine ballots it wants counted (Alice's first vote and Carol's).
const FLOOD_AT = T0 + 30 * DAY;
const flooder = freshKey();
const filler = Array.from({ length: 100 }, (_, i) =>
    signAt({ kind: 30081, tags: [['d', `oc-vote:ballot:${pid}:filler-${i}`], ['t', pid]], content: '{}' }, FLOOD_AT, flooder)
);
const keptCopies = [asEvent(aliceYes, FLOOD_AT + 1), asEvent(carolYes, FLOOD_AT + 1)];
/** 150 newer events from one key, a second apart: one page and half of the next. */
const staggered = Array.from({ length: 150 }, (_, i) =>
    signAt({ kind: 30081, tags: [['d', `oc-vote:ballot:${pid}:staggered-${i}`], ['t', pid]], content: '{}' }, FLOOD_AT + 10 + i, flooder)
);
/** 100 newer events whose signatures fail: a relay sends them, nostr-core rejects them. */
const badSig = (e: NostrEvent): NostrEvent => ({ ...e, sig: e.sig.slice(0, -2) + (e.sig.endsWith('00') ? '11' : '00') });
const rejected = Array.from({ length: 100 }, (_, i) =>
    badSig(signAt({ kind: 30081, tags: [['d', `oc-vote:ballot:${pid}:junk-${i}`], ['t', pid]], content: '{}' }, FLOOD_AT + 5, flooder))
);

/** What the poll's ballots say: Alice's re-vote, Bob and Carol. */
const TRUTH = {
    state: 'tallied',
    tallies: { yes: 50_000, no: 400_000 },
    counted: [ballotId(aliceNo), ballotId(bobNo), ballotId(carolYes)].sort(),
};

function matches(e: NostrEvent, f: Record<string, unknown>): boolean {
    if (Array.isArray(f.kinds) && !f.kinds.includes(e.kind)) return false;
    if (Array.isArray(f.ids) && !f.ids.includes(e.id)) return false;
    if (typeof f.since === 'number' && e.created_at < f.since) return false;
    if (typeof f.until === 'number' && e.created_at > f.until) return false;
    for (const [k, v] of Object.entries(f)) {
        if (!k.startsWith('#') || !Array.isArray(v)) continue;
        if (!e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1]))) return false;
    }
    return true;
}

/** Addressable kinds: one event per (kind, pubkey, d), the newest. */
function held(events: NostrEvent[]): NostrEvent[] {
    const latest = new Map<string, NostrEvent>();
    for (const e of events) {
        const key = `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
        const prev = latest.get(key);
        if (!prev || e.created_at > prev.created_at) latest.set(key, e);
    }
    return [...latest.values()];
}

/** How a relay stops answering: it goes quiet, drops the socket, or sends CLOSED. */
type Stop = 'hang' | 'drop' | 'closed';
/** A relay's events, 'hang' (never answers), 'down' (refuses), or events it stops answering for on a ballot page. */
type RelaySpec = NostrEvent[] | 'down' | 'hang' | { events: NostrEvent[]; stopOnBallotPage: number; partial: number; stop: Stop };
const closers: Array<() => Promise<void>> = [];

/** A relay at 127.0.0.1, as `spec` says. */
async function relay(spec: RelaySpec): Promise<string> {
    if (spec === 'down') {
        const s = createNetServer();
        await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
        const { port } = s.address() as AddressInfo;
        await new Promise((r) => s.close(r));
        return `ws://127.0.0.1:${port}`;
    }
    const stop = spec !== 'hang' && !Array.isArray(spec) ? spec : null;
    const events = spec === 'hang' ? [] : held(Array.isArray(spec) ? spec : spec.events);
    let ballotPages = 0;
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((r) => wss.once('listening', r));
    wss.on('connection', (ws) => {
        ws.on('message', (raw) => {
            const msg = JSON.parse(String(raw)) as unknown[];
            if (spec === 'hang' || msg[0] !== 'REQ') return;
            const [, sub, ...filters] = msg as [string, string, ...Record<string, unknown>[]];
            for (const f of filters) {
                const cap = Math.min(typeof f.limit === 'number' ? f.limit : CAP, CAP);
                const out = events
                    .filter((e) => matches(e, f))
                    .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : 1))
                    .slice(0, cap);
                const page = Array.isArray(f.kinds) && f.kinds.includes(30081) ? ++ballotPages : 0;
                if (stop && page >= stop.stopOnBallotPage) {
                    // Stops answering: some of this page, then no EOSE.
                    out.slice(0, stop.partial).forEach((e) => ws.send(JSON.stringify(['EVENT', sub, e])));
                    if (stop.stop === 'closed') ws.send(JSON.stringify(['CLOSED', sub, 'error: shutting down']));
                    if (stop.stop === 'drop') ws.terminate();
                    return;
                }
                out.forEach((e) => ws.send(JSON.stringify(['EVENT', sub, e])));
            }
            ws.send(JSON.stringify(['EOSE', sub]));
        });
    });
    closers.push(
        () =>
            new Promise<void>((r) => {
                for (const c of wss.clients) c.terminate();
                wss.close(() => r());
            })
    );
    return `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
}

let mempool: Server;
let mempoolBase = '';
const outside: string[] = [];

beforeAll(async () => {
    // A tip that buries the snapshot, and each voter's coins.
    mempool = createServer((req, res) => {
        const url = req.url ?? '';
        if (url === '/blocks/tip/height') return void res.end('900100');
        const m = /^\/address\/([^/]+)\/utxo$/.exec(url);
        if (!m) return void res.writeHead(404).end();
        const value = SATS[m[1]!];
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(value ? [{ txid: '00'.repeat(32), vout: 0, value, status: { confirmed: true, block_height: 800_000 } }] : []));
    });
    await new Promise<void>((r) => mempool.listen(0, '127.0.0.1', r));
    mempoolBase = `http://127.0.0.1:${(mempool.address() as AddressInfo).port}`;

    // Anything that would leave 127.0.0.1 is recorded, and fails the run below.
    const NativeWebSocket = globalThis.WebSocket;
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal(
        'WebSocket',
        class extends NativeWebSocket {
            constructor(url: string | URL, protocols?: string | string[]) {
                if (!String(url).startsWith('ws://127.0.0.1:')) outside.push(String(url));
                super(url, protocols);
            }
        }
    );
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.startsWith('http://127.0.0.1:')) outside.push(url);
        return nativeFetch(input, init);
    });
});

afterEach(async () => {
    closeRelayPool();
    await Promise.all(closers.splice(0).map((c) => c()));
});

afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise((r) => mempool.close(r));
    expect(outside).toEqual([]);
});

/** `oc-vote tally --json` over these relays: what it counted, or the error it stopped on. */
async function tallyOver(specs: RelaySpec[]) {
    const relays = await Promise.all(specs.map(relay));
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        await runTally({ pollId: pid, relays, mempoolBase, json: true });
        const r = JSON.parse(out.join('')) as { state: string; tallies: unknown; counted: string[] };
        return { state: r.state, tallies: r.tallies, counted: r.counted };
    } catch (e) {
        return { error: (e as Error).message, stdout: out.join('') };
    } finally {
        spy.mockRestore();
    }
}

const honest = () => [...genuine];
/** A relay Alice's re-vote did not reach. */
const withoutRevote = () => genuine.filter((e) => e !== aliceNoEv);

describe('oc-vote tally over strfry-like relays (clock-dated poll)', { timeout: 60_000 }, () => {
    it('a clean poll read in full on 5 of 5 relays is tallied', async () => {
        expect(await tallyOver([honest(), honest(), honest(), honest(), honest()])).toEqual(TRUTH);
    });

    it('at the floor, 4 of 5 with one relay down, it is tallied the same, even for a re-vote only two relays hold', async () => {
        // The re-vote reached the fourth relay and the one that is down. Four
        // answering plus two holding exceeds five, so one holder answered.
        const r = await tallyOver([withoutRevote(), withoutRevote(), withoutRevote(), honest(), 'down']);
        expect(r).toEqual(TRUTH);
    });

    it("a flood on every relay that would change the counted set: can't count, not a different tally", async () => {
        const flooded = () => [...genuine, ...filler, ...keptCopies];
        const r = await tallyOver([flooded(), flooded(), flooded(), flooded(), flooded()]);
        expect(r).toEqual({
            error: expect.stringMatching(/^can't count: the ballot lookup was cut short on (ws:\/\/127\.0\.0\.1:\d+(, )?){5}, so ballots may be missing/),
            stdout: '',
        });
    });

    it('100 same-second events on one relay hold the count, though the other four finished', async () => {
        const r = await tallyOver([honest(), honest(), honest(), honest(), [...genuine, ...filler]]);
        expect(r).toEqual({
            error: expect.stringMatching(/^can't count: the ballot lookup was cut short on ws:\/\/127\.0\.0\.1:\d+, so ballots/),
            stdout: '',
        });
    });

    // The re-vote sits behind 150 newer events on one relay alone; the other
    // four read to the end, so the floor alone would pass this read.
    for (const [stop, partial] of [['hang', 20], ['drop', 10], ['closed', 0]] as const) {
        it(`a relay that alone holds a re-vote and stops on page 2 (${stop}, after ${partial} events) holds the count`, async () => {
            const stops = { events: [...genuine, ...staggered], stopOnBallotPage: 2, partial, stop };
            const r = await tallyOver([withoutRevote(), withoutRevote(), withoutRevote(), withoutRevote(), stops]);
            expect(r).toEqual({
                error: expect.stringMatching(/^can't count: the ballot lookup was cut short on ws:\/\/127\.0\.0\.1:\d+, so ballots/),
                stdout: '',
            });
        });
    }

    it("a page of 100 events nostr-core rejects, newer than the ballots, on every relay: can't count, not zero ballots", async () => {
        const junked = () => [...genuine, ...rejected];
        const r = await tallyOver([junked(), junked(), junked(), junked(), junked()]);
        expect(r).toEqual({
            error: expect.stringMatching(/^can't count: the ballot lookup was cut short on (ws:\/\/127\.0\.0\.1:\d+(, )?){5}, so ballots/),
            stdout: '',
        });
    });

    it("below the floor, one relay timing out and one refusing, it can't count", async () => {
        // The re-vote reached only the two that do not answer.
        const r = await tallyOver([withoutRevote(), withoutRevote(), withoutRevote(), 'hang', 'down']);
        expect(r).toEqual({
            error: expect.stringMatching(/^can't count: the ballot lookup finished on 3 of 5 relays, fewer than the 4 a count needs/),
            stdout: '',
        });
    });
});

// A secret poll whose creator revealed after the deadline, and junk under the
// reveal's d-tag from fresh keys, dated after the reveal: a read that cannot
// get past the junk did not see the reveal, so it is no answer, never
// "awaiting reveal" as if the creator had not revealed.
const REVEAL_SK = '55'.repeat(32);
const secretPoll: Poll = {
    ...poll,
    question: 'Ship it, secretly?',
    mode: 'secret',
    reveal_pk: bytesToHex(x25519.getPublicKey(hexToBytes(REVEAL_SK))),
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
secretPoll.sig.value = signMessage(CREATOR, pollId(secretPoll), kCreator);
const spid = pollId(secretPoll);
const reveal: Reveal = {
    v: 0,
    kind: 'oc-vote/reveal',
    poll_id: spid,
    reveal_sk: REVEAL_SK,
    revealed_at: '2026-10-22T00:00:00Z',
    sig: { alg: 'bip322', pubkey: CREATOR, value: '' },
};
reveal.sig.value = signMessage(CREATOR, revealId(reveal), kCreator);
const secretPollEvent = buildPollEvent(secretPoll);
const revealEvent = signAt(buildRevealEvent(reveal), T0 + 12 * DAY);
/** n events under the reveal's d-tag, each from its own key, all in one second after the reveal. */
const revealJunk = (n: number) =>
    Array.from({ length: n }, () =>
        signAt({ kind: 30082, tags: [['d', `oc-vote:reveal:${spid}`], ['t', spid]], content: '{}' }, FLOOD_AT)
    );

async function secretTallyOver(specs: RelaySpec[]) {
    const relays = await Promise.all(specs.map(relay));
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        await runTally({ pollId: spid, relays, mempoolBase, json: true });
        const r = JSON.parse(out.join('')) as { state: string; reveal_present: boolean };
        return { state: r.state, reveal_present: r.reveal_present };
    } catch (e) {
        return { error: (e as Error).message };
    } finally {
        spy.mockRestore();
    }
}

describe('oc-vote tally reads the reveal in full, or says it cannot count', { timeout: 60_000 }, () => {
    it('a reveal read in full is counted', async () => {
        const r = await secretTallyOver(Array.from({ length: 5 }, () => [secretPollEvent, revealEvent]));
        expect(r).toEqual({ state: 'tallied', reveal_present: true });
    });

    it("500 junk events in one second after the reveal, on every relay: can't count, never awaiting reveal", async () => {
        const junk = revealJunk(500);
        const r = await secretTallyOver(Array.from({ length: 5 }, () => [secretPollEvent, revealEvent, ...junk]));
        expect(r).toEqual({ error: expect.stringMatching(/^can't count: the reveal lookup was cut short on /) });
    });
});
