/**
 * readRelay and readSubject against a strfry-like relay: it answers a REQ with
 * the newest `limit` matches (capped at 500) at or before `until`, then EOSE.
 * Anyone can publish under an attestation's tags, so only a read that came
 * back short is an answer; a full page it cannot get past, the page bound, or
 * a stop after some events is cut off.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readRelay, readSubject } from '../paged-read';

interface Ev {
    id: string;
    kind: number;
    created_at: number;
    tags: string[][];
}

let held: Record<string, Ev[]> = {};
let mode: Record<string, 'ok' | 'closed' | 'silent' | 'hang' | 'drop'> = {};

class StrfryLike {
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(readonly url: string) {
        queueMicrotask(() => this.onopen?.());
    }
    send(raw: string) {
        const [type, sub, f] = JSON.parse(raw) as [string, string, { limit?: number; until?: number; '#t'?: string[] }];
        if (type !== 'REQ') return;
        const m = mode[this.url] ?? 'ok';
        if (m === 'silent') return;
        queueMicrotask(() => {
            if (m === 'closed') return this.onmessage?.({ data: JSON.stringify(['CLOSED', sub, 'rate-limited']) });
            const answer = (held[this.url] ?? [])
                .filter((e) => (f.until === undefined || e.created_at <= f.until) && e.tags.some((t) => t[0] === 't' && f['#t']?.includes(t[1]!)))
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, Math.min(f.limit ?? 500, 500));
            for (const e of answer) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, e]) });
            if (m === 'hang') return;
            if (m === 'drop') return this.onclose?.();
            this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
        });
    }
    close() {}
}

let n = 0;
const evs = (count: number, at: (i: number) => number, t = 'bc1qaddr') =>
    Array.from({ length: count }, (_, i) => ({ id: (++n).toString(16).padStart(64, '0'), kind: 30078, created_at: at(i), tags: [['t', t]] }));
const F = { kinds: [30078], '#t': ['bc1qaddr'] };
const R = ['wss://a', 'wss://b', 'wss://c', 'wss://d', 'wss://e'];

let realWs: typeof globalThis.WebSocket;
beforeEach(() => {
    held = {};
    mode = {};
    realWs = globalThis.WebSocket;
    globalThis.WebSocket = StrfryLike as never;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('readRelay', () => {
    it('reads past one page to the end, complete', async () => {
        held['wss://a'] = evs(1200, (i) => 1_000 + i);
        const r = await readRelay('wss://a', F);
        expect(r.state).toBe('complete');
        expect(r.events).toHaveLength(1200);
    });

    it('a full page stuck on one second is cut off', async () => {
        held['wss://a'] = [...evs(501, () => 5_000), ...evs(3, (i) => 100 + i)];
        expect((await readRelay('wss://a', F)).state).toBe('cut_off');
    });

    it('more than the page bound (2,000) is cut off', async () => {
        held['wss://a'] = evs(2001, (i) => 1_000 + i);
        expect((await readRelay('wss://a', F)).state).toBe('cut_off');
    });

    it('CLOSED before anything is no answer; events then a stop is cut off', async () => {
        mode['wss://a'] = 'closed';
        expect((await readRelay('wss://a', F)).state).toBe('no_answer');
        held['wss://b'] = evs(3, (i) => 1_000 + i);
        mode['wss://b'] = 'drop';
        expect((await readRelay('wss://b', F)).state).toBe('cut_off');
        held['wss://c'] = evs(3, (i) => 1_000 + i);
        mode['wss://c'] = 'hang';
        expect((await readRelay('wss://c', F, 50)).state).toBe('cut_off');
    });
});

describe('readSubject', () => {
    it('complete when the floor (4 of 5) finished and none was cut off', async () => {
        for (const r of R) held[r] = evs(2, (i) => 1_000 + i);
        mode['wss://e'] = 'closed';
        expect((await readSubject(F, R)).complete).toBe(true);
    });

    it('not complete below the floor, or with any relay cut off', async () => {
        for (const r of R) held[r] = evs(2, (i) => 1_000 + i);
        mode['wss://d'] = 'closed';
        mode['wss://e'] = 'closed';
        expect((await readSubject(F, R)).complete).toBe(false);
        mode = {};
        held['wss://a'] = [...evs(501, () => 9_000), ...evs(2, (i) => 1_000 + i)];
        expect((await readSubject(F, R)).complete).toBe(false);
    });
});
