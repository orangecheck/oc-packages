// SPEC §3: a deferred snapshot is "the block whose median_time_past is the
// greatest value ≤ deadline and has ≥ 6 confirmations"; §10.5 applies the
// same confirmation floor to a numeric snapshot.

import { describe, expect, it } from 'vitest';

import {
    MIN_SNAPSHOT_CONFIRMATIONS,
    mempoolBlockTimeSource,
    resolveDeadlineSnapshot,
    resolvePollSnapshot,
    type BlockTimeSource,
} from './snapshot.js';

const DEADLINE = '2026-06-01T00:00:00Z';
const DEADLINE_TS = Math.floor(Date.parse(DEADLINE) / 1000);

/** median_time_past rises 600s per block and block 1000 lands exactly on the
 *  deadline, so 1000 is the greatest qualifying height. */
function chain(tip: number, seed = 1005): BlockTimeSource {
    return {
        blockHeightAtTimestamp: async () => seed,
        medianTimePast: async (h) => {
            if (h > tip) throw new Error('no such block');
            return DEADLINE_TS + (h - 1000) * 600;
        },
        tipHeight: async () => tip,
    };
}

describe('resolveDeadlineSnapshot (SPEC §3)', () => {
    it('walks down from a seed past the deadline', async () => {
        expect(await resolveDeadlineSnapshot(DEADLINE, chain(1100, 1005))).toMatchObject({
            ok: true,
            height: 1000,
        });
    });

    it('walks up to the greatest qualifying height', async () => {
        expect(await resolveDeadlineSnapshot(DEADLINE, chain(1100, 990))).toMatchObject({
            ok: true,
            height: 1000,
        });
    });

    it('takes the block ON the deadline, not the one before (median_time_past ≤ deadline)', async () => {
        const src = chain(1100, 1000);
        const r = await resolveDeadlineSnapshot(DEADLINE, src);
        expect(r).toMatchObject({ ok: true, height: 1000 });
        expect(await src.medianTimePast(1000)).toBe(DEADLINE_TS);
        expect(await src.medianTimePast(1001)).toBeGreaterThan(DEADLINE_TS);
    });

    it('is the same wherever the seed lands', async () => {
        const heights = [];
        for (const seed of [980, 995, 1000, 1003, 1010]) {
            const r = await resolveDeadlineSnapshot(DEADLINE, chain(1100, seed));
            heights.push(r.ok ? r.height : 'ERR');
        }
        expect(heights).toEqual([1000, 1000, 1000, 1000, 1000]);
    });

    it('defers with E_REORG while the snapshot has fewer than 6 confirmations', async () => {
        expect(await resolveDeadlineSnapshot(DEADLINE, chain(1004, 1004))).toMatchObject({
            ok: false,
            code: 'E_REORG',
        });
    });

    it('accepts exactly at the confirmation floor', async () => {
        expect(
            await resolveDeadlineSnapshot(DEADLINE, chain(1000 + MIN_SNAPSHOT_CONFIRMATIONS - 1))
        ).toMatchObject({ ok: true, height: 1000, confirmations: MIN_SNAPSHOT_CONFIRMATIONS });
    });

    it('fails closed on an unparseable deadline', async () => {
        expect(await resolveDeadlineSnapshot('not-a-date', chain(1100))).toMatchObject({
            ok: false,
            code: 'E_SNAPSHOT_UNRESOLVED',
        });
    });

    it('fails closed when the explorer errors', async () => {
        const broken: BlockTimeSource = {
            blockHeightAtTimestamp: async () => {
                throw new Error('explorer down');
            },
            medianTimePast: async () => 0,
            tipHeight: async () => 1100,
        };
        expect(await resolveDeadlineSnapshot(DEADLINE, broken)).toMatchObject({
            ok: false,
            code: 'E_SNAPSHOT_UNRESOLVED',
        });
    });

    it('fails closed rather than walking forever', async () => {
        const runaway: BlockTimeSource = {
            blockHeightAtTimestamp: async () => 5000,
            medianTimePast: async () => DEADLINE_TS + 999_999,
            tipHeight: async () => 5000,
        };
        expect(await resolveDeadlineSnapshot(DEADLINE, runaway)).toMatchObject({
            ok: false,
            code: 'E_SNAPSHOT_UNRESOLVED',
        });
    });
});

describe('resolvePollSnapshot', () => {
    it('resolves "deadline" by §3', async () => {
        expect(
            await resolvePollSnapshot({ snapshot_block: 'deadline', deadline: DEADLINE }, chain(1100))
        ).toMatchObject({ ok: true, height: 1000 });
    });

    it('keeps a numeric snapshot and checks its confirmations', async () => {
        const poll = { snapshot_block: 950, deadline: DEADLINE };
        expect(await resolvePollSnapshot(poll, chain(1100))).toMatchObject({ ok: true, height: 950 });
        expect(await resolvePollSnapshot(poll, chain(952))).toMatchObject({ ok: false, code: 'E_REORG' });
    });
});

/** A mempool.space REST API over the same fixture chain. */
function fixtureFetch(tip: number, seed = 1005) {
    const calls: string[] = [];
    const reply = (status: number, body: string) =>
        ({ ok: status === 200, status, text: async () => body }) as Response;
    const f = async (url: string) => {
        calls.push(url);
        const path = url.replace('https://mempool.space/api', '');
        if (path === '/blocks/tip/height') return reply(200, String(tip));
        let m = path.match(/^\/v1\/mining\/blocks\/timestamp\/(\d+)$/);
        if (m) return reply(200, JSON.stringify({ height: seed, timestamp: Number(m[1]) }));
        m = path.match(/^\/block-height\/(\d+)$/);
        if (m) return Number(m[1]) > tip ? reply(404, 'Block not found') : reply(200, `hash${m[1]}`);
        m = path.match(/^\/block\/hash(\d+)$/);
        if (m) return reply(200, JSON.stringify({ mediantime: DEADLINE_TS + (Number(m[1]) - 1000) * 600 }));
        return reply(404, 'not found');
    };
    return { fetch: f as unknown as typeof fetch, calls };
}

describe('mempoolBlockTimeSource', () => {
    it('resolves the fixture chain through the REST shapes', async () => {
        const { fetch, calls } = fixtureFetch(1100);
        const r = await resolveDeadlineSnapshot(DEADLINE, mempoolBlockTimeSource({ fetch }));
        expect(r).toMatchObject({ ok: true, height: 1000, confirmations: 101 });
        expect(calls).toContain(`https://mempool.space/api/v1/mining/blocks/timestamp/${DEADLINE_TS}`);
    });

    it('stops the upward walk at the tip (404 on the next block)', async () => {
        const { fetch } = fixtureFetch(1000, 995);
        expect(await resolveDeadlineSnapshot(DEADLINE, mempoolBlockTimeSource({ fetch }))).toMatchObject({
            ok: false,
            code: 'E_REORG',
        });
    });
});
