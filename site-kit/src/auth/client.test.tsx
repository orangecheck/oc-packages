// @vitest-environment jsdom
/**
 * The handler against the real auth-client provider: what a browser on a
 * family site actually does with each answer.
 */
import { OcSessionProvider, useOcSession } from '@orangecheck/auth-client';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeKeys, mint, recorder, type Keys } from './fixtures';
import { createMeHandler } from './me';
import { createSessionReader } from './session';

let keys: Keys;
let cookie = '';
let calls: Array<{ path: string; tab: boolean; status: number }> = [];

const handler = createMeHandler({ reader: createSessionReader() });

beforeEach(() => {
    keys = makeKeys();
    process.env.OC_AUTH_PUBLIC_JWK = keys.publicJwk;
    cookie = '';
    calls = [];
    sessionStorage.clear();
    vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
        const url = new URL(String(input), 'https://stamp.ochk.io');
        if (url.origin !== 'https://stamp.ochk.io' || url.pathname !== '/api/auth/me') {
            return new Response('{}', { status: 404 }); // auth host calls (tab pin, roster) are out of scope
        }
        const headers: Record<string, string> = {};
        new Headers(init.headers).forEach((v, k) => (headers[k] = v));
        if (cookie) headers.cookie = `oc_session=${cookie}`;
        const { res, out } = recorder();
        await handler({ method: init.method ?? 'GET', headers } as unknown as NextApiRequest, res as unknown as NextApiResponse);
        calls.push({ path: url.pathname, tab: 'x-oc-tab-session' in headers, status: out.status });
        return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
    });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete process.env.OC_AUTH_PUBLIC_JWK;
});

let state: ReturnType<typeof useOcSession> | null = null;
function Probe() {
    state = useOcSession();
    return null;
}
async function mount() {
    state = null;
    await act(async () => {
        render(
            <OcSessionProvider config={{ multiAccount: false }}>
                <Probe />
            </OcSessionProvider>
        );
    });
    await waitFor(() => expect(state?.status).not.toBe('loading'));
    return state!;
}

describe('auth-client against the kit handler', () => {
    it('signed out: anonymous, no error, one request', async () => {
        const s = await mount();
        expect(s.status).toBe('anonymous');
        expect(s.error).toBeNull();
        expect(s.account).toBeNull();
        expect(calls).toEqual([{ path: '/api/auth/me', tab: false, status: 200 }]);
    });

    it('signed in: authenticated as the cookie account', async () => {
        cookie = await mint(keys, 'did:oc:aa');
        const s = await mount();
        expect(s.status).toBe('authenticated');
        expect(s.account?.didOc).toBe('did:oc:aa');
    });

    it('a dead tab pin is dropped and the tab recovers on the cookie', async () => {
        cookie = await mint(keys, 'did:oc:aa');
        sessionStorage.setItem('oc_tab_session', JSON.stringify({ token: 'dead', didOc: 'did:oc:old' }));
        const s = await mount();
        expect(s.status).toBe('authenticated');
        expect(s.account?.didOc).toBe('did:oc:aa');
        expect(sessionStorage.getItem('oc_tab_session')).toBeNull();
        expect(calls).toEqual([
            { path: '/api/auth/me', tab: true, status: 401 },
            { path: '/api/auth/me', tab: false, status: 200 },
        ]);
    });

    it('a dead tab pin with no cookie ends anonymous, pin dropped', async () => {
        sessionStorage.setItem('oc_tab_session', JSON.stringify({ token: 'dead', didOc: 'did:oc:old' }));
        const s = await mount();
        expect(s.status).toBe('anonymous');
        expect(sessionStorage.getItem('oc_tab_session')).toBeNull();
    });
});
