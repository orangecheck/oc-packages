import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { family } from '../family';

describe('oc.family.scopes', () => {
    const realFetch = globalThis.fetch;

    beforeEach(() => {
        // jsdom test env doesn't ship a default fetch in our config; ensure
        // every test installs its own and we restore in afterEach.
        // @ts-expect-error · tests assign mocks
        globalThis.fetch = undefined;
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
        vi.restoreAllMocks();
    });

    it('rejects unknown verbs synchronously', async () => {
        await expect(
            // @ts-expect-error · invalid verb
            family.scopes('oc-not-a-thing')
        ).rejects.toThrow(/unknown verb/);
    });

    it('hits /api/family/scopes/<verb> with credentials and returns the parsed body', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                sub: 'sub_abc',
                family_product: {
                    verb: 'oc-vote',
                    name: 'oc · vote',
                    origin: 'https://vote.ochk.io',
                },
                scopes_granted: ['cross_integrator_human_event_count'],
                scopes: { cross_integrator_human_event_count: '42' },
            }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        const r = await family.scopes('oc-vote');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://me.ochk.io/api/family/scopes/oc-vote');
        expect((init as RequestInit).credentials).toBe('include');
        expect(r.sub).toBe('sub_abc');
        expect(r.family_product.verb).toBe('oc-vote');
        expect(r.scopes_granted).toEqual(['cross_integrator_human_event_count']);
        expect(r.scopes.cross_integrator_human_event_count).toBe('42');
    });

    it('honors a custom origin (staging)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ok: true,
                sub: 'sub_x',
                family_product: { verb: 'oc-vote', name: 'oc · vote', origin: 'https://vote.ochk.io' },
                scopes_granted: [],
                scopes: {},
            }),
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await family.scopes('oc-vote', { origin: 'https://me.staging.ochk.io' });
        expect(fetchMock.mock.calls[0]![0]).toBe(
            'https://me.staging.ochk.io/api/family/scopes/oc-vote'
        );
    });

    it('throws on non-2xx with status code', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: async () => '{"error":"unknown_family_verb"}',
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        await expect(family.scopes('oc-vote')).rejects.toThrow(/404/);
    });
});
