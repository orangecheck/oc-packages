// @vitest-environment jsdom
/**
 * A provider sign-in the auth host refused comes back as `?oauth_error=…`.
 * Two refusals have a next step the person can take, so OcSignIn says what
 * happened and what to do; anything else keeps the general line. The host
 * names the provider as `oauth_provider`, shown only when it is one we know.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcSignIn } from './signin';

beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status: 404 }))
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
});

async function bannerFor(
    reason: string,
    family = false,
    provider?: string
): Promise<string | null> {
    const named = provider === undefined ? '' : `&oauth_provider=${encodeURIComponent(provider)}`;
    window.history.replaceState({}, '', `/signin?oauth_error=${encodeURIComponent(reason)}${named}`);
    render(
        family ? (
            <OcSignIn providersFirst={false} onSuccess={vi.fn()} />
        ) : (
            <OcSignIn mode="first-party" audience="https://ochk.app" onSuccess={vi.fn()} />
        )
    );
    await act(async () => {});
    return document.querySelector('[data-oc-signin-oauth-error]')?.textContent ?? null;
}

describe('OcSignIn after a refused provider sign-in', () => {
    it('says the email already has an account and to use an email code', async () => {
        const text = await bannerFor('email_code_required');
        expect(text).toMatch(/already has an orangecheck account/);
        expect(text).toMatch(/email code/);
    });

    it('opens on the email code where the wallet would lead', async () => {
        await bannerFor('email_code_required', true);
        expect(screen.getByRole('tab', { name: 'Email' }).getAttribute('aria-selected')).toBe('true');
    });

    it('says another provider account is already linked, and the way back in', async () => {
        const text = await bannerFor('account_mismatch');
        expect(text).toMatch(/different Google or GitHub account/);
        expect(text).toMatch(/email code/);
    });

    it('says a sign-out or deletion that landed while it ran ended it', async () => {
        expect(await bannerFor('signed_out', false, 'google')).toBe(
            'You were signed out while signing in. Sign in again.'
        );
        cleanup();
        expect(await bannerFor('account_deleted', true, 'github')).toBe(
            "This account is being deleted, so you can't sign in to it."
        );
    });

    it('says a sign-out elsewhere in this browser while it ran meant nothing was kept', async () => {
        expect(await bannerFor('no_roster', false, 'github')).toBe(
            "An account in this browser was signed out while you were signing in, so this sign-in wasn't kept. Sign in again."
        );
    });

    it('keeps the general line for anything else', async () => {
        expect(await bannerFor('access_denied')).toBe(
            "That sign-in didn't finish. Try again, or use another way below."
        );
    });

    it('names the provider the sign-in went through', async () => {
        expect(await bannerFor('access_denied', false, 'google')).toBe(
            "That Google sign-in didn't finish. Try again, or use another way below."
        );
        cleanup();
        expect(await bannerFor('1', true, 'github')).toBe(
            "That GitHub sign-in didn't finish. Try again, or use another way below."
        );
    });

    it('names the one provider whose other account is linked', async () => {
        expect(await bannerFor('account_mismatch', false, 'github')).toBe(
            'A different GitHub account is already linked to this email. Use that one, or sign in with an email code below.'
        );
    });

    it('is an alert, so a screen reader says the sign-in failed', async () => {
        const text = await bannerFor('access_denied', false, 'google');
        expect(screen.getByRole('alert').textContent).toBe(text);
    });

    it('shows no provider name it does not know', async () => {
        for (const provider of ['Your bank', 'GOOGLE', '', 'constructor', '__proto__']) {
            expect(await bannerFor('access_denied', false, provider)).toBe(
                "That sign-in didn't finish. Try again, or use another way below."
            );
            cleanup();
        }
    });
});
