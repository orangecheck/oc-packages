import { describe, expect, it } from 'vitest';

import { meetsReadFloor, publishToQuorum, readFloor, WRITE_QUORUM, type WriteAck } from './read';

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

describe('publishToQuorum: a write is published once WRITE_QUORUM relays sent OK', () => {
    const R = ['wss://a', 'wss://b', 'wss://c', 'wss://d'];
    /** A publisher whose relays answer OK by attempt; it records who each attempt went to. */
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

    it('two OKs on the first attempt: published, no retry', async () => {
        const { publish, sent } = relays({ 'wss://a': 1, 'wss://c': 1 });
        expect(await publishToQuorum(publish, R, { wait })).toEqual({ state: 'published', ok: ['wss://a', 'wss://c'], missing: ['wss://b', 'wss://d'] });
        expect(sent).toEqual([R]);
    });

    it('one OK: retries only the relays that have not, with backoff, until a second OKs', async () => {
        waits.length = 0;
        const { publish, sent } = relays({ 'wss://a': 1, 'wss://d': 3 });
        const out = await publishToQuorum(publish, R, { wait, backoffMs: 100 });
        expect(out.state).toBe('published');
        expect(out.ok).toEqual(['wss://a', 'wss://d']);
        expect(sent).toEqual([R, ['wss://b', 'wss://c', 'wss://d'], ['wss://b', 'wss://c', 'wss://d']]);
        expect(waits).toEqual([100, 200]);
    });

    it('one OK after every attempt: not yet published, naming the relays that have not', async () => {
        const { publish } = relays({ 'wss://b': 1 });
        expect(await publishToQuorum(publish, R, { wait })).toEqual({
            state: 'not yet published',
            ok: ['wss://b'],
            missing: ['wss://a', 'wss://c', 'wss://d'],
        });
    });

    it('a write to one relay is never published, however it answers', async () => {
        const { publish } = relays({ 'wss://a': 1 });
        expect((await publishToQuorum(publish, ['wss://a'], { wait })).state).toBe('not yet published');
    });

    it('an OK from a relay it did not write to counts for nothing', async () => {
        const publish = async (to: readonly string[]): Promise<WriteAck[]> => [
            ...to.slice(0, 1).map((relay) => ({ relay, ok: true })),
            { relay: 'wss://elsewhere', ok: true },
            { relay: to[0]!, ok: true },
        ];
        const out = await publishToQuorum(publish, ['wss://a', 'wss://b'], { wait, attempts: 1 });
        expect(out).toEqual({ state: 'not yet published', ok: ['wss://a'], missing: ['wss://b'] });
    });
});
