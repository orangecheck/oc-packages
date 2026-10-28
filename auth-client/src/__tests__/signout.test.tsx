/**
 * @vitest-environment jsdom
 *
 * signOut() ends a session only when the auth host says it did. A refusal or no
 * answer leaves the session live, so the provider keeps the account and the
 * caller hears that it failed: never "signed out" while the cookie lives on.
 */

import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcAccountChip, OcAccountPill } from '../components';
import { OcSessionProvider, useOcSession } from '../provider';
import { readTabSession, writeTabSession } from '../tab-session';
import type { OcSignOutResult } from '../types';

const ACCOUNT = {
    id: 'acc-a',
    did_oc: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    display_name: 'Alice',
    primary_btc: null,
    has_email: false,
    display_identity: { kind: 'did', value: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
};

type Logout = 'ok' | 401 | 503 | 'network';
function setupFetch(logout: Logout) {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        calls.push(u);
        if (u.includes('/api/auth/logout')) {
            if (logout === 'network') throw new TypeError('Failed to fetch');
            if (logout === 'ok') return new Response('{"ok":true}', { status: 200 });
            return new Response('{"ok":false}', { status: logout });
        }
        if (u.endsWith('/api/auth/me')) {
            return new Response(JSON.stringify({ account: ACCOUNT, roster: [] }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    return calls;
}

async function signedIn() {
    let s: ReturnType<typeof useOcSession> | null = null;
    function Probe() {
        s = useOcSession();
        return null;
    }
    render(
        <OcSessionProvider>
            <Probe />
        </OcSessionProvider>
    );
    await waitFor(() => expect(s?.status).toBe('authenticated'));
    return () => s!;
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
});

describe('signOut() reports what the auth host did', () => {
    it('200: signed out, anonymous, and the tab pin is cleared', async () => {
        setupFetch('ok');
        const s = await signedIn();
        writeTabSession({ token: 't', didOc: ACCOUNT.did_oc });
        let r: OcSignOutResult | undefined;
        await act(async () => {
            r = await s().trySignOut();
        });
        expect(r).toEqual({ ok: true });
        expect(s().status).toBe('anonymous');
        expect(s().account).toBeNull();
        expect(readTabSession()).toBeNull();
    });

    it('401: no session reached the host, so there is none to end: signed out', async () => {
        setupFetch(401);
        const s = await signedIn();
        let r: OcSignOutResult | undefined;
        await act(async () => {
            r = await s().trySignOut();
        });
        expect(r).toEqual({ ok: true });
        expect(s().status).toBe('anonymous');
    });

    it('503: not signed out; the account stays, the pin stays, and the caller is told', async () => {
        setupFetch(503);
        const s = await signedIn();
        writeTabSession({ token: 't', didOc: ACCOUNT.did_oc });
        let r: OcSignOutResult | undefined;
        await act(async () => {
            r = await s().trySignOut();
        });
        expect(r).toEqual({ ok: false, reason: 'refused', status: 503 });
        expect(s().status).toBe('authenticated');
        expect(s().account?.didOc).toBe(ACCOUNT.did_oc);
        expect(readTabSession()).not.toBeNull();
    });

    it('no answer at all: not signed out, and the caller is told; it never rejects', async () => {
        setupFetch('network');
        const s = await signedIn();
        let r: OcSignOutResult | undefined;
        await act(async () => {
            r = await s().trySignOut();
        });
        expect(r).toEqual({ ok: false, reason: 'unreachable' });
        expect(s().status).toBe('authenticated');
    });

    it('scope current refused: no refresh, nothing changes', async () => {
        const calls = setupFetch(503);
        const s = await signedIn();
        const before = calls.filter((c) => c.endsWith('/api/auth/me')).length;
        let r: OcSignOutResult | undefined;
        await act(async () => {
            r = await s().trySignOut({ scope: 'current' });
        });
        expect(r).toMatchObject({ ok: false, reason: 'refused' });
        expect(calls.filter((c) => c.endsWith('/api/auth/me')).length).toBe(before);
        expect(s().status).toBe('authenticated');
    });
});

describe('signOut() keeps its type and stops reporting a sign-out that did not happen', () => {
    it('resolves (never rejects) and leaves the account shown when the host refused', async () => {
        setupFetch(503);
        const s = await signedIn();
        await act(async () => {
            await expect(s().signOut()).resolves.toBeUndefined();
        });
        expect(s().status).toBe('authenticated');
    });

    it('resolves and signs out when the host ended the session', async () => {
        setupFetch('ok');
        const s = await signedIn();
        await act(async () => {
            await expect(s().signOut()).resolves.toBeUndefined();
        });
        expect(s().status).toBe('anonymous');
    });
});

describe('the account components say when sign-out did not happen', () => {
    it('OcAccountPill: a refused sign-out shows the alert and keeps the account; a done one hides the pill', async () => {
        setupFetch(503);
        render(
            <OcSessionProvider>
                <OcAccountPill />
            </OcSessionProvider>
        );
        const button = await screen.findByRole('button', { name: 'Sign out' });
        await act(async () => {
            fireEvent.click(button);
        });
        expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t sign out');
        expect(screen.getByText('Alice')).toBeTruthy();
        setupFetch('ok');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        });
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull());
    });

    it('OcAccountChip: a sign-out with no answer shows the alert; the chip stays signed in', async () => {
        setupFetch('network');
        render(
            <OcSessionProvider>
                <OcAccountChip />
            </OcSessionProvider>
        );
        const trigger = await screen.findByRole('button', { name: /Open account menu/ });
        fireEvent.click(trigger);
        await act(async () => {
            fireEvent.click(screen.getByRole('menuitem', { name: /sign out/ }));
        });
        expect((await screen.findByRole('alert')).textContent).toContain('still signed in');
        expect(screen.getByRole('button', { name: /Open account menu/ })).toBeTruthy();
    });
});
