/**
 * @vitest-environment jsdom
 *
 * Per-tab account pinning · unit + provider integration tests.
 *
 * The pin is a real session JWT held in sessionStorage (per-tab by
 * nature) and presented as the `x-oc-tab-session` header. These tests
 * cover the storage module, the conservative fetch interceptor, and
 * the provider's pin lifecycle: pin-on-load, switch-re-pins, dead-pin
 * retry, and the drop-on-mismatch reconciliation.
 */

import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider, useOcSession } from '../provider';
import {
    clearTabSession,
    consumeTabAdoptMarker,
    installTabFetchInterceptor,
    readTabSession,
    TAB_SESSION_HEADER,
    TAB_SESSION_STORAGE_KEY,
    tabSessionHeader,
    writeTabSession,
} from '../tab-session';

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

function setupFetch(handler: (call: FetchCall) => Response) {
    const calls: FetchCall[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const call: FetchCall = { url: String(url), init };
        calls.push(call);
        return handler(call);
    }) as unknown as typeof fetch;
    return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
    if (!init?.headers) return null;
    return new Headers(init.headers).get(name);
}

afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
});

const DID_A = 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DID_B = 'did:oc:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const ACCOUNT_A = {
    id: 'acc-a',
    did_oc: DID_A,
    display_name: null,
    primary_btc: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    has_email: false,
};

const ACCOUNT_B = {
    id: 'acc-b',
    did_oc: DID_B,
    display_name: 'work',
    primary_btc: null,
    has_email: true,
};

describe('tab-session storage', () => {
    it('round-trips a pin and clears it', () => {
        expect(readTabSession()).toBeNull();
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        expect(readTabSession()).toEqual({ token: 'tok-a', didOc: DID_A });
        expect(tabSessionHeader()).toEqual({ [TAB_SESSION_HEADER]: 'tok-a' });
        clearTabSession();
        expect(readTabSession()).toBeNull();
        expect(tabSessionHeader()).toEqual({});
    });

    it('treats malformed storage as unpinned', () => {
        window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, 'not-json');
        expect(readTabSession()).toBeNull();
        window.sessionStorage.setItem(TAB_SESSION_STORAGE_KEY, JSON.stringify({ token: '' }));
        expect(readTabSession()).toBeNull();
    });
});

describe('installTabFetchInterceptor', () => {
    it('attaches the pin to same-origin requests and leaves third parties alone', async () => {
        const calls = setupFetch(() => jsonResponse({ ok: true }));
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabFetchInterceptor('https://ochk.io');

        await window.fetch('/api/data');
        await window.fetch('https://ochk.io/api/auth/me');
        await window.fetch('https://example.com/api');

        expect(headerOf(calls[0]?.init, TAB_SESSION_HEADER)).toBe('tok-a');
        expect(headerOf(calls[1]?.init, TAB_SESSION_HEADER)).toBe('tok-a');
        expect(headerOf(calls[2]?.init, TAB_SESSION_HEADER)).toBeNull();
        uninstall();
    });

    it('never overrides an existing Authorization or tab header', async () => {
        const calls = setupFetch(() => jsonResponse({ ok: true }));
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabFetchInterceptor('https://ochk.io');

        await window.fetch('/api/data', { headers: { Authorization: 'Bearer ocvt_x' } });
        await window.fetch('/api/data', { headers: { [TAB_SESSION_HEADER]: 'tok-z' } });

        expect(headerOf(calls[0]?.init, TAB_SESSION_HEADER)).toBeNull();
        expect(headerOf(calls[1]?.init, TAB_SESSION_HEADER)).toBe('tok-z');
        uninstall();
    });

    it('is a pass-through when unpinned and restores fetch on uninstall', async () => {
        const calls = setupFetch(() => jsonResponse({ ok: true }));
        const before = window.fetch;
        const uninstall = installTabFetchInterceptor('https://ochk.io');
        await window.fetch('/api/data');
        expect(headerOf(calls[0]?.init, TAB_SESSION_HEADER)).toBeNull();
        uninstall();
        expect(window.fetch).toBe(before);
    });
});

describe('consumeTabAdoptMarker', () => {
    it('clears the pin and strips the hash when the marker is present', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        window.history.replaceState(null, '', '/page#oc-adopt');
        expect(consumeTabAdoptMarker()).toBe(true);
        expect(readTabSession()).toBeNull();
        expect(window.location.hash).toBe('');
    });

    it('no-ops without the marker', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        window.history.replaceState(null, '', '/page');
        expect(consumeTabAdoptMarker()).toBe(false);
        expect(readTabSession()).toEqual({ token: 'tok-a', didOc: DID_A });
    });
});

describe('OcSessionProvider · per-tab pin lifecycle', () => {
    function mountProbe() {
        let captured: ReturnType<typeof useOcSession> | null = null;
        function Probe() {
            captured = useOcSession();
            return null;
        }
        render(
            <OcSessionProvider>
                <Probe />
            </OcSessionProvider>
        );
        return () => captured;
    }

    it('pins the tab on first authenticated resolve via /api/auth/tab', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/tab')) {
                return jsonResponse({ ok: true, token: 'tok-a', account: { did_oc: DID_A } });
            }
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            return jsonResponse({ ok: false }, 404);
        });

        const session = mountProbe();
        await waitFor(() => {
            expect(session()?.status).toBe('authenticated');
        });
        await waitFor(() => {
            expect(readTabSession()).toEqual({ token: 'tok-a', didOc: DID_A });
        });
    });

    it('stays unpinned (legacy behavior) when the host has no /api/auth/tab', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/tab')) return jsonResponse({ ok: false }, 404);
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            return jsonResponse({ ok: false }, 404);
        });

        const session = mountProbe();
        await waitFor(() => {
            expect(session()?.status).toBe('authenticated');
        });
        expect(readTabSession()).toBeNull();
        expect(session()?.tabPinned).toBe(false);
    });

    it('sends the pin on /me, and re-pins this tab from the switch response token', async () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const calls = setupFetch(({ url, init }) => {
            if (url.endsWith('/api/auth/switch')) {
                return jsonResponse({ ok: true, token: 'tok-b', account: { did_oc: DID_B } });
            }
            if (url.endsWith('/api/auth/me')) {
                const tab = headerOf(init, TAB_SESSION_HEADER);
                return jsonResponse({
                    account: tab === 'tok-b' ? ACCOUNT_B : ACCOUNT_A,
                    roster: [],
                });
            }
            return jsonResponse({ ok: false }, 404);
        });

        const session = mountProbe();
        await waitFor(() => {
            expect(session()?.account?.didOc).toBe(DID_A);
        });
        expect(session()?.tabPinned).toBe(true);

        await act(async () => {
            await session()?.switchAccount(DID_B);
        });
        expect(readTabSession()).toEqual({ token: 'tok-b', didOc: DID_B });
        await waitFor(() => {
            expect(session()?.account?.didOc).toBe(DID_B);
        });
        const switchCall = calls.find((c) => c.url.endsWith('/api/auth/switch'));
        expect(headerOf(switchCall?.init, TAB_SESSION_HEADER)).toBe('tok-a');
    });

    it('drops a dead pin on 401 and retries once as the cookie account', async () => {
        writeTabSession({ token: 'tok-dead', didOc: DID_B });
        setupFetch(({ url, init }) => {
            if (url.endsWith('/api/auth/me')) {
                if (headerOf(init, TAB_SESSION_HEADER) === 'tok-dead') {
                    return jsonResponse({ ok: false }, 401);
                }
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            if (url.endsWith('/api/auth/tab')) {
                return jsonResponse({ ok: true, token: 'tok-a', account: { did_oc: DID_A } });
            }
            return jsonResponse({ ok: false }, 404);
        });

        const session = mountProbe();
        await waitFor(() => {
            expect(session()?.account?.didOc).toBe(DID_A);
        });
        await waitFor(() => {
            // dead pin dropped, then re-pinned to the cookie account
            expect(readTabSession()).toEqual({ token: 'tok-a', didOc: DID_A });
        });
    });

    it('drops the pin when the server answers as a different account (pre-migration server)', async () => {
        writeTabSession({ token: 'tok-b', didOc: DID_B });
        setupFetch(({ url }) => {
            // server ignores the tab header entirely and answers as A
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            if (url.endsWith('/api/auth/tab')) return jsonResponse({ ok: false }, 404);
            return jsonResponse({ ok: false }, 404);
        });

        const session = mountProbe();
        await waitFor(() => {
            expect(session()?.account?.didOc).toBe(DID_A);
        });
        expect(readTabSession()).toBeNull();
        expect(session()?.tabPinned).toBe(false);
    });
});
