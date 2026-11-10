import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signInWithOc, signInWithOcOutcome } from '../popup';

/**
 * A site needs to tell "the browser blocked the window" (ask to allow pop-ups)
 * from "the person closed it" (do nothing). signInWithOcOutcome says which;
 * signInWithOc keeps resolving null for every case but a sign-in.
 */

const POPUP_ORIGIN = 'https://me.ochk.io';
const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };

type Listener = (event: MessageEvent) => void;
function fakeWindow(popup: { closed: boolean; focus(): void; close(): void } | null) {
    const listeners = new Set<Listener>();
    const w = {
        location: { origin: 'https://site.example' },
        open: vi.fn(() => popup),
        addEventListener: (type: string, fn: Listener) => {
            if (type === 'message') listeners.add(fn);
        },
        removeEventListener: (type: string, fn: Listener) => {
            if (type === 'message') listeners.delete(fn);
        },
        post(event: Partial<MessageEvent>) {
            for (const fn of [...listeners]) fn(event as MessageEvent);
        },
    };
    vi.stubGlobal('window', w);
    return w;
}
const popupWindow = () => ({
    closed: false,
    focus() {},
    close() {
        this.closed = true;
    },
    postMessage: vi.fn(),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('signInWithOcOutcome', () => {
    it('says "blocked" when the browser refuses to open the window', async () => {
        fakeWindow(null);
        expect(await signInWithOcOutcome()).toEqual({ status: 'blocked' });
        fakeWindow(null);
        expect(await signInWithOc()).toBeNull();
    });

    it('says "closed" when the person closes the window without signing in', async () => {
        const popup = popupWindow();
        fakeWindow(popup);
        const pending = signInWithOcOutcome();
        popup.closed = true;
        await vi.advanceTimersByTimeAsync(600);
        expect(await pending).toEqual({ status: 'closed' });
    });

    it('says "aborted" when the caller\'s signal fires', async () => {
        fakeWindow(popupWindow());
        const ac = new AbortController();
        const pending = signInWithOcOutcome({ signal: ac.signal });
        ac.abort();
        expect(await pending).toEqual({ status: 'aborted' });
    });

    it('says "signed_in", with the account and token, only for the popup it opened', async () => {
        const popup = popupWindow();
        const w = fakeWindow(popup);
        const pending = signInWithOcOutcome();
        const success = { type: 'oc-signin-success', account: ACCOUNT, token: 'tok' };
        w.post({ origin: POPUP_ORIGIN, source: {} as Window, data: success });
        w.post({ origin: 'https://evil.example', source: popup as unknown as Window, data: success });
        w.post({ origin: POPUP_ORIGIN, source: popup as unknown as Window, data: success });
        expect(await pending).toEqual({ status: 'signed_in', account: ACCOUNT, token: 'tok' });
    });

    it('signInWithOc still resolves the account and token, or null', async () => {
        const popup = popupWindow();
        const w = fakeWindow(popup);
        const pending = signInWithOc();
        w.post({
            origin: POPUP_ORIGIN,
            source: popup as unknown as Window,
            data: { type: 'oc-signin-success', account: ACCOUNT, token: 'tok' },
        });
        expect(await pending).toEqual({ account: ACCOUNT, token: 'tok' });
    });
});

/**
 * Before it signs anything, the popup asks its opener to prove it is the page
 * named in opener_origin: it posts a nonce there, and only that page can
 * receive it and send it back.
 */
describe('the popup checks who opened it', () => {
    const NONCE = 'n'.repeat(43);
    const challenge = (nonce: unknown = NONCE) => ({ type: 'oc-signin-challenge', nonce });

    it("answers the challenge of the popup it opened, to that popup's origin only, and keeps waiting", async () => {
        const popup = popupWindow();
        const w = fakeWindow(popup);
        let done = false;
        const pending = signInWithOcOutcome().then((o) => {
            done = true;
            return o;
        });
        w.post({ origin: POPUP_ORIGIN, source: popup as unknown as Window, data: challenge() });
        expect(popup.postMessage).toHaveBeenCalledTimes(1);
        expect(popup.postMessage).toHaveBeenCalledWith(
            { type: 'oc-signin-echo', nonce: NONCE },
            POPUP_ORIGIN
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(done).toBe(false);
        expect(popup.closed).toBe(false);
        w.post({
            origin: POPUP_ORIGIN,
            source: popup as unknown as Window,
            data: { type: 'oc-signin-success', account: ACCOUNT, token: 'tok' },
        });
        expect(await pending).toEqual({ status: 'signed_in', account: ACCOUNT, token: 'tok' });
    });

    it('answers at the popup origin it was given', async () => {
        const popup = popupWindow();
        const w = fakeWindow(popup);
        void signInWithOcOutcome({ popupOrigin: 'https://staging.example' });
        w.post({ origin: POPUP_ORIGIN, source: popup as unknown as Window, data: challenge() });
        expect(popup.postMessage).not.toHaveBeenCalled();
        w.post({ origin: 'https://staging.example', source: popup as unknown as Window, data: challenge() });
        expect(popup.postMessage).toHaveBeenCalledWith(
            { type: 'oc-signin-echo', nonce: NONCE },
            'https://staging.example'
        );
    });

    it('never answers a challenge from another origin or another window', async () => {
        const popup = popupWindow();
        const other = popupWindow();
        const w = fakeWindow(popup);
        void signInWithOcOutcome();
        w.post({ origin: 'https://evil.example', source: popup as unknown as Window, data: challenge() });
        w.post({ origin: POPUP_ORIGIN, source: other as unknown as Window, data: challenge() });
        w.post({ origin: POPUP_ORIGIN, source: null, data: challenge() });
        expect(popup.postMessage).not.toHaveBeenCalled();
        expect(other.postMessage).not.toHaveBeenCalled();
    });

    it('answers no challenge whose nonce is not 16 to 128 base64url characters', async () => {
        const popup = popupWindow();
        const w = fakeWindow(popup);
        void signInWithOcOutcome();
        const bad = [undefined, 123, '', 'short', 'has space ' + 'x'.repeat(20), 'x'.repeat(129), { n: NONCE }];
        for (const nonce of bad) {
            const data = { type: 'oc-signin-challenge', nonce };
            w.post({ origin: POPUP_ORIGIN, source: popup as unknown as Window, data });
        }
        const bare = { type: 'oc-signin-challenge' };
        w.post({ origin: POPUP_ORIGIN, source: popup as unknown as Window, data: bare });
        expect(popup.postMessage).not.toHaveBeenCalled();
    });
});
