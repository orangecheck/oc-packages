/**
 * @vitest-environment jsdom
 *
 * The sign-in link ochk.io mails a held address signs in only the browser that
 * asked for it (R14-4). On a first-party site that browser holds a key: its
 * hash goes with the start, the key itself with the link.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));

import { linkBind, parseHeldLink, readLinkKey } from '../held-link';
import { OcSignIn } from '../signin';

const KEY_STORAGE = 'oc-signin-link-key';
const WRONG_BROWSER =
    'This link works only in the browser where you asked to sign in. Open it there, or ask for a new link here.';
const SECRET = 'S'.repeat(43);

function b64url(s: string): string {
    return Buffer.from(s).toString('base64url');
}

function linkToken(payload: Record<string, unknown>): string {
    return `${b64url('{"alg":"EdDSA"}')}.${b64url(JSON.stringify(payload))}.c2ln`;
}

const EMAIL = 'alice@example.com';
const live = () => Math.floor(Date.now() / 1000) + 600;
const TOKEN = () => linkToken({ purpose: 'email-otp', ceremony: 'signin', email: EMAIL, exp: live() });

type Call = { url: string; init?: RequestInit; body: Record<string, unknown> | null };

function stubFetch(answer: (url: string) => { status?: number; body: unknown } | undefined): Call[] {
    const calls: Call[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init, body: init?.body ? JSON.parse(String(init.body)) : null });
        const hit = answer(u) ?? { status: 404, body: {} };
        return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
    }) as unknown as typeof fetch;
    return calls;
}

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
const posts = (calls: Call[], path: string) => calls.filter((c) => c.url.endsWith(path));

beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/signin');
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('linkBind', () => {
    it('keeps one key in this browser and sends its hash, the same on every start', async () => {
        const first = await linkBind();
        const key = window.localStorage.getItem(KEY_STORAGE)!;
        expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(first).toBe(sha256hex(key));
        expect(await linkBind()).toBe(first);
        expect(readLinkKey()).toBe(key);
    });

    it('makes the key from exactly 32 random bytes, nothing added', async () => {
        const spy = vi
            .spyOn(globalThis.crypto, 'getRandomValues')
            .mockImplementation(<T extends ArrayBufferView | null>(a: T) => {
                (a as unknown as Uint8Array).fill(7);
                return a;
            });
        await linkBind();
        expect(spy).toHaveBeenCalledTimes(1);
        expect((spy.mock.calls[0]![0] as Uint8Array).length).toBe(32);
        expect(window.localStorage.getItem(KEY_STORAGE)).toBe(Buffer.alloc(32, 7).toString('base64url'));
    });

    it('sends nothing when the browser keeps no storage', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('denied');
        });
        expect(await linkBind()).toBeUndefined();
    });

    it('sends nothing when the browser drops what it is given to keep', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => undefined);
        expect(await linkBind()).toBeUndefined();
    });
});

describe('parseHeldLink', () => {
    it('reads a whole sign-in link and nothing else', () => {
        const token = TOKEN();
        expect(parseHeldLink(`#oc-link=${token}.${SECRET}`)).toMatchObject({
            token,
            secret: SECRET,
            email: EMAIL,
        });
        const sudo = linkToken({ purpose: 'email-otp', ceremony: 'sudo', email: EMAIL, exp: live() });
        expect(parseHeldLink(`#oc-link=${sudo}.${SECRET}`)).toBeNull();
        expect(parseHeldLink(`#${token}.${SECRET}`)).toBeNull();
        expect(parseHeldLink(`#oc-link=${token}.${SECRET.slice(1)}`)).toBeNull();
    });
});

describe('OcSignIn · the start asks for a link bound to this browser', () => {
    function startWith(props: Partial<React.ComponentProps<typeof OcSignIn>>) {
        const calls = stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.endsWith('/email-otp/start')) return { body: { ok: true, token: 't1' } };
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.app" linkPrompt={false} {...props} />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: EMAIL } });
        return calls;
    }

    it('first-party: sends the hash of the key it keeps', async () => {
        const calls = startWith({ mode: 'first-party', onSuccess: () => undefined });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        await waitFor(() => expect(posts(calls, '/email-otp/start')).toHaveLength(1));
        const key = window.localStorage.getItem(KEY_STORAGE)!;
        expect(posts(calls, '/email-otp/start')[0]!.body).toEqual({
            email: EMAIL,
            link_bind: sha256hex(key),
        });
    });

    it('a family site sends none: ochk.io binds its link with a cookie', async () => {
        const calls = startWith({});
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        await waitFor(() => expect(posts(calls, '/email-otp/start')).toHaveLength(1));
        expect(posts(calls, '/email-otp/start')[0]!.body).toEqual({ email: EMAIL });
        expect(window.localStorage.getItem(KEY_STORAGE)).toBeNull();
    });
});

describe('OcSignIn · first-party, opened from the link', () => {
    function openLink(
        verify: { status?: number; body: unknown },
        { withKey = true, token = TOKEN(), family = false } = {}
    ) {
        let key: string | null = null;
        if (withKey) {
            key = 'K'.repeat(43);
            window.localStorage.setItem(KEY_STORAGE, key);
        }
        window.history.replaceState(null, '', `/signin?return_to=%2Fme#oc-link=${token}.${SECRET}`);
        const calls = stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.endsWith('/email-otp/verify')) return verify;
            return undefined;
        });
        const onSuccess = vi.fn();
        render(
            <OcSignIn
                audience="https://ochk.app"
                mode={family ? undefined : 'first-party'}
                authOrigin="https://ochk.io"
                onSuccess={onSuccess}
            />
        );
        return { calls, onSuccess, key, token };
    }

    it('takes the secret out of the address bar, sends nothing before the press, then signs in with the key', async () => {
        const account = { did_oc: 'did:oc:abc' };
        const { calls, onSuccess, key, token } = openLink({
            body: { ok: true, account, token: 'session-jwt' },
        });
        expect(window.location.hash).toBe('');
        expect(window.location.pathname + window.location.search).toBe('/signin?return_to=%2Fme');
        expect(screen.getByText('a***@example.com')).toBeTruthy();
        expect(posts(calls, '/email-otp/verify')).toHaveLength(0);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
        });
        const sent = posts(calls, '/email-otp/verify');
        expect(sent).toHaveLength(1);
        expect(sent[0]!.url).toBe('https://ochk.io/api/auth/email-otp/verify');
        expect(sent[0]!.init?.credentials).toBe('omit');
        expect(sent[0]!.body).toEqual({ email: EMAIL, token, link_secret: SECRET, link_key: key });
        expect(onSuccess).toHaveBeenCalledWith(account, 'session-jwt');
    });

    it('another browser: refused by ochk.io, says to open it where it was asked, and offers the form', async () => {
        const { calls, onSuccess } = openLink({ status: 401, body: { ok: false, reason: 'wrong_browser' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
        });
        expect(onSuccess).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toBe(WRONG_BROWSER);
        expect(screen.queryByRole('button', { name: /^Sign in/ })).toBeNull();
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Ask for a new link/ }));
        });
        expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
        expect(posts(calls, '/email-otp/verify')).toHaveLength(1);
    });

    it('a browser with no key says so and sends nothing', () => {
        const { calls } = openLink({ body: {} }, { withKey: false });
        expect(screen.getByRole('alert').textContent).toBe(WRONG_BROWSER);
        expect(screen.queryByRole('button', { name: /^Sign in/ })).toBeNull();
        expect(posts(calls, '/email-otp/verify')).toHaveLength(0);
    });

    it('an expired link says so and sends nothing', () => {
        const token = linkToken({ purpose: 'email-otp', ceremony: 'signin', email: EMAIL, exp: 1 });
        const { calls } = openLink({ body: {} }, { token });
        expect(screen.getByRole('alert').textContent).toBe('This link has expired. Ask for a new one.');
        expect(posts(calls, '/email-otp/verify')).toHaveLength(0);
    });

    it('a refusal another press can change keeps the button', async () => {
        openLink({ status: 429, body: { ok: false, reason: 'rate_limited' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
        });
        expect(screen.getByRole('alert').textContent).toBe('Too many tries just now. Wait a minute, then press it again.');
        expect(screen.getByRole('button', { name: /^Sign in/ })).toBeTruthy();
    });

    it('a request that never reached ochk.io keeps the button, to press again', async () => {
        const { calls, onSuccess } = openLink({ body: {} });
        globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), init, body: null });
            throw new TypeError('Failed to fetch');
        }) as unknown as typeof fetch;
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
        });
        expect(onSuccess).not.toHaveBeenCalled();
        expect(posts(calls, '/email-otp/verify')).toHaveLength(1);
        expect(screen.getByRole('alert').textContent).toBe("That didn't work. Press it again in a minute.");
        expect(screen.getByRole('button', { name: /^Sign in/ })).toBeTruthy();
    });

    it('a family site leaves the fragment alone: its links go to ochk.io', () => {
        const { calls } = openLink({ body: {} }, { family: true });
        expect(window.location.hash).toMatch(/^#oc-link=/);
        expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
        expect(posts(calls, '/email-otp/verify')).toHaveLength(0);
    });
});
