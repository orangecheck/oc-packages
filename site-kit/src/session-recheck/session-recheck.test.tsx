// @vitest-environment jsdom
/**
 * The page side of a 401 several_sessions, against the real auth-client
 * provider and the kit's /api/auth/me: the page shows the account the
 * browser sends once the strays are cleared.
 */
import { OcSessionProvider, useOcSession } from '@orangecheck/auth-client';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeKeys, mint, recorder, type Keys } from '../auth/fixtures';
import { createMeHandler } from '../auth/me';
import { createSessionReader } from '../auth/session';
import { recheckOnSeveralSessions, SESSION_RECHECK_EVENT, useSessionRecheck } from './index';

let keys: Keys;
/** The Cookie header this browser sends to /api/auth/me. */
let jar = '';
let reads = 0;
const handler = createMeHandler({ reader: createSessionReader({ revocation: false }) });

beforeEach(() => {
    keys = makeKeys();
    process.env.OC_AUTH_PUBLIC_JWK = keys.publicJwk;
    jar = '';
    reads = 0;
    sessionStorage.clear();
    vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
        const url = new URL(String(input), 'https://vault.ochk.io');
        if (url.origin !== 'https://vault.ochk.io' || url.pathname !== '/api/auth/me') {
            return new Response('{}', { status: 404 });
        }
        reads++;
        const headers: Record<string, string> = { cookie: jar };
        new Headers(init.headers).forEach((v, k) => (headers[k] = v));
        const { res, out } = recorder();
        await handler({ method: init.method ?? 'GET', headers } as unknown as NextApiRequest, res as unknown as NextApiResponse);
        return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
    });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete process.env.OC_AUTH_PUBLIC_JWK;
});

let shown: string | null | undefined;
function Page() {
    const session = useOcSession();
    useSessionRecheck(session.refresh);
    shown = session.status === 'loading' ? undefined : (session.account?.didOc ?? null);
    return null;
}

describe('recheckOnSeveralSessions', () => {
    it('after a write came back several_sessions, the page shows the account the browser now sends', async () => {
        const stray = await mint(keys, 'did:oc:stray');
        const mine = await mint(keys, 'did:oc:mine');
        // The stray at /api is sent first: a read takes it.
        jar = `oc_session=${stray}; oc_session=${mine}`;
        await act(async () => {
            render(
                <OcSessionProvider config={{ multiAccount: false }}>
                    <Page />
                </OcSessionProvider>
            );
        });
        await waitFor(() => expect(shown).toBe('did:oc:stray'));

        // The 401's clears leave the cookie at ochk.io and /.
        jar = `oc_session=${mine}`;
        let said = false;
        await act(async () => {
            said = recheckOnSeveralSessions(401, { ok: false, reason: 'several_sessions' });
        });
        expect(said).toBe(true);
        await waitFor(() => expect(shown).toBe('did:oc:mine'));
    });

    it('sends nothing for any other answer', () => {
        const seen = vi.fn();
        window.addEventListener(SESSION_RECHECK_EVENT, seen);
        for (const [status, body] of [
            [401, { ok: false, reason: 'unauthenticated' }],
            [503, { ok: false, reason: 'several_sessions' }],
            [503, { ok: false, error: 'session_unverified' }],
            [200, { ok: true }],
            [401, null],
            [401, 'several_sessions'],
        ] as const) {
            expect(recheckOnSeveralSessions(status, body)).toBe(false);
        }
        window.removeEventListener(SESSION_RECHECK_EVENT, seen);
        expect(seen).not.toHaveBeenCalled();
    });
});

describe('useSessionRecheck', () => {
    function Hook({ refresh }: { refresh?: () => unknown }) {
        useSessionRecheck(refresh);
        return null;
    }

    it('reads again on each recheck, and stops once the page is gone', async () => {
        const refresh = vi.fn(async () => {});
        const { unmount } = render(<Hook refresh={refresh} />);
        recheckOnSeveralSessions(401, { reason: 'several_sessions' });
        recheckOnSeveralSessions(401, { reason: 'several_sessions' });
        expect(refresh).toHaveBeenCalledTimes(2);
        unmount();
        recheckOnSeveralSessions(401, { reason: 'several_sessions' });
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('does nothing outside a session provider', () => {
        render(<Hook />);
        expect(() => recheckOnSeveralSessions(401, { reason: 'several_sessions' })).not.toThrow();
        expect(reads).toBe(0);
    });
});
