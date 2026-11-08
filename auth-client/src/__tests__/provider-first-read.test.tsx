/**
 * @vitest-environment jsdom
 *
 * A page can start its first session read from the document head, before the
 * bundle loads, and hand it to the provider. The provider takes it once, for
 * its first check, and reads again itself whenever that read is no good.
 */

import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider, useOcSession } from '../provider';
import { TAB_SESSION_HEADER, writeTabSession } from '../tab-session';

const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:first-read', display_name: 'Ada' };

let meCalls: RequestInit[] = [];
function serveMe(answer: () => Response) {
    meCalls = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/api/auth/me')) {
            meCalls.push(init ?? {});
            return answer();
        }
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
}

const signedIn = () => Response.json({ account: ACCOUNT });

function mount(firstRead?: () => Promise<Response> | null | undefined) {
    let state: ReturnType<typeof useOcSession> | null = null;
    function Probe() {
        state = useOcSession();
        return null;
    }
    render(
        <OcSessionProvider config={{ multiAccount: false }} firstRead={firstRead}>
            <Probe />
        </OcSessionProvider>
    );
    return () => state!;
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
});

describe('OcSessionProvider · firstRead', () => {
    it('takes a signed-in answer the page started, and sends no read of its own', async () => {
        serveMe(signedIn);
        const session = mount(() => Promise.resolve(signedIn()));
        await waitFor(() => expect(session().status).toBe('authenticated'));
        expect(session().account?.didOc).toBe('did:oc:first-read');
        expect(meCalls).toHaveLength(0);
    });

    it('takes a signed-out answer the page started, and sends no read of its own', async () => {
        serveMe(signedIn);
        const session = mount(() => Promise.resolve(Response.json({ ok: true, account: null })));
        await waitFor(() => expect(session().status).toBe('anonymous'));
        expect(meCalls).toHaveLength(0);
    });

    it.each([
        ['answered 503', () => Promise.resolve(Response.json({ account: ACCOUNT }, { status: 503 }))],
        ['answered 401', () => Promise.resolve(Response.json({ account: null }, { status: 401 }))],
        ['answered 200 with no account', () => Promise.resolve(Response.json({ ok: true }))],
        ['answered 200 with an account that is not an object', () =>
            Promise.resolve(Response.json({ account: 'did:oc:first-read' }))],
        ['answered 200 with a list', () => Promise.resolve(Response.json([ACCOUNT]))],
        ['failed', () => Promise.reject(new TypeError('Failed to fetch'))],
        ['answered 200 with a body that is not JSON', () => Promise.resolve(new Response('<html>'))],
        ['was already read', () => {
            const used = signedIn();
            void used.text();
            return Promise.resolve(used);
        }],
        ['is not a response', () => Promise.resolve({} as Response)],
        ['threw when asked for', () => {
            throw new Error('no start');
        }],
    ])('reads again itself when the started read %s', async (_, firstRead) => {
        serveMe(signedIn);
        const session = mount(firstRead as () => Promise<Response>);
        await waitFor(() => expect(session().status).toBe('authenticated'));
        expect(meCalls).toHaveLength(1);
    });

    it('reads again itself when the started read does not answer in time', async () => {
        serveMe(signedIn);
        const controllers: AbortController[] = [];
        vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
            const c = new AbortController();
            controllers.push(c);
            return c.signal;
        });
        const session = mount(() => new Promise<Response>(() => {}));
        await waitFor(() => expect(controllers).toHaveLength(1));
        expect(session().status).toBe('loading');
        expect(meCalls).toHaveLength(0);
        act(() => controllers[0]!.abort(new DOMException('timed out', 'TimeoutError')));
        await waitFor(() => expect(session().status).toBe('authenticated'));
        expect(meCalls).toHaveLength(1);
    });

    it('is taken by the first check only', async () => {
        serveMe(signedIn);
        const firstRead = vi.fn(() => Promise.resolve(signedIn()));
        const session = mount(firstRead);
        await waitFor(() => expect(session().status).toBe('authenticated'));
        await act(async () => session().refresh());
        expect(firstRead).toHaveBeenCalledTimes(1);
        expect(meCalls).toHaveLength(1);
    });

    it('is dropped in a tab that carries a pin, whose own read sends it', async () => {
        writeTabSession({ token: 'pinned-token', didOc: 'did:oc:first-read' });
        serveMe(signedIn);
        // A good signed-out answer, but sent without the pin: taken, it would show this tab signed out.
        const firstRead = vi.fn(() => Promise.resolve(Response.json({ account: null })));
        const session = mount(firstRead);
        await waitFor(() => expect(session().status).toBe('authenticated'));
        expect(firstRead).toHaveBeenCalledTimes(1);
        expect(meCalls).toHaveLength(1);
        expect((meCalls[0]!.headers as Record<string, string>)[TAB_SESSION_HEADER]).toBe(
            'pinned-token'
        );
    });

    it('without it, the first check reads as before', async () => {
        serveMe(signedIn);
        const session = mount();
        await waitFor(() => expect(session().status).toBe('authenticated'));
        expect(meCalls).toHaveLength(1);
    });
});
