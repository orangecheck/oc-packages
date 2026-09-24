// The CLI resolves a poll's snapshot through vote-core's §3 resolver. The web
// tallier's test (oc-vote-web src/lib/vote/snapshot.test.ts) runs the same
// fixture chain and expects the same heights, so the two cannot drift apart.

import type { Poll } from '@orangecheck/vote-core';
import { describe, expect, it } from 'vitest';

import { resolveSnapshot } from './commands/tally.js';

const DEADLINE = '2026-06-01T00:00:00Z';
const DEADLINE_TS = Math.floor(Date.parse(DEADLINE) / 1000);

/** mempool.space REST over a chain whose median_time_past rises 600s per
 *  block with block 1000 exactly on the deadline; tip 1100, seed 1005. */
const fixtureFetch = (async (url: string) => {
    const reply = (status: number, body: string) =>
        ({ ok: status === 200, status, text: async () => body }) as Response;
    const path = url.replace('https://mempool.space/api', '');
    if (path === '/blocks/tip/height') return reply(200, '1100');
    if (/^\/v1\/mining\/blocks\/timestamp\/\d+$/.test(path)) return reply(200, '{"height":1005}');
    let m = path.match(/^\/block-height\/(\d+)$/);
    if (m) return Number(m[1]) > 1100 ? reply(404, 'Block not found') : reply(200, `h${m[1]}`);
    m = path.match(/^\/block\/h(\d+)$/);
    if (m) return reply(200, JSON.stringify({ mediantime: DEADLINE_TS + (Number(m[1]) - 1000) * 600 }));
    return reply(404, 'not found');
}) as unknown as typeof fetch;

const poll = (snapshot_block: Poll['snapshot_block']) =>
    ({ snapshot_block, deadline: DEADLINE }) as Poll;

describe('resolveSnapshot (SPEC §3)', () => {
    it('resolves a deadline poll to the median-time-past block, not the tip', async () => {
        expect(await resolveSnapshot(poll('deadline'), {}, fixtureFetch)).toBe(1000);
    });

    it('keeps a buried numeric snapshot', async () => {
        expect(await resolveSnapshot(poll(1050), {}, fixtureFetch)).toBe(1050);
    });

    it('refuses a numeric snapshot with fewer than 6 confirmations', async () => {
        await expect(resolveSnapshot(poll(1098), {}, fixtureFetch)).rejects.toThrow(/E_REORG/);
    });
});
