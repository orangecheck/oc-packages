// submit() / upgrade() tests using a fake CalendarClient — avoids hitting the
// real OTS calendar network from CI. Verifies the composition logic only.

import { describe, expect, it } from 'vitest';

import { base64Decode, hexDecode } from './base64.js';
import { parseProof, pendingCommitments } from './ots.js';
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

// A calendar's answer to POST /digest: append a nonce, sha256, pending attestation for its URL.
function pendingReceipt(url: string, nonceByte: number): Uint8Array {
    const uri = new TextEncoder().encode(url);
    const nonce = new Uint8Array(16).fill(nonceByte);
    const pendingTag = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];
    return new Uint8Array([0xf0, 0x10, ...nonce, 0x08, 0x00, ...pendingTag, uri.length + 1, uri.length, ...uri]);
}

const pendingUris = (p: OtsProof) =>
    pendingCommitments(parseProof(base64Decode(p.proof), hexDecode(FIXED_ID))).map((c) => c.uri);

describe('submitToCalendars', () => {
    it('keeps every calendar receipt in the proof and lists each calendar', async () => {
        const cal1 = fakeCalendar({ url: 'https://a.example', submitResult: pendingReceipt('https://a.example', 1) });
        const cal2 = fakeCalendar({ url: 'https://b.example', submitResult: pendingReceipt('https://b.example', 2) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [cal1, cal2] });
        expect(out.status).toBe('pending');
        expect(out.calendars).toEqual(['https://a.example', 'https://b.example']);
        expect(out.blockHeight).toBeNull();
        expect(pendingUris(out).sort()).toEqual(['https://a.example', 'https://b.example']);
    });

    it('lets a second calendar upgrade the proof when the first is gone', async () => {
        const cal1 = fakeCalendar({ url: 'https://a.example', submitResult: pendingReceipt('https://a.example', 1) });
        const cal2 = fakeCalendar({ url: 'https://b.example', submitResult: pendingReceipt('https://b.example', 2) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [cal1, cal2] });
        const asked: string[] = [];
        await upgradeProof(out, FIXED_ID, {
            parseAnchor: async () => null,
            fetch: (async (url: string) => {
                asked.push(new URL(url).origin);
                return new Response(null, { status: 404 });
            }) as unknown as typeof fetch,
        });
        expect(asked.sort()).toEqual(['https://a.example', 'https://b.example']);
    });

    it('tolerates one calendar failure when minSuccesses defaults to 1', async () => {
        const bad = fakeCalendar({ url: 'https://bad.example', submitShouldFail: true });
        const good = fakeCalendar({ url: 'https://good.example', submitResult: pendingReceipt('https://good.example', 9) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [bad, good] });
        expect(out.calendars).toEqual(['https://good.example']);
        expect(pendingUris(out)).toEqual(['https://good.example']);
    });

    it('counts an unreadable receipt as a failure', async () => {
        const junk = fakeCalendar({ url: 'https://junk.example', submitResult: new Uint8Array([1, 2, 3]) });
        const good = fakeCalendar({ url: 'https://good.example', submitResult: pendingReceipt('https://good.example', 9) });
        const out = await submitToCalendars(FIXED_ID, { calendars: [junk, good] });
        expect(out.calendars).toEqual(['https://good.example']);
        await expect(submitToCalendars(FIXED_ID, { calendars: [junk] })).rejects.toThrow(/unreadable proof/);
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
