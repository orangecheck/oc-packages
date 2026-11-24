// @vitest-environment jsdom
import * as current from '@orangecheck/auth-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as older from 'auth-client-2.51.0';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMAIL, IDENTITY_KEY, keyed, plain } from '../src/account';

/**
 * Plan §2, auth-client 2.52.0 and 2.51.0: a site's account chip, address input and linked
 * identities read an account carrying an identity key exactly as before. No primary address, no
 * btc row, nothing suggested, and the offer to link a Bitcoin address stays.
 */

const AUTH = 'https://ochk.io';
type Account = typeof plain;

/** ochk.io's answers for `account`, and a 404 for anything else. The page is on ochk.io (vitest.config.ts). */
function serve(account: Account) {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(raw, window.location.href);
        if (window.location.origin !== AUTH) throw new Error(`the page is on ${window.location.origin}`);
        if (url.origin === AUTH && url.pathname === '/api/auth/me') return Response.json(account.me);
        if (url.origin === AUTH && url.pathname === '/api/auth/identities' && !url.search)
            return Response.json(account.identities);
        return Response.json({ ok: false }, { status: 404 });
    });
}

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe.each([
    ['auth-client 2.52.0', current],
    ['auth-client 2.51.0', older],
] as const)('%s', (_name, ac) => {
    async function sessionOf(account: Account) {
        serve(account);
        let seen: ReturnType<typeof ac.useOcSession> | null = null;
        function Probe() {
            seen = ac.useOcSession();
            return null;
        }
        render(
            <ac.OcSessionProvider config={{ authOrigin: AUTH }}>
                <Probe />
            </ac.OcSessionProvider>
        );
        await waitFor(() => expect(seen?.status).toBe('authenticated'));
        const account_ = seen!.account!;
        cleanup();
        return account_;
    }

    it('useOcSession reads the same account: no primary address, shown by email', async () => {
        const before = await sessionOf(plain);
        expect(before).toMatchObject({
            didOc: plain.me.account.did_oc,
            primaryBtc: null,
            hasEmail: true,
            displayIdentity: { kind: 'email', value: EMAIL },
        });
        expect(before.signingMethod).not.toBe('bip322');
        expect(await sessionOf(keyed)).toEqual(before);
    });

    it('OcAddressInput suggests nothing', async () => {
        const shown: string[] = [];
        for (const account of [plain, keyed]) {
            serve(account);
            let status = '';
            function Probe() {
                status = ac.useOcSession().status;
                return null;
            }
            render(
                <ac.OcSessionProvider config={{ authOrigin: AUTH }}>
                    <Probe />
                    <ac.OcAddressInput value="" onValueChange={() => {}} aria-label="address" />
                </ac.OcSessionProvider>
            );
            await waitFor(() => expect(status).toBe('authenticated'));
            fireEvent.focus(screen.getByLabelText('address'));
            expect(screen.queryByRole('listbox')).toBeNull();
            expect(document.body.textContent).not.toContain(IDENTITY_KEY.address);
            shown.push(document.body.innerHTML);
            cleanup();
        }
        expect(shown[0]).toContain('aria-label="address"');
        expect(shown[1]).toBe(shown[0]);
    });

    it('fetchOcLinkedIdentities returns the same rows: the email, no btc', async () => {
        serve(plain);
        const before = await ac.fetchOcLinkedIdentities({ authOrigin: AUTH });
        expect(before.map((r) => [r.kind, r.value])).toEqual([['email', EMAIL]]);
        serve(keyed);
        expect(await ac.fetchOcLinkedIdentities({ authOrigin: AUTH })).toEqual(before);
    });

    it('OcLinkedIdentities renders the same panel, still offering to link a Bitcoin address', async () => {
        const shown: string[] = [];
        for (const account of [plain, keyed]) {
            serve(account);
            render(<ac.OcLinkedIdentities authOrigin={AUTH} />);
            await waitFor(() => expect(document.body.textContent).toContain('§ bitcoin address'));
            shown.push(document.body.innerHTML);
            cleanup();
        }
        expect(shown[0]).toContain('none linked');
        expect(shown[0]).toContain('link a Bitcoin address');
        expect(shown[1]).toBe(shown[0]);
    });
});
