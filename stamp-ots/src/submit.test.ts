// submit() / upgrade() tests using a fake CalendarClient — avoids hitting the
// real OTS calendar network from CI. Verifies the composition logic only.

import { describe, expect, it } from 'vitest';

import { submitToCalendars } from './submit.js';
import { upgradeProof } from './upgrade.js';
import type { CalendarClient, OtsProof } from './types.js';

const FIXED_ID = 'ad30c983dfc872a8c53cd70eb4d84e1869967a4b8433586beec7ba468b03c3de';

function fakeCalendar(opts: {
    url: string;
    submitResult?: Uint8Array | (() => Promise<Uint8Array>);
    fetchResult?: Uint8Array | null | (() => Promise<Uint8Array | null>);
    submitShouldFail?: boolean;
}): CalendarClient {
    return {
        url: opts.url,
        async submit(digest) {
            if (opts.submitShouldFail) throw new Error(`calendar ${opts.url} down`);
            if (!opts.submitResult) return new Uint8Array([0xde, 0xad, ...digest.subarray(0, 4)]);
            const r = typeof opts.submitResult === 'function' ? await opts.submitResult() : opts.submitResult;
            return r;
        },
        async fetchProof() {
            if (!opts.fetchResult && opts.fetchResult !== null)
                return new Uint8Array([0xfe, 0xed, 0xfa, 0xce]);
            const r = typeof opts.fetchResult === 'function' ? await opts.fetchResult() : opts.fetchResult;
            return r;
        },
    };
}

describe('submitToCalendars', () => {
    it('returns a pending proof with all successful calendars listed', async () => {
        const cal1 = fakeCalendar({ url: 'https://a.example', submitResult: new Uint8Array([1, 2, 3]) });
        const cal2 = fakeCalendar({ url: 'https://b.example', submitResult: new Uint8Array([4, 5, 6, 7]) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [cal1, cal2] });
        expect(out.status).toBe('pending');
        expect(out.calendars).toEqual(['https://a.example', 'https://b.example']);
        expect(out.blockHeight).toBeNull();
        expect(out.proof.length).toBeGreaterThan(0);
    });

    it('tolerates one calendar failure when minSuccesses defaults to 1', async () => {
        const bad = fakeCalendar({ url: 'https://bad.example', submitShouldFail: true });
        const good = fakeCalendar({ url: 'https://good.example', submitResult: new Uint8Array([9]) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [bad, good] });
        expect(out.calendars).toEqual(['https://good.example']);
    });

    it('throws when minSuccesses is not met', async () => {
        const bad1 = fakeCalendar({ url: 'https://x.example', submitShouldFail: true });
        const bad2 = fakeCalendar({ url: 'https://y.example', submitShouldFail: true });
        await expect(
            submitToCalendars(FIXED_ID, { calendars: [bad1, bad2], minSuccesses: 1 })
        ).rejects.toThrow(/did not reach/);
    });

    it('rejects invalid id hex', async () => {
        await expect(submitToCalendars('deadbeef', { calendars: ['https://x'] })).rejects.toThrow();
    });
});

describe('upgradeProof', () => {
    const basePending: OtsProof = {
        status: 'pending',
        proof: 'AAEC',
        calendars: ['https://a.example', 'https://b.example'],
        blockHeight: null,
        blockHash: null,
        upgradedAt: null,
    };

    it('returns current proof unchanged when parseAnchor returns null from all calendars', async () => {
        // Fake the fetch so calendars return same-length pending proofs.
        // We have to monkey-patch createCalendarClient indirectly — instead,
        // use a minimal harness: submit() isn't used here, upgradeProof reads
        // calendars from the proof and creates new clients. Rather than
        // rewire the module, we test the no-op path by making parseAnchor
        // return null and ensure the function returns the input.
        // The real network fetches will fail in test; we swallow via opts.fetch.
        const fakeFetch = async () => new Response(null, { status: 404 });
        const out = await upgradeProof(basePending, FIXED_ID, {
            parseAnchor: async () => null,
            fetch: fakeFetch as unknown as typeof fetch,
        });
        // Both calendars returned 404 => nothing to update.
        expect(out).toEqual(basePending);
    });

    it('is idempotent when given a confirmed proof', async () => {
        const confirmed: OtsProof = {
            ...basePending,
            status: 'confirmed',
            blockHeight: 890123,
            blockHash: '0'.repeat(64),
            upgradedAt: '2026-04-24T19:00:00Z',
        };
        const out = await upgradeProof(confirmed, FIXED_ID, {
            parseAnchor: async () => {
                throw new Error('should not be called');
            },
        });
        expect(out).toEqual(confirmed);
    });
});
