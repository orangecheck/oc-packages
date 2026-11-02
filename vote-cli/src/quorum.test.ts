// A ballot is in only once two relays, each asked alone, serve a valid copy of
// it back (min(2, asked), the write quorum the count's read floor assumes). An
// OK is not enough. The relays here are in memory and answer like real ones
// (newest first, `limit` and `until` honoured) but send whatever they hold,
// forged copies included, so the read-back's own checks are what keep those out.
// cast.test.ts drives the same rule through `oc-vote vote` over real sockets.

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { matchFilter, type Filter, type QueryResult } from '@orangecheck/nostr-core';
import { ballotId, type Ballot } from '@orangecheck/vote-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildBallotEvent } from './events.js';
import type { NostrEvent, PublishResult } from './nostr.js';
import { ballotIsIn, castBallot, relaysServingBallot, writeQuorum } from './quorum.js';

const [A, B, C, D] = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
const RELAYS = [A, B, C, D, 'wss://e'];

const kVoter = '22'.repeat(32);
const kStranger = '33'.repeat(32);
const VOTER = addressFromPrivateKey(kVoter, 'p2wpkh');
const STRANGER = addressFromPrivateKey(kStranger, 'p2wpkh');
const PID = 'cd'.repeat(32);

const ballot: Ballot = {
    v: 0,
    kind: 'oc-vote/ballot',
    poll_id: PID,
    voter: VOTER,
    option: 'yes',
    attestation_id: null,
    secret: null,
    created_at: '2026-11-01T12:00:00Z',
    sig: { alg: 'bip322', pubkey: VOTER, value: '' },
};
ballot.sig.value = signMessage(VOTER, ballotId(ballot), kVoter);
const event = buildBallotEvent(ballot);

/** The same ballot under its own id, with a well-formed signature by someone else. */
function junkSigCopy(): NostrEvent {
    const junk = { ...ballot, sig: { ...ballot.sig, value: signMessage(STRANGER, ballotId(ballot), kStranger) } };
    expect(ballotId(junk)).toBe(ballotId(ballot));
    return buildBallotEvent(junk);
}

/** The real event with its Nostr signature broken: id and content unchanged. */
function badNostrSig(): NostrEvent {
    const last = event.sig.slice(-1) === '0' ? '1' : '0';
    return { ...event, sig: event.sig.slice(0, -1) + last };
}

/** `e` re-signed by a fresh key and dated `at`. */
function signAt(e: NostrEvent, at: number): NostrEvent {
    const sk = schnorr.utils.randomPrivateKey();
    const pubkey = bytesToHex(schnorr.getPublicKey(sk));
    const id = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([0, pubkey, at, e.kind, e.tags, e.content]))));
    return { ...e, id, pubkey, created_at: at, sig: bytesToHex(schnorr.sign(hexToBytes(id), sk)) };
}

type Mode = 'keep' | 'drop' | 'down';

/**
 * Five relays. On publish each one keeps the event, says OK and keeps nothing
 * (`drop`), or is down. `held` is what each serves; a relay in `silent` never
 * answers a read. Each read's relays and budget are logged.
 */
function relays(modes: Partial<Record<string, Mode>> = {}) {
    const r = {
        modes,
        held: new Map<string, NostrEvent[]>(RELAYS.map((u) => [u, []])),
        silent: new Set<string>(),
        published: [] as { relay: string; event: NostrEvent }[],
        reads: [] as { relays: readonly string[]; timeoutMs?: number }[],
        publish: async (ev: NostrEvent, asked: readonly string[]): Promise<PublishResult[]> =>
            asked.map((relay) => {
                const mode = r.modes[relay] ?? 'drop';
                if (mode === 'down') return { relay, ok: false, reason: 'down', attempts: 1 };
                r.published.push({ relay, event: ev });
                if (mode === 'keep') r.held.get(relay)!.push(ev);
                return { relay, ok: true, attempts: 1 };
            }),
        query: async (filter: Filter, asked: readonly string[], timeoutMs?: number): Promise<QueryResult> => {
            r.reads.push({ relays: asked, timeoutMs });
            const byId = new Map<string, NostrEvent>();
            const relayStatus = asked.map((relay) => {
                if (r.silent.has(relay)) return { relay, ok: false, eose: false, events: 0, rejected: 0, reason: 'timeout' };
                const sent = (r.held.get(relay) ?? [])
                    .filter((e) => matchFilter(e, filter))
                    .sort((x, y) => y.created_at - x.created_at)
                    .slice(0, filter.limit ?? Infinity);
                for (const e of sent) byId.set(`${relay} ${e.id} ${e.sig}`, e);
                return { relay, ok: true, eose: true, events: sent.length, rejected: 0 };
            });
            return { events: [...byId.values()], relayStatus };
        },
    };
    return r;
}

const opts = (r: ReturnType<typeof relays>) => ({ relays: RELAYS, publish: r.publish, query: r.query });

afterEach(() => vi.restoreAllMocks());

describe('the read-back after publishing a ballot', () => {
    it('is in at 2 relays serving it back, not at 0 or 1, though all 5 say OK', async () => {
        for (const n of [0, 1, 2]) {
            const r = relays(Object.fromEntries(RELAYS.map((u, i) => [u, i < n ? 'keep' : 'drop'])));
            const serving = await castBallot(event, ballot, [], opts(r));
            expect(r.published).toHaveLength(5);
            expect(serving).toEqual(RELAYS.slice(0, n));
            expect(ballotIsIn(serving.length, RELAYS.length)).toBe(n >= 2);
        }
    });

    it('needs min(2, asked): one relay asked must serve it itself, and none asked is never in', async () => {
        expect([0, 1, 2, 5].map(writeQuorum)).toEqual([1, 1, 2, 2]);
        const r = relays({ [A]: 'keep' });
        const serving = await castBallot(event, ballot, [], { ...opts(r), relays: [A] });
        expect(serving).toEqual([A]);
        expect(ballotIsIn(serving.length, 1)).toBe(true);
        expect(ballotIsIn(0, 0)).toBe(false);
    });

    it('does not count a copy under the ballot’s id with a junk signature', async () => {
        const r = relays({ [A]: 'keep' });
        r.held.get(B)!.push(junkSigCopy());
        expect(await castBallot(event, ballot, [], opts(r))).toEqual([A]);
    });

    it('does not count a copy whose Nostr signature does not hold', async () => {
        const r = relays({ [A]: 'keep' });
        r.held.get(C)!.push(badNostrSig());
        expect(await castBallot(event, ballot, [], opts(r))).toEqual([A]);
    });

    it('does not count the voter’s other ballot, validly signed, under the same d-tag', async () => {
        // The voter's earlier ballot: same poll, same voter, its own ballot_id.
        const earlier: Ballot = { ...ballot, option: 'no', created_at: '2026-11-01T11:00:00Z', sig: { ...ballot.sig } };
        earlier.sig.value = signMessage(VOTER, ballotId(earlier), kVoter);
        expect(ballotId(earlier)).not.toBe(ballotId(ballot));
        const r = relays({ [A]: 'keep' });
        r.held.get(B)!.push(buildBallotEvent(earlier));
        expect(await castBallot(event, ballot, [], opts(r))).toEqual([A]);
    });

    it('counts a valid copy of the ballot in another event, matched by ballot_id', async () => {
        const r = relays({ [A]: 'keep' });
        r.held.get(D)!.push(buildBallotEvent(ballot));
        expect(await castBallot(event, ballot, [], opts(r))).toEqual([A, D]);
    });

    it('adds up tries that land on different relays while the earlier ones still serve it', async () => {
        const r = relays({ [A]: 'keep' });
        const first = await castBallot(event, ballot, [], opts(r));
        expect(first).toEqual([A]);
        // Sent again to the relays that did not serve it; B keeps it, and A still serves it.
        r.modes = { [B]: 'keep' };
        const sent = r.published.length;
        const second = await castBallot(event, ballot, first, opts(r));
        expect(second).toEqual([A, B]);
        expect(ballotIsIn(second.length, RELAYS.length)).toBe(true);
        expect(r.published.slice(sent).map((p) => p.relay)).toEqual(RELAYS.filter((u) => u !== A));
        // One event, sent again as it was: nothing new to sign.
        expect(new Set(r.published.map((p) => JSON.stringify(p.event)))).toEqual(new Set([JSON.stringify(event)]));
    });

    it('asks every relay again on each try: one that has dropped the ballot no longer counts', async () => {
        const r = relays({ [A]: 'keep' });
        const first = await castBallot(event, ballot, [], opts(r));
        expect(first).toEqual([A]);
        r.held.set(A, []);
        r.modes = { [B]: 'keep' };
        const second = await castBallot(event, ballot, first, opts(r));
        expect(second).toEqual([B]);
        expect(ballotIsIn(second.length, RELAYS.length)).toBe(false);
    });

    it('asks each relay alone: one relay’s answer never speaks for another', async () => {
        // A holds the ballot; B answers in full, with only forged copies; the rest hold nothing.
        const r = relays();
        r.held.get(A)!.push(event);
        r.held.get(B)!.push(junkSigCopy(), badNostrSig());
        expect(await relaysServingBallot(ballot, { relays: RELAYS, query: r.query })).toEqual([A]);
        expect(r.reads.length).toBeGreaterThanOrEqual(RELAYS.length);
        expect(r.reads.every((q) => q.relays.length === 1)).toBe(true);
        expect(new Set(r.reads.map((q) => q.relays[0]))).toEqual(new Set(RELAYS));
    });

    it('gives each relay one deadline for its whole read-back, not a fresh one per page', async () => {
        // Under the voter's d-tag A holds 600 newer events before the ballot and
        // takes 6 s a page; B and C hold the ballot and answer at once.
        const r = relays({ [A]: 'keep', [B]: 'keep', [C]: 'keep' });
        await r.publish(event, [A, B, C]);
        const flood = Array.from({ length: 600 }, (_, i) =>
            signAt({ ...event, content: '{}' }, event.created_at + 1 + i)
        );
        r.held.get(A)!.push(...flood);
        let now = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const budgets = new Map<string, number[]>();
        const slowA = async (f: Filter, asked: readonly string[], timeoutMs?: number) => {
            const url = asked.join(' ');
            budgets.set(url, [...(budgets.get(url) ?? []), timeoutMs as number]);
            if (url === A) now += 6000;
            return r.query(f, asked, timeoutMs);
        };
        const serving = await relaysServingBallot(ballot, { relays: RELAYS, query: slowA });
        // 16 s for A's whole read: 8 s, 8 s (10 left), the 4 s that remain, then none.
        expect(budgets.get(A)).toEqual([8000, 8000, 4000]);
        // The others each get their own, and A holding on does not cost them.
        for (const u of RELAYS.slice(1)) expect(budgets.get(u)).toEqual([8000]);
        expect(serving).toEqual([B, C]);
    });
});
