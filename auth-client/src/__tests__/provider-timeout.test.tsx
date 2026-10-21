/**
 * @vitest-environment jsdom
 *
 * A session check that never answers must not leave a page loading forever.
 * The fetch below holds /api/auth/me open and only ever settles when its
 * signal aborts, as a real hung request does.
 */

import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ME_TIMEOUT_MS, OcSessionProvider, useOcSession } from '../provider';

let meCalls = 0;

function hangMe() {
    meCalls = 0;
    globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith('/api/auth/me')) meCalls++;
        return new Promise<Response>((_, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
        });
    }) as unknown as typeof fetch;
}

function mount() {
    let state: ReturnType<typeof useOcSession> | null = null;
    function Probe() {
        state = useOcSession();
        return null;
    }
    render(
        <OcSessionProvider config={{ multiAccount: false }}>
            <Probe />
        </OcSessionProvider>
    );
    return () => state!;
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('OcSessionProvider · a session check that never answers', () => {
    it('gives up after ten seconds with an error, where AbortSignal.timeout exists', async () => {
        hangMe();
        // Hand the timeout to the test, so the ten seconds need not pass.
        const controllers: AbortController[] = [];
        const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
            const c = new AbortController();
            controllers.push(c);
            return c.signal;
        });
        const session = mount();
        await waitFor(() => expect(meCalls).toBe(1));
        expect(session().status).toBe('loading');
        expect(timeout).toHaveBeenCalledWith(ME_TIMEOUT_MS);
        expect(ME_TIMEOUT_MS).toBe(10_000);

        act(() => controllers[0]!.abort(new DOMException('timed out', 'TimeoutError')));
        await waitFor(() => expect(session().status).toBe('error'));
        expect(session().error?.message).toMatch(/did not answer within 10s/);
        expect(meCalls).toBe(1);
    });

    it('gives up after ten seconds where AbortSignal.timeout is missing', async () => {
        hangMe();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const original = AbortSignal.timeout;
        // An engine without it.
        Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true });
        try {
            const session = mount();
            // Let the mount effect send the request without moving the clock.
            await act(async () => {});
            expect(meCalls).toBe(1);
            await act(async () => {
                vi.advanceTimersByTime(ME_TIMEOUT_MS - 1);
            });
            expect(session().status).toBe('loading');
            await act(async () => {
                vi.advanceTimersByTime(1);
            });
            await act(async () => {});
            expect(session().status).toBe('error');
            // One request, no retries.
            await act(async () => {
                vi.advanceTimersByTime(ME_TIMEOUT_MS * 3);
            });
            expect(meCalls).toBe(1);
        } finally {
            Object.defineProperty(AbortSignal, 'timeout', { value: original, configurable: true });
        }
    });
});
