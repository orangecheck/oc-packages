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
