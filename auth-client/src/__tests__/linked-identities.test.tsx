/**
 * @vitest-environment jsdom
 *
 * `fetchOcLinkedIdentities` must resolve the SAME account the calling
 * tab displays. A tab pins itself with an `x-oc-tab-session` JWT; the
 * host's `/api/auth/identities` reads that header (fail-closed) before
 * the shared cookie. If this fetch omitted the header it would list the
 * cookie-default account's identities inside a menu whose chip shows the
 * pinned account — a menu that disagrees with itself.
 *
 * The `OcSessionProvider` also installs a global fetch interceptor that
 * pins same-authOrigin requests, but the exported function must be
 * correct STANDALONE (any surface may call it outside a provider), so we
 * assert the header directly on its own fetch init.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOcLinkedIdentities } from '../linked-identities';
import { clearTabSession, TAB_SESSION_HEADER, writeTabSession } from '../tab-session';

function stubFetch(body: unknown, status = 200) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return calls;
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
    return new Headers(init?.headers ?? {}).get(name);
}

afterEach(() => {
    clearTabSession();
    vi.restoreAllMocks();
});

describe('fetchOcLinkedIdentities · per-tab pinning', () => {
    it('sends the tab-session header when the tab is pinned', async () => {
        writeTabSession({ token: 'tab-jwt-abc', didOc: 'did:oc:pinned' });
        const calls = stubFetch({ ok: true, linked: [] });

        await fetchOcLinkedIdentities();

        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('https://ochk.io/api/auth/identities');
        expect(headerOf(calls[0].init, TAB_SESSION_HEADER)).toBe('tab-jwt-abc');
    });

    it('sends NO tab header when the tab is unpinned (cookie-default behavior)', async () => {
        clearTabSession();
        const calls = stubFetch({ ok: true, linked: [] });

        await fetchOcLinkedIdentities();

        expect(headerOf(calls[0].init, TAB_SESSION_HEADER)).toBeNull();
    });

    it('returns [] on 401 (fail-closed, e.g. a stale/invalid pin)', async () => {
        writeTabSession({ token: 'dead', didOc: 'did:oc:x' });
        stubFetch({ ok: false }, 401);

        await expect(fetchOcLinkedIdentities()).resolves.toEqual([]);
    });
});
