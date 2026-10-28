import { describe, expect, it } from 'vitest';

import { CHAT_RELAYS, meetsReadFloor, publishToQuorum, readFloor, WRITE_QUORUM, type WriteAck } from './read';

const st = (...eose: boolean[]) => eose.map((e) => ({ eose: e }));

describe('the read floor (§8.7), derived from the write quorum', () => {
    it('floor plus quorum exceeds the relays asked, and the floor never exceeds them', () => {
        for (let asked = 1; asked <= 12; asked++) {
            expect(readFloor(asked) + WRITE_QUORUM).toBeGreaterThan(asked);
            expect(readFloor(asked)).toBeLessThanOrEqual(asked);
            expect(readFloor(asked)).toBeGreaterThanOrEqual(1);
        }
    });

    it('is the smallest such floor: one less would let a write the quorum reached go unseen', () => {
        for (let asked = WRITE_QUORUM; asked <= 12; asked++) expect(readFloor(asked) - 1 + WRITE_QUORUM).toBe(asked);
    });

    it('with the 4 relays a reader asks by default, 3 must answer', () => {
        expect(readFloor(4)).toBe(3);
        expect(meetsReadFloor(st(true, true, true, false))).toBe(true);
        expect(meetsReadFloor(st(true, true, false, false))).toBe(false);
    });

    it('one relay asked needs that one; no relay asked never meets it', () => {
        expect(meetsReadFloor(st(true))).toBe(true);
        expect(meetsReadFloor(st(false))).toBe(false);
        expect(meetsReadFloor([])).toBe(false);
    });
});

describe('publishToQuorum: published once WRITE_QUORUM of the reference set hold it (§8.7)', () => {
    const R = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
    const MINE = ['wss://mine-1', 'wss://mine-2'];
    /** Relays that send OK from a given attempt on; each attempt records where it went. */
    const relays = (okBy: Record<string, number>) => {
        const sent: string[][] = [];
        let attempt = 0;
        const publish = async (to: readonly string[]): Promise<WriteAck[]> => {
            sent.push([...to]);
            attempt++;
            return to.map((relay) => ({ relay, ok: okBy[relay] !== undefined && okBy[relay] <= attempt }));
        };
        return { publish, sent };
    };
    const waits: number[] = [];
    const wait = async (ms: number) => {
        waits.push(ms);
    };

    it('the reference set is the four relays the reference reader asks', () => {
        expect(CHAT_RELAYS).toEqual(['wss://relay.ochk.io', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']);
    });

    it('two OKs from relays outside the reference set leave it not yet published', async () => {
        const { publish } = relays({ 'wss://mine-1': 1, 'wss://mine-2': 1 });
        expect(await publishToQuorum(publish, MINE, { reference: R, wait })).toEqual({ state: 'not yet published', held: [], missing: R });
        // The default reference set is CHAT_RELAYS, so the writer's own relays never count there either.
        expect((await publishToQuorum(relays({ 'wss://mine-1': 1, 'wss://mine-2': 1 }).publish, MINE, { wait })).state).toBe('not yet published');
    });

    it('writes go to the given relays and every reference relay; two reference OKs publish it, no retry', async () => {
        const { publish, sent } = relays({ 'wss://a': 1, 'wss://c': 1 });
        expect(await publishToQuorum(publish, MINE, { reference: R, wait })).toEqual({ state: 'published', held: ['wss://a', 'wss://c'], missing: ['wss://b', 'wss://d'] });
        expect(new Set(sent[0])).toEqual(new Set([...MINE, ...R]));
        expect(sent).toHaveLength(1);
    });

    it('one reference OK: retries only the reference relays without it, with backoff, until a second', async () => {
        waits.length = 0;
        const { publish, sent } = relays({ 'wss://a': 1, 'wss://d': 3 });
        const out = await publishToQuorum(publish, MINE, { reference: R, wait, backoffMs: 100 });
        expect(out).toMatchObject({ state: 'published', held: ['wss://a', 'wss://d'] });
        expect(sent.slice(1)).toEqual([['wss://b', 'wss://c', 'wss://d'], ['wss://b', 'wss://c', 'wss://d']]);
        expect(waits).toEqual([100, 200]);
    });

    it('with a read-back, an OK counts for nothing: only a reference relay that serves it back counts', async () => {
        const { publish } = relays({ 'wss://a': 1, 'wss://b': 1, 'wss://c': 1 });
        const serves = new Set(['wss://c']);
        const readBack = async (r: string) => serves.has(r);
        expect(await publishToQuorum(publish, [], { reference: R, wait, readBack, attempts: 1 })).toEqual({
            state: 'not yet published',
            held: ['wss://c'],
            missing: ['wss://a', 'wss://b', 'wss://d'],
        });
        serves.add('wss://d');
        expect((await publishToQuorum(publish, [], { reference: R, wait, readBack, attempts: 1 })).held).toEqual(['wss://c', 'wss://d']);
        // A read-back that fails counts as not held.
        const failing = async () => {
            throw new Error('timeout');
        };
        expect((await publishToQuorum(publish, [], { reference: R, wait, readBack: failing, attempts: 1 })).held).toEqual([]);
    });

    it('a reference set of one relay is never published, however it answers', async () => {
        const { publish } = relays({ 'wss://a': 1 });
        expect((await publishToQuorum(publish, [], { reference: ['wss://a'], wait })).state).toBe('not yet published');
    });
});
