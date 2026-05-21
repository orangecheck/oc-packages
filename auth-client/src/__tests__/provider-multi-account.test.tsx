/**
 * @vitest-environment jsdom
 *
 * Multi-account · provider integration tests.
 *
 * Exercises the cross-method dance the provider performs for the
 * roster surface: /api/auth/me is parsed for roster entries, the
 * roster array surfaces to consumers, switchAccount POSTs the right
 * body and refreshes on success, and signOut({scope:'current'})
 * composes the right URL.
 *
 * The provider mounts useEffect → fetch('/api/auth/me') on mount; we
 * wait on the resulting state with waitFor instead of pumping
 * microtasks by hand so the assertions are independent of React's
 * scheduling.
 */

import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider, useOcSession } from '../provider';

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

afterEach(() => {
    vi.clearAllMocks();
});

const ACCOUNT_A = {
    id: 'acc-a',
    did_oc: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    display_name: null,
    primary_btc: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    has_email: false,
    display_identity: { kind: 'btc', value: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
};

const ROSTER_PEER_B = {
    did_oc: 'did:oc:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    display_name: 'work',
    primary_btc: null,
    display_identity: { kind: 'email', value: 'me@example.com' },
    last_seen_at: '2026-05-20T10:00:00Z',
};

describe('OcSessionProvider · roster surface', () => {
    it('hydrates the roster from /api/auth/me and normalizes the entries', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
            }
            return jsonResponse({ ok: false }, 404);
        });

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

        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });
        expect(captured?.roster).toHaveLength(1);
        expect(captured?.roster[0]).toMatchObject({
            didOc: ROSTER_PEER_B.did_oc,
            displayName: 'work',
            primaryBtc: null,
            lastSeenAt: '2026-05-20T10:00:00Z',
        });
        // displayIdentity normalized to typed shape
        expect(captured?.roster[0]?.displayIdentity).toEqual({
            kind: 'email',
            value: 'me@example.com',
        });
    });

    it('treats missing roster field as an empty array (back-compat with pre-multi-account hosts)', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A });
            }
            return jsonResponse({ ok: false }, 404);
        });

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

        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });
        expect(captured?.roster).toEqual([]);
    });

    it('drops roster entries with no did_oc (defensive)', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({
                    account: ACCOUNT_A,
                    roster: [
                        ROSTER_PEER_B,
                        { display_name: 'malformed' }, // no did_oc
                    ],
                });
            }
            return jsonResponse({ ok: false }, 404);
        });

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

        await waitFor(() => {
            expect(captured?.roster).toHaveLength(1);
        });
        expect(captured?.roster[0]?.didOc).toBe(ROSTER_PEER_B.did_oc);
    });

    it('switchAccount POSTs /api/auth/switch with the did_oc body and refreshes on success', async () => {
        let phase: 'initial' | 'after-switch' = 'initial';
        const calls = setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                if (phase === 'initial') {
                    return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
                }
                // After the switch, /me returns account B as active and
                // A as the peer.
                return jsonResponse({
                    account: {
                        id: 'acc-b',
                        did_oc: ROSTER_PEER_B.did_oc,
                        display_name: 'work',
                        display_identity: ROSTER_PEER_B.display_identity,
                    },
                    roster: [
                        {
                            did_oc: ACCOUNT_A.did_oc,
                            display_name: null,
                            primary_btc: ACCOUNT_A.primary_btc,
                            display_identity: ACCOUNT_A.display_identity,
                            last_seen_at: '2026-05-20T11:00:00Z',
                        },
                    ],
                });
            }
            if (url.endsWith('/api/auth/switch')) {
                phase = 'after-switch';
                return jsonResponse({ ok: true, account: { did_oc: ROSTER_PEER_B.did_oc } });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });

        await act(async () => {
            await captured!.switchAccount(ROSTER_PEER_B.did_oc);
        });

        const switchCall = calls.find((c) => c.url.endsWith('/api/auth/switch'));
        expect(switchCall).toBeDefined();
        expect(switchCall?.init?.method).toBe('POST');
        expect(switchCall?.init?.credentials).toBe('include');
        expect(JSON.parse(switchCall?.init?.body as string)).toEqual({
            did_oc: ROSTER_PEER_B.did_oc,
        });

        await waitFor(() => {
            expect(captured?.account?.didOc).toBe(ROSTER_PEER_B.did_oc);
        });
        // The previous active account is now the peer.
        expect(captured?.roster).toHaveLength(1);
        expect(captured?.roster[0]?.didOc).toBe(ACCOUNT_A.did_oc);
    });

    it('switchAccount throws with the reason string when the host rejects', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
            }
            if (url.endsWith('/api/auth/switch')) {
                return jsonResponse({ ok: false, reason: 'not_in_roster' }, 403);
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });

        await expect(captured!.switchAccount(ROSTER_PEER_B.did_oc)).rejects.toThrow(
            /not_in_roster/
        );
    });

    it('signOut() default scope hits /api/auth/logout without a scope query param', async () => {
        const calls = setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            if (url.includes('/api/auth/logout')) {
                return jsonResponse({ ok: true });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });

        await act(async () => {
            await captured!.signOut();
        });

        const logoutCall = calls.find((c) => c.url.includes('/api/auth/logout'));
        expect(logoutCall).toBeDefined();
        expect(logoutCall?.url).not.toContain('scope=');
        // status flips to anonymous after the call
        await waitFor(() => {
            expect(captured?.status).toBe('anonymous');
            expect(captured?.account).toBeNull();
            expect(captured?.roster).toEqual([]);
        });
    });

    it('signOut({scope:"current"}) appends ?scope=current and refreshes (instead of clearing state)', async () => {
        let logoutCalled = false;
        const calls = setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                // After scope=current logout, the server has switched
                // to peer B; the next /me returns B as active.
                if (logoutCalled) {
                    return jsonResponse({
                        account: {
                            id: 'acc-b',
                            did_oc: ROSTER_PEER_B.did_oc,
                            display_name: 'work',
                            display_identity: ROSTER_PEER_B.display_identity,
                        },
                        roster: [],
                    });
                }
                return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
            }
            if (url.includes('/api/auth/logout')) {
                logoutCalled = true;
                return jsonResponse({ ok: true, scope: 'current', switched_to: { did_oc: ROSTER_PEER_B.did_oc } });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
            expect(captured?.account?.didOc).toBe(ACCOUNT_A.did_oc);
        });

        await act(async () => {
            await captured!.signOut({ scope: 'current' });
        });

        const logoutCall = calls.find((c) => c.url.includes('/api/auth/logout'));
        expect(logoutCall?.url).toContain('scope=current');
        // Active account flipped to the peer (via the refresh that
        // followed the successful scope=current logout).
        await waitFor(() => {
            expect(captured?.account?.didOc).toBe(ROSTER_PEER_B.did_oc);
            expect(captured?.status).toBe('authenticated');
        });
    });

    it('addAccountUrl returns the correct host URL with the current location as return_to', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });

        const url = captured!.addAccountUrl();
        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe('https://ochk.io/signin');
        expect(parsed.searchParams.get('add')).toBe('1');
        // jsdom default is http://localhost[:port]/ — return_to honors that.
        expect(parsed.searchParams.get('return_to')).toMatch(/^http:\/\/localhost(?::\d+)?\//);
    });

    it('addAccountUrl honors an explicit returnTo argument', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: ACCOUNT_A, roster: [] });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.status).toBe('authenticated');
        });

        const url = captured!.addAccountUrl('https://stamp.ochk.io/dashboard');
        const parsed = new URL(url);
        expect(parsed.searchParams.get('add')).toBe('1');
        expect(parsed.searchParams.get('return_to')).toBe('https://stamp.ochk.io/dashboard');
    });

    it('sources the roster from the auth host when the LOCAL /me carries none (consumer subdomain)', async () => {
        // Consumer case: the local (relative) /api/auth/me authenticates but
        // has no roster; the host (https://ochk.io/api/auth/me) has it. The
        // provider should fall back to the host and surface the peer.
        const calls = setupFetch(({ url }) => {
            if (url === 'https://ochk.io/api/auth/me') {
                return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
            }
            if (url === '/api/auth/me') {
                return jsonResponse({ account: ACCOUNT_A }); // no roster locally
            }
            return jsonResponse({ ok: false }, 404);
        });

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

        await waitFor(() => {
            expect(captured?.roster).toHaveLength(1);
        });
        expect(captured?.roster[0]?.didOc).toBe(ROSTER_PEER_B.did_oc);
        // Both the local and the host /me were consulted.
        expect(calls.some((c) => c.url === '/api/auth/me')).toBe(true);
        expect(calls.some((c) => c.url === 'https://ochk.io/api/auth/me')).toBe(true);
    });

    it('does NOT re-fetch the host when the local /me already carried a roster', async () => {
        const calls = setupFetch(({ url }) => {
            if (url === '/api/auth/me') {
                return jsonResponse({ account: ACCOUNT_A, roster: [ROSTER_PEER_B] });
            }
            return jsonResponse({ ok: false }, 404);
        });

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
        await waitFor(() => {
            expect(captured?.roster).toHaveLength(1);
        });
        // No cross-origin host call — the local roster was sufficient.
        expect(calls.some((c) => c.url === 'https://ochk.io/api/auth/me')).toBe(false);
    });
});
