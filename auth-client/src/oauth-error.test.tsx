// @vitest-environment jsdom
/**
 * A provider sign-in the auth host refused comes back as `?oauth_error=…`.
 * Two refusals have a next step the person can take, so OcSignIn says what
 * happened and what to do; anything else keeps the general line.
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

async function bannerFor(reason: string, family = false): Promise<string | null> {
    window.history.replaceState({}, '', `/signin?oauth_error=${encodeURIComponent(reason)}`);
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

    it('keeps the general line for anything else', async () => {
        expect(await bannerFor('access_denied')).toMatch(/didn.t finish/);
    });
});
