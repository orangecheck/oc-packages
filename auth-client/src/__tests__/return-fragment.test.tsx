/**
 * @vitest-environment jsdom
 *
 * A return address never puts the page's fragment in a URL: a fragment can
 * be a share link's envelope or a team invite's key, and a return address
 * rides in a query string that servers log. The fragment stays in this tab
 * and comes back when the browser does.
 */
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider, useOcSession } from '../provider';
import { FRAGMENT_TTL_MS, restoreReturnFragment, returnToHere, withoutFragment } from '../return-to';
import { redirectToSudo } from '../sudo';
import { TAB_SESSION_STORAGE_KEY } from '../tab-session';
import { buildAddAccountUrl, buildSignInUrl, DEFAULT_CONFIG } from '../types';

const SECRET = '#key=SECRET-team-key';
const PAGE = '/invite?team=t1';

/** Everything a built URL says, decoded, so an encoded fragment cannot hide. */
const said = (url: string) => decodeURIComponent(decodeURIComponent(url));

function at(path: string) {
    window.history.replaceState(null, '', path);
}

function serveSignedOut() {
    globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, account: null }), {
            headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof fetch;
}

beforeEach(() => {
    window.sessionStorage.clear();
    serveSignedOut();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    at('/');
});

/** Land on `path` as the auth host sends the browser back, then mount the app. */
function returnTo(path: string) {
    at(path);
    const seen: string[] = [];
    function Page() {
        // What a page reading its fragment on mount sees: the invite reads its key here.
        React.useEffect(() => {
            seen.push(window.location.hash);
        }, []);
        return null;
    }
    render(
        <OcSessionProvider>
            <Page />
        </OcSessionProvider>
    );
    return seen;
}

describe('a fragment never goes into a built URL', () => {
    it('redirectToSudo sends the page without its fragment, and it comes back', () => {
        at(PAGE + SECRET);
        const original = window.location;
        const assign = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...original, href: original.href, origin: original.origin, assign },
        });
        try {
            redirectToSudo({ purpose: 'join a team' });
        } finally {
            Object.defineProperty(window, 'location', { configurable: true, value: original });
        }
        const sent = assign.mock.calls[0]![0] as string;
        expect(said(sent)).not.toContain('#');
        expect(said(sent)).not.toContain('SECRET');
        expect(new URL(sent).searchParams.get('return_to')).toBe(`${original.origin}${PAGE}`);

        // The auth host sends the browser back to return_to; the page reads its key on mount.
        expect(returnTo(PAGE)).toEqual([SECRET]);
        expect(window.location.hash).toBe(SECRET);
        expect(window.sessionStorage.length).toBe(0);
    });

    it('buildSignInUrl and buildAddAccountUrl drop it from return_to, and keep nothing while rendering', () => {
        at(PAGE + SECRET);
        const here = window.location.href;
        for (const url of [
            buildSignInUrl(DEFAULT_CONFIG, here),
            buildAddAccountUrl(DEFAULT_CONFIG, here),
        ]) {
            expect(said(url)).not.toContain('SECRET');
            expect(new URL(url).searchParams.get('return_to')).toBe(
                `${window.location.origin}${PAGE}`
            );
        }
        // Building a link is not leaving: a page that only renders one keeps nothing.
        expect(window.sessionStorage.length).toBe(0);
    });

    it('following a link that returns here keeps the fragment, and it comes back', () => {
        at(PAGE + SECRET);
        render(
            <OcSessionProvider>
                <a href={buildSignInUrl(DEFAULT_CONFIG, window.location.href)}>Sign in</a>
                <a href={`/signin?return_to=${encodeURIComponent('/somewhere-else')}`}>Other</a>
            </OcSessionProvider>
        );
        // jsdom cannot navigate; stop it after the provider's capture listener has run.
        const stop = (e: Event) => e.preventDefault();
        document.addEventListener('click', stop);
        try {
            (document.querySelector('a[href^="/signin"]') as HTMLAnchorElement).click();
            expect(window.sessionStorage.length).toBe(0);
            (document.querySelector('a[href^="https://ochk.io"]') as HTMLAnchorElement).click();
        } finally {
            document.removeEventListener('click', stop);
        }
        expect(window.sessionStorage.length).toBe(1);
        cleanup();
        expect(returnTo(PAGE)).toEqual([SECRET]);
        expect(window.sessionStorage.length).toBe(0);
    });

    it("the session's signInUrl leaves it out too", () => {
        at(PAGE + SECRET);
        let signInUrl = '';
        function Probe() {
            signInUrl = useOcSession().signInUrl;
            return null;
        }
        render(
            <OcSessionProvider>
                <Probe />
            </OcSessionProvider>
        );
        expect(signInUrl).toContain('return_to=');
        expect(said(signInUrl)).not.toContain('SECRET');
    });

    it('returnToHere gives the path and query, for a site that builds /signin?return_to= itself', () => {
        at(PAGE + SECRET);
        const rt = returnToHere();
        expect(rt).toBe(PAGE);
        expect(returnTo(PAGE)).toEqual([SECRET]);
    });
});

describe('putting it back', () => {
    it("comes back in place of the auth host's #oc-adopt marker", () => {
        at(PAGE + SECRET);
        returnToHere();
        window.sessionStorage.setItem(
            TAB_SESSION_STORAGE_KEY,
            JSON.stringify({ token: 'stale', didOc: 'did:oc:stale' })
        );
        expect(returnTo(`${PAGE}#oc-adopt`)).toEqual([SECRET]);
        // The marker still did its job: the stale pin is gone.
        expect(window.sessionStorage.getItem(TAB_SESSION_STORAGE_KEY)).toBeNull();
    });

    it('is used once', () => {
        at(PAGE + SECRET);
        returnToHere();
        at(PAGE);
        expect(restoreReturnFragment()).toBe(true);
        at(PAGE);
        expect(restoreReturnFragment()).toBe(false);
        expect(window.location.hash).toBe('');
    });

    it('never overwrites a fragment the address brought', () => {
        at(PAGE + SECRET);
        returnToHere();
        expect(returnTo(`${PAGE}#other`)).toEqual(['#other']);
    });

    it('lapses after the time a check can take', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        at(PAGE + SECRET);
        returnToHere();
        vi.setSystemTime(Date.now() + FRAGMENT_TTL_MS + 1);
        at(PAGE);
        expect(restoreReturnFragment()).toBe(false);
        expect(window.location.hash).toBe('');
    });

    it('belongs to its own path only', () => {
        at(PAGE + SECRET);
        returnToHere();
        at('/elsewhere');
        expect(restoreReturnFragment()).toBe(false);
        expect(window.location.hash).toBe('');
    });

    it('drops, never keeps, a fragment bound for another origin', () => {
        expect(withoutFragment(`https://other.example${PAGE}${SECRET}`)).toBe(
            `https://other.example${PAGE}`
        );
        expect(window.sessionStorage.length).toBe(0);
    });
});
