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
    consumeTabAccountHint,
    consumeTabAdoptMarker,
    installTabFetchInterceptor,
    installTabLinkDecorator,
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

/**
 * Create a transient `<a>`, dispatch a click/auxclick at it through the
 * window-level capture listener the decorator installs, then return the
 * anchor's (possibly mutated) `href` attribute. Mirrors a real browser
 * click without navigating.
 */
function fireLink(opts: {
    href: string;
    type?: 'click' | 'auxclick';
    init?: MouseEventInit;
    target?: string;
    download?: boolean;
}): string | null {
    const a = document.createElement('a');
    a.setAttribute('href', opts.href);
    if (opts.target) a.setAttribute('target', opts.target);
    if (opts.download) a.setAttribute('download', '');
    document.body.appendChild(a);
    // Swallow the anchor's default navigation (jsdom can't navigate) — runs
    // in the target phase, AFTER the window capture-phase decorator stamps.
    a.addEventListener(opts.type ?? 'click', (e) => e.preventDefault());
    a.dispatchEvent(
        new MouseEvent(opts.type ?? 'click', { bubbles: true, cancelable: true, ...opts.init })
    );
    const out = a.getAttribute('href');
    a.remove();
    return out;
}

afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
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

describe('installTabLinkDecorator', () => {
    const FAMILY = 'https://stamp.ochk.io/create';

    it('stamps a family link with the pinned did, leaves third parties alone', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');

        expect(fireLink({ href: FAMILY })).toBe(`${FAMILY}#oc-as=${DID_A}`);
        expect(fireLink({ href: 'https://example.com/x' })).toBe('https://example.com/x');

        uninstall();
    });

    it('never stamps when the tab is unpinned', () => {
        const uninstall = installTabLinkDecorator('https://ochk.io');
        expect(fireLink({ href: FAMILY })).toBe(FAMILY);
        uninstall();
    });

    it('reads the pin fresh on every event (no install-time capture)', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');
        expect(fireLink({ href: FAMILY })).toBe(`${FAMILY}#oc-as=${DID_A}`);

        writeTabSession({ token: 'tok-b', didOc: DID_B });
        expect(fireLink({ href: FAMILY })).toBe(`${FAMILY}#oc-as=${DID_B}`);
        uninstall();
    });

    it('stamps on middle-click (auxclick) too', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');
        expect(fireLink({ href: FAMILY, type: 'auxclick', init: { button: 1 } })).toBe(
            `${FAMILY}#oc-as=${DID_A}`
        );
        uninstall();
    });

    it('skips non-http schemes, downloads, and links that already carry a fragment', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');

        expect(fireLink({ href: 'mailto:hi@ochk.io' })).toBe('mailto:hi@ochk.io');
        expect(fireLink({ href: FAMILY, download: true })).toBe(FAMILY);
        expect(fireLink({ href: 'https://docs.ochk.io/x#section' })).toBe(
            'https://docs.ochk.io/x#section'
        );
        // idempotent: an already-stamped link is not double-stamped
        expect(fireLink({ href: `${FAMILY}#oc-as=${DID_B}` })).toBe(`${FAMILY}#oc-as=${DID_B}`);
        uninstall();
    });

    it('skips same-origin same-tab nav but stamps a same-origin new-tab intent', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');
        const sameOrigin = `${window.location.origin}/dashboard`;

        // plain left-click, same tab → pin survives via sessionStorage, no stamp
        expect(fireLink({ href: sameOrigin })).toBe(sameOrigin);
        // ctrl/⌘-click → new tab may not inherit sessionStorage (Safari) → stamp
        expect(fireLink({ href: sameOrigin, init: { ctrlKey: true } })).toBe(
            `${sameOrigin}#oc-as=${DID_A}`
        );
        // target=_blank → stamp
        expect(fireLink({ href: sameOrigin, target: '_blank' })).toBe(
            `${sameOrigin}#oc-as=${DID_A}`
        );
        uninstall();
    });

    it('stops stamping after uninstall', () => {
        writeTabSession({ token: 'tok-a', didOc: DID_A });
        const uninstall = installTabLinkDecorator('https://ochk.io');
        uninstall();
        expect(fireLink({ href: FAMILY })).toBe(FAMILY);
    });
});

describe('consumeTabAccountHint', () => {
    it('mints a pin for the hinted account and strips the fragment', async () => {
        const calls = setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/tab')) {
                return jsonResponse({ ok: true, token: 'tok-b', account: { did_oc: DID_B } });
            }
            return jsonResponse({ ok: false }, 404);
        });
        window.history.replaceState(null, '', `/page#oc-as=${DID_B}`);

        const adopted = await consumeTabAccountHint('https://ochk.io');

        expect(adopted).toBe(DID_B);
        expect(readTabSession()).toEqual({ token: 'tok-b', didOc: DID_B });
        expect(window.location.hash).toBe('');
        const tabCall = calls.find((c) => c.url.endsWith('/api/auth/tab'));
        expect(tabCall?.init?.method).toBe('POST');
        expect(JSON.parse(String(tabCall?.init?.body))).toEqual({ did_oc: DID_B });
    });

    it('no-ops (no fetch) without the marker', async () => {
        const calls = setupFetch(() => jsonResponse({ ok: true }));
        window.history.replaceState(null, '', '/page');
        expect(await consumeTabAccountHint('https://ochk.io')).toBeNull();
        expect(calls.length).toBe(0);
    });

    it('does not re-mint when already pinned to the hinted account', async () => {
        writeTabSession({ token: 'tok-b', didOc: DID_B });
        const calls = setupFetch(() => jsonResponse({ ok: true }));
        window.history.replaceState(null, '', `/page#oc-as=${DID_B}`);

        expect(await consumeTabAccountHint('https://ochk.io')).toBe(DID_B);
        expect(calls.length).toBe(0);
        expect(window.location.hash).toBe('');
    });

    it('leaves the tab unpinned (and strips the fragment) when the host refuses', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/tab')) return jsonResponse({ ok: false }, 403);
            return jsonResponse({ ok: false }, 404);
        });
        window.history.replaceState(null, '', `/page#oc-as=${DID_B}`);

        expect(await consumeTabAccountHint('https://ochk.io')).toBeNull();
        expect(readTabSession()).toBeNull();
        expect(window.location.hash).toBe('');
    });

    it('does not adopt a token minted for a different account (stale host)', async () => {
        setupFetch(({ url }) => {
            // host ignores the body and mints for the cookie default (A)
            if (url.endsWith('/api/auth/tab')) {
                return jsonResponse({ ok: true, token: 'tok-a', account: { did_oc: DID_A } });
            }
            return jsonResponse({ ok: false }, 404);
        });
        window.history.replaceState(null, '', `/page#oc-as=${DID_B}`);

        expect(await consumeTabAccountHint('https://ochk.io')).toBeNull();
        expect(readTabSession()).toBeNull();
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

    it('adopts the #oc-as hint before /me so a new tab resolves as the opener account', async () => {
        // The actual bug: a cross-subdomain new tab is unpinned and would
        // resolve to the cookie default (A). With the opener's `#oc-as=B`
        // hint, consumeTabAccountHint mints a B pin BEFORE the first /me,
        // so the tab resolves as B — not the cookie default.
        window.history.replaceState(null, '', `/page#oc-as=${DID_B}`);
        const calls = setupFetch(({ url, init }) => {
            if (url.endsWith('/api/auth/tab')) {
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
            expect(session()?.account?.didOc).toBe(DID_B);
        });
        expect(readTabSession()).toEqual({ token: 'tok-b', didOc: DID_B });
        expect(window.location.hash).toBe('');
        // every /me call carried the B pin — never resolved as the cookie default
        const meCalls = calls.filter((c) => c.url.endsWith('/api/auth/me'));
        expect(meCalls.length).toBeGreaterThan(0);
        for (const c of meCalls) {
            expect(headerOf(c.init, TAB_SESSION_HEADER)).toBe('tok-b');
        }
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
