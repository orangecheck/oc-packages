import { describe, expect, it } from 'vitest';

import { createCalendarClient } from './calendar.js';

// Browsers preflight any request whose headers are not CORS-safelisted, and
// OTS calendars answer OPTIONS with 501, so such a request never leaves the
// page. These pin the requests to the safelisted shape.
const SAFELISTED = new Set(['accept', 'accept-language', 'content-language']);

function recordingFetch(calls: { url: string; init: RequestInit | undefined }[], status = 200) {
    return (async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(new Uint8Array([0]), { status });
    }) as unknown as typeof fetch;
}

function headerNames(init: RequestInit | undefined): string[] {
    return [...new Headers(init?.headers).keys()];
}

describe('createCalendarClient requests need no CORS preflight', () => {
    it('submits the digest with only safelisted headers', async () => {
        const calls: { url: string; init: RequestInit | undefined }[] = [];
        const c = createCalendarClient('https://cal.test/', { fetch: recordingFetch(calls) });
        await c.submit(new Uint8Array(32));
        expect(calls[0]!.url).toBe('https://cal.test/digest');
        expect(headerNames(calls[0]!.init).filter((h) => !SAFELISTED.has(h))).toEqual([]);
    });

    it('fetches an upgrade by commitment with only safelisted headers', async () => {
        const calls: { url: string; init: RequestInit | undefined }[] = [];
        const c = createCalendarClient('https://cal.test', { fetch: recordingFetch(calls) });
        await c.fetchProof(new Uint8Array(44).fill(0xab));
        expect(calls[0]!.url).toBe(`https://cal.test/timestamp/${'ab'.repeat(44)}`);
        expect(headerNames(calls[0]!.init).filter((h) => !SAFELISTED.has(h))).toEqual([]);
    });
});
