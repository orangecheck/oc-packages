import { describe, expect, it } from 'vitest';

import { BlobsUnread, VaultClient, type BlobRef } from './sync';

/**
 * Only a 404 is an absent blob. A refusal, an outage or a network error is a
 * blob that couldn't be read, and fetchBlobs throws rather than return a
 * partial pull a caller would take for the whole vault.
 */

const refs: BlobRef[] = ['a', 'b', 'c'].map((id) => ({
    envelope_id: id,
    updated_at: '2026-11-01T00:00:00Z',
}));

function client(answer: (id: string) => Response | Error): VaultClient {
    return new VaultClient({
        baseUrl: 'https://vault.example.invalid',
        token: 'ocvt_test',
        fetch: (async (url: string) => {
            const r = answer(decodeURIComponent(String(url).split('/api/blobs/')[1] ?? ''));
            if (r instanceof Error) throw r;
            return r;
        }) as typeof fetch,
    });
}
const blob = (id: string) => Response.json({ ok: true, ciphertext: `ct-${id}` });

describe('VaultClient.fetchBlobs', () => {
    it('returns every blob when each was read', async () => {
        const got = await client(blob).fetchBlobs(refs);
        expect(got.map((b) => b.ciphertext).sort()).toEqual(['ct-a', 'ct-b', 'ct-c']);
    });

    it('leaves out a blob that is gone (404)', async () => {
        const got = await client((id) =>
            id === 'b' ? Response.json({ ok: false }, { status: 404 }) : blob(id),
        ).fetchBlobs(refs);
        expect(got.map((b) => b.envelope_id).sort()).toEqual(['a', 'c']);
    });

    it.each([
        ['a 500', () => Response.json({ ok: false, reason: 'storage down' }, { status: 500 })],
        ['a 429', () => Response.json({ ok: false, reason: 'rate_limited' }, { status: 429 })],
        ['a network error', () => new TypeError('fetch failed')],
    ])('throws BlobsUnread on %s, with what was read and what was not', async (_w, fail) => {
        const err = await client((id) => (id === 'b' ? fail() : blob(id)))
            .fetchBlobs(refs)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BlobsUnread);
        const u = err as BlobsUnread;
        expect(u.listed).toBe(3);
        expect(u.failed.map((f) => f.ref.envelope_id)).toEqual(['b']);
        expect(u.fetched.map((b) => b.envelope_id).sort()).toEqual(['a', 'c']);
        expect(u.message).toContain("1 of 3 vault entries couldn't be fetched");
    });

    it('fetchBlob answers null only for a 404', async () => {
        const c = client((id) =>
            id === 'gone' ? Response.json({}, { status: 404 }) : Response.json({}, { status: 503 }),
        );
        expect(await c.fetchBlob('gone')).toBeNull();
        await expect(c.fetchBlob('down')).rejects.toThrow();
    });
});
