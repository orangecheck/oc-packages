// @vitest-environment jsdom
import { signInWithOc } from '@orangecheck/me-client/popup';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { sent } from '../src/me';

/**
 * Plan §2, me-client 0.64.0: the sign-in popup hands a site exactly the account keys it does
 * today (id, did_oc, display_name, nostr_npub), for a family site and for any other.
 */

const POPUP = 'https://me.ochk.io';
const KEYS = ['did_oc', 'display_name', 'id', 'nostr_npub'];

afterEach(() => {
    vi.restoreAllMocks();
});

/** A popup that answers with what me.ochk.io's popup posted for `account`. */
async function signInAs(account: Record<string, unknown>) {
    const popup = { closed: false, focus() {}, close() {}, postMessage() {} };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const result = signInWithOc();
    expect(open).toHaveBeenCalledTimes(1);
    const url = new URL(open.mock.calls[0]![0] as string);
    expect(`${url.origin}${url.pathname}`).toBe(`${POPUP}/popup/signin`);
    const message = new Event('message');
    Object.assign(message, {
        origin: POPUP,
        source: popup,
        data: { type: 'oc-signin-success', account: structuredClone(account), token: 'token-made-here' },
    });
    window.dispatchEvent(message);
    return result;
}

describe('me-client 0.64.0 signInWithOc', () => {
    it.each(['family', 'other'] as const)('gives a %s site the four account keys and nothing else', async (who) => {
        const r = await signInAs(sent.popup[who]);
        expect(r).not.toBeNull();
        expect(Object.keys(r!.account).sort()).toEqual(KEYS);
        expect(r!.account).toEqual(sent.popup[who]);
        expect(r!.token).toBe('token-made-here');
    });
});
