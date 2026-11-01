/**
 * check({identity}) holds one bond to one identity per protocol (SECURITY.md
 * §3) by reading every attestation the address signed. Anyone can publish
 * under the address's `t` tag, and relays answer newest first up to their cap
 * (500), so a flood dated after the address's other attestation pushes it out
 * of the read. "Not shared" therefore stands only on a read that the read
 * floor of relays finished with a short page, none cut off; otherwise the
 * answer is stake_unread.
 *
 * Four in-memory relays that honour `limit`, `until` and newest-first order;
 * signature and chain checks are stubbed, as in check-binding.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../canonical';
import { check } from '../check';
import { createAttestationEvent } from '../nostr';
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
let addressMode: Record<string, 'ok' | 'closed' | 'silent' | 'hang' | 'error' | 'drop'> = {};

function matches(ev: NostrEvent, f: Record<string, unknown>): boolean {
    if (Array.isArray(f.kinds) && !f.kinds.includes(ev.kind)) return false;
    if (typeof f.until === 'number' && ev.created_at > f.until) return false;
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
    constructor(public url: string) {
        queueMicrotask(() => {
            this.readyState = 1;
            this.onopen?.();
        });
    }
    send(raw: string): void {
        const [type, sub, filter] = JSON.parse(raw) as [string, string, Record<string, unknown>];
        if (type !== 'REQ') return;
        const mode = '#t' in filter ? (addressMode[this.url] ?? 'ok') : 'ok';
        if (mode === 'silent') return;
        queueMicrotask(() => {
            if (mode === 'closed') {
                this.onmessage?.({ data: JSON.stringify(['CLOSED', sub, 'rate-limited: slow down']) });
                return;
            }
            const limit = typeof filter.limit === 'number' ? Math.min(filter.limit, 500) : 500;
            const answer = (held[this.url] ?? [])
                .filter((e) => matches(e, filter))
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, limit);
            for (const ev of answer) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
            // Some events, then no EOSE: it hangs past the deadline, errs or drops.
            if (mode === 'hang') return;
            if (mode === 'error') return this.onerror?.(new Error('reset'));
            if (mode === 'drop') return this.onclose?.();
            this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
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

let realWs: typeof globalThis.WebSocket;
beforeEach(async () => {
    mine = await attest([{ protocol: 'nostr', identifier: KEY_A[0]! }], '2026-01-01T00:00:00Z', NOW - 2000);
    sibling = await attest([{ protocol: 'nostr', identifier: KEY_B[0]! }], '2026-02-01T00:00:00Z', NOW - 1000);
    held = {};
    addressMode = {};
    verdict.outcome = GOOD;
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('check({identity}): "not shared" needs a read of the address a flood could not cut off', () => {
    it('finds the shared stake on a read that finished', async () => {
        onEvery([mine, sibling]);
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('501 junk events in one second, newer than the other attestation: stake_unread, never ok', async () => {
        onEvery([mine, sibling], junk(501, true));
        const r = await checkA();
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_unread');
    });

    it('more junk than the page bound reads (2,001 at distinct times): stake_unread', async () => {
        onEvery([mine, sibling], junk(2001, false));
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
            [RELAYS[0]!]: [mine, sibling, ...junk(501, true)],
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
