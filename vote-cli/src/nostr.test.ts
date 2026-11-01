// Absence is only evidence once a relay has finished answering (EOSE).

import { describe, expect, it } from 'vitest';

import { fetchBallotEvents, reachedEose, readFloor, type NostrEvent, type QueryFn } from './nostr.js';
import { ballotsToCount, findPoll, requireComplete } from './select.js';

const st = (ok: boolean, eose: boolean, reason?: string) => ({
    relay: 'wss://r',
    ok,
    eose,
    events: 1,
    rejected: 0,
    ...(reason ? { reason } : {}),
});
const verify = () => true;
const PID = 'ab'.repeat(32);

describe('reachedEose', () => {
    it('is true when a relay sent EOSE', () => {
        expect(reachedEose([st(false, false, 'timeout'), st(true, true)])).toBe(true);
    });

    it('is false when relays are ok only because they timed out or closed after sending events', () => {
        expect(reachedEose([st(true, false, 'timeout'), st(true, false, 'closed')])).toBe(false);
    });

    it('is false with no relays', () => {
        expect(reachedEose([])).toBe(false);
    });
});

describe('findPoll / requireComplete', () => {
    it('says "not found" only when a relay finished answering', async () => {
        await expect(findPoll({ events: [], complete: true }, PID, verify)).rejects.toThrow(
            /poll not found/
        );
    });

    it('says the answer is incomplete, not "not found", when no relay reached EOSE', async () => {
        await expect(findPoll({ events: [], complete: false }, PID, verify)).rejects.toThrow(
            /no relay finished answering/
        );
    });

    it('refuses an incomplete ballot set and passes a complete one through', () => {
        expect(() => requireComplete({ events: [], complete: false }, 'ballot')).toThrow(
            /no relay finished answering the ballot query/
        );
        expect(requireComplete({ events: [], complete: true }, 'ballot')).toEqual([]);
    });
});

/**
 * Relays that answer like strfry: newest first, `until` and `limit` honoured,
 * at most 500 per REQ, then EOSE. A relay in `silent` never sends EOSE.
 */
const strfry = (byRelay: Record<string, NostrEvent[]>, silent: string[] = []): QueryFn =>
    (async (filter, relays) => {
        const relay = relays[0]!;
        if (silent.includes(relay)) return { events: [], relayStatus: [{ relay, ok: false, eose: false, events: 0, rejected: 0 }] };
        const events = (byRelay[relay] ?? [])
            .filter((e) => filter.until === undefined || e.created_at <= filter.until)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, Math.min(filter.limit ?? 500, 500));
        return { events, relayStatus: [{ relay, ok: true, eose: true, events: events.length, rejected: 0 }] };
    }) as QueryFn;
let n = 0;
const at = (created_at: number) => ({ id: `e${n++}`, created_at, kind: 30081, tags: [['t', PID]], content: '{}' }) as unknown as NostrEvent;
const FIVE = ['wss://a', 'wss://b', 'wss://c', 'wss://d', 'wss://e'];
const ballots = () => [at(100), at(200), at(300)];

describe('a paged ballot read: cut off is no answer, and a count needs the floor', () => {
    it('the floor is all but one relay: 4 of 5', () => {
        expect([5, 4, 3, 2, 1, 0].map(readFloor)).toEqual([4, 3, 2, 1, 1, 1]);
    });

    it('a relay whose page is all one second is cut off, not answered, and the read is incomplete', async () => {
        const flooded = [...ballots(), ...Array.from({ length: 100 }, () => at(5_000))];
        const r = await fetchBallotEvents(PID, ['wss://a'], strfry({ 'wss://a': flooded }));
        expect(r.relays).toEqual([{ relay: 'wss://a', answered: false, truncated: true }]);
        expect(r.complete).toBe(false);
        expect(() => requireComplete(r, 'ballot')).toThrow(/^can't count: the ballot lookup was cut short on wss:\/\/a, so ballots may be missing/);
    });

    it('a relay still sending full pages after MAX_PAGES is cut off, not answered', async () => {
        const flooded = [...ballots(), ...Array.from({ length: 2_100 }, (_, i) => at(10_000 + i))];
        const r = await fetchBallotEvents(PID, ['wss://a'], strfry({ 'wss://a': flooded }));
        expect(r.relays).toEqual([{ relay: 'wss://a', answered: false, truncated: true }]);
        expect(r.complete).toBe(false);
    });

    it('one relay cut off makes the read incomplete, though the other four finished', async () => {
        const byRelay = Object.fromEntries(FIVE.map((r) => [r, ballots()]));
        byRelay['wss://e'] = [...ballots(), ...Array.from({ length: 100 }, () => at(5_000))];
        const r = await fetchBallotEvents(PID, FIVE, strfry(byRelay));
        expect(r.complete).toBe(false);
        expect(() => requireComplete(r, 'ballot')).toThrow(/cut short on wss:\/\/e,/);
    });

    it('3 of 5 finishing is below the floor; 4 of 5 meets it', async () => {
        const shared = ballots();
        const byRelay = Object.fromEntries(FIVE.map((r) => [r, shared]));
        const three = await fetchBallotEvents(PID, FIVE, strfry(byRelay, ['wss://d', 'wss://e']));
        expect(three.complete).toBe(false);
        expect(() => requireComplete(three, 'ballot')).toThrow(/finished on 3 of 5 relays, fewer than the 4 a count needs/);
        const four = await fetchBallotEvents(PID, FIVE, strfry(byRelay, ['wss://e']));
        expect(four.complete).toBe(true);
        expect(requireComplete(four, 'ballot')).toEqual([...shared].reverse());
    });
});

describe('ballotsToCount: what a tally counts from', () => {
    const cut = { events: [at(1)], complete: false, relays: [{ relay: 'wss://a', answered: false, truncated: true }] };
    const short = { events: [at(2)], complete: false, relays: FIVE.map((relay, i) => ({ relay, answered: i < 3, truncated: false })) };
    const silent = { events: [], complete: false, relays: FIVE.map((relay) => ({ relay, answered: false, truncated: false })) };

    it("a clock-dated poll can't count a read cut short or below the floor", () => {
        expect(() => ballotsToCount(cut, false)).toThrow(/^can't count: the ballot lookup was cut short/);
        expect(() => ballotsToCount(short, false)).toThrow(/^can't count: the ballot lookup finished on 3 of 5/);
    });

    it('an anchored poll counts it, for anchoredChain to hold provisional, unless no relay sent EOSE', () => {
        expect(ballotsToCount(cut, true)).toEqual(cut.events);
        expect(ballotsToCount(short, true)).toEqual(short.events);
        expect(() => ballotsToCount(silent, true)).toThrow(/no relay finished answering the ballot query/);
    });
});
