/**
 * check({identity}) holds one bond to one identity per protocol (SECURITY.md
 * §3) by reading every attestation the address signed. Anyone can publish
 * under the address's `t` tag, and relays answer newest first up to their cap
 * (500), so a flood dated after the address's other attestation pushes it out
 * of the read. "Not shared" therefore stands only on a read that the read
 * floor of relays finished with a short page, none cut off; otherwise the
 * answer is stake_unread.
 *
 * Four in-memory relays that honour `limit`, `since`, `until` and newest-first
 * order, up to a cap of 500 a REQ (`cap`); signature and chain checks are
 * stubbed, as in check-binding.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../canonical';
import { check } from '../check';
import { createAttestationEvent, DEFAULT_RELAYS, FANOUT_DEADLINE_MS, readByAddress } from '../nostr';
import { nostrIdentifierForms } from '../nostr-pubkey';
import type { IdentityBinding, NostrEvent } from '../types';

vi.mock('../verify', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../verify')>();
    return {
        ...actual,
        signatureIsValid: vi.fn(async ({ sig }: { sig: string }) => sig !== 'forged'),
        verify: vi.fn(async () => verdict.outcome),
    };
});

const GOOD = {
    ok: true,
    codes: ['sig_ok_bip322', 'bond_confirmed'],
    network: 'mainnet',
    metrics: { sats_bonded: 5_000_000, days_unspent: 400, score: 90 },
};
const verdict = vi.hoisted(() => ({ outcome: null as unknown }));

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const KEY_A = nostrIdentifierForms('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e');
const KEY_B = nostrIdentifierForms('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
const RELAYS = ['wss://r1.example', 'wss://r2.example', 'wss://r3.example', 'wss://r4.example'];
const NOW = Math.floor(Date.now() / 1000);

/** What each relay holds, and how it answers a read of the address (`#t`). */
let held: Record<string, NostrEvent[]> = {};
let addressMode: Record<string, 'ok' | 'closed' | 'silent' | 'hang' | 'error' | 'drop' | 'stale' | 'eoseDrop'> = {};
/** The most events a relay sends to one REQ. */
let cap = 500;
/** REQs sent so far, and what each relay's NIP-11 document says: a page size, a hang, or a refusal (a CSP block). */
let reqs = 0;
let declares: Record<string, number | 'hang' | 'refuse'> = {};
/** Each NIP-11 GET, with how many REQs had been sent when it went out. */
let nip11: { url: string; reqsBefore: number }[] = [];

function matches(ev: NostrEvent, f: Record<string, unknown>): boolean {
    if (Array.isArray(f.kinds) && !f.kinds.includes(ev.kind)) return false;
    if (typeof f.until === 'number' && ev.created_at > f.until) return false;
    if (typeof f.since === 'number' && ev.created_at < f.since) return false;
    for (const [k, v] of Object.entries(f)) {
        if (!k.startsWith('#')) continue;
        if (!ev.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1] ?? ''))) return false;
    }
    return true;
}

class FakeRelay {
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 0;
    /** Its socket closed: a REQ sent on it goes nowhere. */
    gone = false;
    constructor(public url: string) {
        // As a browser's: a fragment is refused too.
        if (!url.startsWith('wss://') || url.includes('#')) throw new SyntaxError(`invalid relay URL: ${url}`);
        queueMicrotask(() => {
            this.readyState = 1;
            this.onopen?.();
        });
    }
    send(raw: string): void {
        const [type, sub, filter] = JSON.parse(raw) as [string, string, Record<string, unknown>];
        if (type !== 'REQ' || this.gone) return;
        reqs++;
        const mode = '#t' in filter ? (addressMode[this.url] ?? 'ok') : 'ok';
        if (mode === 'silent') return;
        queueMicrotask(() => {
            if (mode === 'closed') {
                this.onmessage?.({ data: JSON.stringify(['CLOSED', sub, 'rate-limited: slow down']) });
                return;
            }
            const limit = typeof filter.limit === 'number' ? Math.min(filter.limit, cap) : cap;
            // A stale relay ignores `until`: every page is its newest.
            const asked = mode === 'stale' ? { ...filter, until: undefined } : filter;
            const answer = (held[this.url] ?? [])
                .filter((e) => matches(e, asked))
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, limit);
            for (const ev of answer) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
            // Some events, then no EOSE: it hangs past the deadline, errs or drops.
            if (mode === 'hang') return;
            if (mode === 'error') return this.onerror?.(new Error('reset'));
            if (mode === 'drop') return this.onclose?.();
            this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
            // A full page, its EOSE, and then the socket closes.
            if (mode === 'eoseDrop') {
                this.gone = true;
                queueMicrotask(() => this.onclose?.());
            }
        });
    }
    close(): void {
        this.readyState = 3;
    }
}

let n = 0;
async function attest(identities: IdentityBinding[], issuedAt: string, createdAt: number) {
    const message = buildCanonicalMessage({ address: ADDR, identities }, {}, { issuedAt });
    const env = await createAttestationEnvelope(message, 'sig', 'bip322', ADDR, identities);
    return { ...createAttestationEvent(env, 'ab'.repeat(32)), id: env.attestation_id, sig: 'ef'.repeat(64), created_at: createdAt } as NostrEvent;
}

/** Junk under the address's `t` tag, newer than both attestations. */
function junk(count: number, sameSecond: boolean): NostrEvent[] {
    return Array.from({ length: count }, () => {
        const i = ++n;
        return {
            id: i.toString(16).padStart(64, '0'),
            pubkey: 'cd'.repeat(32),
            created_at: sameSecond ? NOW + 100 : NOW + 100 + i,
            kind: 30078,
            tags: [
                ['d', i.toString(16).padStart(64, 'e')],
                ['t', ADDR],
            ],
            content: 'junk',
            sig: '00'.repeat(64),
        };
    });
}

let mine: NostrEvent;
let sibling: NostrEvent;
const onEvery = (...events: NostrEvent[][]) => {
    held = Object.fromEntries(RELAYS.map((r) => [r, events.flat()]));
};
const checkA = () => check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays: RELAYS });
/** Where each relay's NIP-11 GET goes: its URL with ws made http. */
const https = (relays: string[]) => relays.map((r) => r.replace(/^wss/, 'https'));

async function nip11Fetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = String(input);
    nip11.push({ url, reqsBefore: reqs });
    const doc = declares[url];
    if (doc === 'refuse') throw new TypeError('Failed to fetch');
    if (doc === 'hang') {
        return new Promise((_, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        );
    }
    if (typeof doc === 'number') return new Response(JSON.stringify({ limitation: { max_limit: doc } }));
    return new Response('not found', { status: 404 });
}

let realWs: typeof globalThis.WebSocket;
let realFetch: typeof globalThis.fetch;
beforeEach(async () => {
    mine = await attest([{ protocol: 'nostr', identifier: KEY_A[0]! }], '2026-01-01T00:00:00Z', NOW - 2000);
    sibling = await attest([{ protocol: 'nostr', identifier: KEY_B[0]! }], '2026-02-01T00:00:00Z', NOW - 1000);
    held = {};
    addressMode = {};
    cap = 500;
    reqs = 0;
    declares = {};
    nip11 = [];
    verdict.outcome = GOOD;
    realWs = globalThis.WebSocket;
    realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
    globalThis.fetch = nip11Fetch as typeof globalThis.fetch;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
    globalThis.fetch = realFetch;
});

describe('check({identity}): "not shared" needs a read of the address a flood could not cut off', () => {
    it('finds the shared stake on a read that finished', async () => {
        onEvery([mine, sibling]);
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('relays that send at most 300 a REQ are read past 400 newer junk events to the other attestation', async () => {
        cap = 300;
        onEvery([mine, sibling], junk(400, false));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('501 junk events in one second, newer than the other attestation: that second is stepped past and the stake read as shared', async () => {
        onEvery([mine, sibling], junk(501, true));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('2,001 junk events at distinct times are read past: stake_shared', async () => {
        onEvery([mine, sibling], junk(2001, false));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('more junk than the read takes (2,600 at distinct times, past its 2,000 events): stake_unread', async () => {
        onEvery([mine, sibling], junk(2600, false));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_unread');
    });

    it('every relay refusing the address read (CLOSED): stake_unread', async () => {
        onEvery([mine, sibling]);
        addressMode = Object.fromEntries(RELAYS.map((r) => [r, 'closed']));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_unread');
    });

    it('below the read floor (2 of 4 finish; the floor is 3): stake_unread', async () => {
        onEvery([mine]);
        addressMode = { [RELAYS[0]!]: 'silent', [RELAYS[1]!]: 'closed' };
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_unread');
    }, 10_000);

    it('the floor finishing with no other attestation is ok, one relay silent', async () => {
        onEvery([mine]);
        addressMode = { [RELAYS[0]!]: 'silent' };
        const r = await checkA();
        expect(r.ok).toBe(true);
        expect(r.reasons).toBeUndefined();
    }, 10_000);

    it('one relay cut off is enough, though the floor finished: the attestation may sit behind its flood', async () => {
        held = {
            [RELAYS[0]!]: [mine, sibling, ...junk(2600, false)],
            [RELAYS[1]!]: [mine],
            [RELAYS[2]!]: [mine],
            [RELAYS[3]!]: [mine],
        };
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_unread');
    });

    it('an attestation found is shared, though another relay was cut off', async () => {
        held = {
            [RELAYS[0]!]: [mine, sibling],
            [RELAYS[1]!]: [mine, ...junk(501, true)],
            [RELAYS[2]!]: [mine],
            [RELAYS[3]!]: [mine],
        };
        const r = await checkA();
        expect(r.reasons).toContain('stake_shared');
        expect(r.reasons).not.toContain('stake_unread');
    });

    it('a relay that ignores until and sends its newest page again is cut off, never read complete', async () => {
        held = {
            [RELAYS[0]!]: [mine, sibling, ...junk(600, false)],
            [RELAYS[1]!]: [mine],
            [RELAYS[2]!]: [mine],
            [RELAYS[3]!]: [mine],
        };
        addressMode = { [RELAYS[0]!]: 'stale' };
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toEqual(['stake_unread']);
    });

    for (const mode of ['error', 'drop'] as const) {
        it(`a relay whose socket fails mid-page (${mode}) is cut off at once, not at the deadline`, async () => {
            held = {
                [RELAYS[0]!]: [mine, ...junk(300, false)],
                [RELAYS[1]!]: [mine],
                [RELAYS[2]!]: [mine],
                [RELAYS[3]!]: [mine],
            };
            addressMode = { [RELAYS[0]!]: mode };
            const started = Date.now();
            const read = await readByAddress(ADDR, RELAYS);
            expect(read.relays.map((x) => x.state)).toEqual(['cut_off', 'complete', 'complete', 'complete']);
            expect(Date.now() - started).toBeLessThan(FANOUT_DEADLINE_MS / 2);
        });
    }

    it('a relay whose socket closes right after a full page is cut off at once, not at the deadline', async () => {
        held = {
            [RELAYS[0]!]: [mine, ...junk(600, false)],
            [RELAYS[1]!]: [mine],
            [RELAYS[2]!]: [mine],
            [RELAYS[3]!]: [mine],
        };
        addressMode = { [RELAYS[0]!]: 'eoseDrop' };
        const started = Date.now();
        const read = await readByAddress(ADDR, RELAYS);
        expect(read.relays.map((x) => x.state)).toEqual(['cut_off', 'complete', 'complete', 'complete']);
        expect(Date.now() - started).toBeLessThan(FANOUT_DEADLINE_MS / 2);
    }, 10_000);

    for (const mode of ['hang', 'error', 'drop'] as const) {
        it(`a relay that sends some events and then stops (${mode}) is cut off, not silent: stake_unread`, async () => {
            // What that relay did not finish sending may hold the other attestation.
            held = {
                [RELAYS[0]!]: [mine, ...junk(300, false)],
                [RELAYS[1]!]: [mine],
                [RELAYS[2]!]: [mine],
                [RELAYS[3]!]: [mine],
            };
            addressMode = { [RELAYS[0]!]: mode };
            const r = await checkA();
            expect(r.ok).toBe(false);
            expect(r.reasons).toEqual(['stake_unread']);
        }, 10_000);
    }
});

describe('readByAddress keeps only what a REQ for the address brought', () => {
    it('lists each event once per relay, though paging reads the boundary second again', async () => {
        held = { [RELAYS[0]!]: [mine, ...junk(600, false)] };
        const read = await readByAddress(ADDR, [RELAYS[0]!]);
        expect(read.relays.map((x) => x.state)).toEqual(['complete']);
        expect(read.events).toHaveLength(601);
    });

    it('a relay URL the socket refuses is no answer, not cut off', async () => {
        onEvery([mine]);
        const read = await readByAddress(ADDR, [...RELAYS.slice(0, 3), 'not a relay', 'wss://fragment.example/#x']);
        const states = read.relays.map((x) => x.state);
        expect(states).toEqual(['complete', 'complete', 'complete', 'no_answer', 'no_answer']);
        // Nor is it asked its NIP-11: in a browser, a GET of 'not a relay' goes to the page's own origin.
        expect(nip11.map((g) => g.url)).toEqual(https(RELAYS.slice(0, 3)));
    });

    it("a full page at one second with nothing below: cut off, and the pager's page-size REQ adds no event of another subject", async () => {
        const other = { ...sibling, id: 'f'.repeat(64), created_at: NOW + 500, tags: [['t', 'bc1qother']] };
        onEvery(junk(500, true), [other]);
        const read = await readByAddress(ADDR, RELAYS);
        expect(read.relays.map((r) => r.state)).toEqual(['cut_off', 'cut_off', 'cut_off', 'cut_off']);
        expect(read.events.some((e) => e.id === other.id)).toBe(false);
        expect(read.events).toHaveLength(2000);
    });
});

describe('the stake is read only once everything else passed, so stake_unread only comes alone', () => {
    const failing: Array<[string, unknown, Record<string, number>, string[]]> = [
        ['a signature that does not verify', { ok: false, codes: ['sig_invalid'], network: 'mainnet' }, {}, ['sig_invalid']],
        ['a bond below min_sats', GOOD, { minSats: 10_000_000 }, ['below_min_sats']],
        ['a bond younger than min_days', GOOD, { minDays: 1000 }, ['below_min_days']],
    ];
    for (const [what, outcome, mins, reasons] of failing) {
        it(`${what}, under a flood: that reason alone, and no read of the stake`, async () => {
            onEvery([mine, sibling], junk(501, true));
            verdict.outcome = outcome;
            const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays: RELAYS, ...mins });
            expect(r.ok).toBe(false);
            expect(r.reasons).toEqual(reasons);
        });
    }
});

describe('a relay the caller names is asked its NIP-11 page; the default relays are not', () => {
    // nostr-core keeps a relay's NIP-11 answer for the process, so each test names relays of its own.
    const named = (tag: string) => [1, 2, 3, 4].map((i) => `wss://${tag}-${i}.example`);
    const hold = (relays: string[], ...events: NostrEvent[][]) => {
        held = Object.fromEntries(relays.map((r) => [r, events.flat()]));
    };

    it('relays that declare a page of 50 and send 50 a REQ are cut off, never complete: stake_unread', async () => {
        const relays = named('cap50');
        cap = 50;
        hold(relays, [mine, sibling], junk(100, false));
        for (const r of https(relays)) declares[r] = 50;
        const read = await readByAddress(ADDR, relays);
        expect(read.relays.map((x) => x.state)).toEqual(['cut_off', 'cut_off', 'cut_off', 'cut_off']);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(r.ok).toBe(false);
        expect(r.reasons).toEqual(['stake_unread']);
    });

    it('the GET goes out with the read, before its first REQ, and only to the relays the caller named', async () => {
        const relays = [...DEFAULT_RELAYS, 'wss://named-only.example'];
        hold(relays, [mine]);
        await readByAddress(ADDR, relays);
        expect(nip11).toEqual([{ url: 'https://named-only.example', reqsBefore: 0 }]);
    });

    it('a NIP-11 refused (a CSP block) keeps the floor of 100: relays sending 300 a REQ are read to their end', async () => {
        const relays = named('refused');
        cap = 300;
        hold(relays, [mine, sibling], junk(400, false));
        for (const r of https(relays)) declares[r] = 'refuse';
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(r.reasons).toContain('stake_shared');
    });

    it("a NIP-11 that never answers is waited on only for the fan-out's time left, and the floor of 100 stays", async () => {
        const relays = named('hang');
        cap = 300;
        hold(relays, [mine, sibling], junk(400, false));
        for (const r of https(relays)) declares[r] = 'hang';
        const started = Date.now();
        const read = await readByAddress(ADDR, relays);
        expect(Date.now() - started).toBeLessThan(FANOUT_DEADLINE_MS + 1000);
        expect(read.relays.map((x) => x.state)).toEqual(['complete', 'complete', 'complete', 'complete']);
        expect(read.events.some((e) => e.id === sibling.id)).toBe(true);
    }, 10_000);
    it('a default relay is not asked however its URL is written, and a named one is asked at its own path', async () => {
        const relays = ['wss://relay.damus.io/', 'wss://NOS.lol', 'wss://pathed.example/nostr', 'wss://pathed.example'];
        hold(relays, [mine]);
        await readByAddress(ADDR, relays);
        expect(nip11.map((g) => g.url).sort()).toEqual(['https://pathed.example', 'https://pathed.example/nostr']);
    });

    it("a relative URL the socket takes, as a browser's does, is read but not asked: no GET to the page's own origin", async () => {
        class BrowserSocket extends FakeRelay {
            constructor(url: string) {
                super(new URL(url, 'wss://page.example/').href);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalThis.WebSocket = BrowserSocket as any;
        held = { 'wss://page.example/relay': [mine] };
        const read = await readByAddress(ADDR, ['relay']);
        expect(read.relays.map((x) => x.state)).toEqual(['complete']);
        expect(nip11).toEqual([]);
    });

    it('check({identity}) asks each named relay once for both its reads, a refused GET included', async () => {
        const relays = named('once');
        hold(relays, [mine]);
        for (const r of https(relays)) declares[r] = 'refuse';
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(r.ok).toBe(true);
        expect(nip11.map((g) => g.url)).toEqual(https(relays));
    });

    it('a GET refused in one check() is asked again in the next, whose answer of 50 cuts the read off: stake_unread', async () => {
        // Adapted from site-attest's P7: a failed GET is kept for its own call only.
        const relays = named('next-call');
        cap = 50;
        hold(relays, [mine, sibling], junk(100, false));
        for (const r of https(relays)) declares[r] = 'refuse';
        const first = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(nip11.map((g) => g.url)).toEqual(https(relays));
        expect(first.ok).toBe(true);
        nip11 = [];
        for (const r of https(relays)) declares[r] = 50;
        const second = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(nip11.map((g) => g.url)).toEqual(https(relays));
        expect(second.ok).toBe(false);
        expect(second.reasons).toEqual(['stake_unread']);
    }, 15_000);

    it("check({identity}) waits on a NIP-11 that never answers once, not once a read", async () => {
        const relays = named('hang-once');
        hold(relays, [mine]);
        for (const r of https(relays)) declares[r] = 'hang';
        const started = Date.now();
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays });
        expect(Date.now() - started).toBeLessThan(FANOUT_DEADLINE_MS + 1000);
        expect(r.ok).toBe(true);
        expect(nip11.map((g) => g.url)).toEqual(https(relays));
    }, 15_000);
});
