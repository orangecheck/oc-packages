/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSudoRequired, redirectToSudo } from '../sudo';

describe('redirectToSudo', () => {
    let assignSpy: ReturnType<typeof vi.fn>;
    const originalLocation = window.location;

    beforeEach(() => {
        assignSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...originalLocation,
                href: 'https://me.ochk.io/me/settings',
                assign: assignSpy,
            },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
        vi.clearAllMocks();
    });

    it('redirects to https://ochk.io/sudo with default return_to + given purpose', () => {
        redirectToSudo({ purpose: 'register hardware key' });
        expect(assignSpy).toHaveBeenCalledOnce();
        const url = new URL(assignSpy.mock.calls[0]![0] as string);
        expect(url.origin).toBe('https://ochk.io');
        expect(url.pathname).toBe('/sudo');
        expect(url.searchParams.get('return_to')).toBe('https://me.ochk.io/me/settings');
        expect(url.searchParams.get('purpose')).toBe('register hardware key');
    });

    it('honors an explicit returnTo over window.location.href', () => {
        redirectToSudo({ returnTo: 'https://me.ochk.io/me/identity', purpose: 'link email' });
        const url = new URL(assignSpy.mock.calls[0]![0] as string);
        expect(url.searchParams.get('return_to')).toBe('https://me.ochk.io/me/identity');
        expect(url.searchParams.get('purpose')).toBe('link email');
    });

    it('honors an authOrigin override', () => {
        redirectToSudo({
            purpose: 'register hardware key',
            config: { authOrigin: 'https://staging.ochk.io' },
        });
        const url = new URL(assignSpy.mock.calls[0]![0] as string);
        expect(url.origin).toBe('https://staging.ochk.io');
    });
});

describe('handleSudoRequired', () => {
    let assignSpy: ReturnType<typeof vi.fn>;
    const originalLocation = window.location;

    beforeEach(() => {
        assignSpy = vi.fn();
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...originalLocation,
                href: 'https://me.ochk.io/me/settings',
                assign: assignSpy,
            },
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: originalLocation,
        });
        vi.clearAllMocks();
    });

    it('redirects + returns true when body.reason === "sudo_required"', () => {
        const handled = handleSudoRequired(
            { reason: 'sudo_required' },
            { purpose: 'register key' }
        );
        expect(handled).toBe(true);
        expect(assignSpy).toHaveBeenCalledOnce();
    });

    it('returns false on any other reason', () => {
        expect(handleSudoRequired({ reason: 'not_authenticated' })).toBe(false);
        expect(handleSudoRequired({ reason: 'cancelled' })).toBe(false);
        expect(handleSudoRequired({})).toBe(false);
        expect(handleSudoRequired(null)).toBe(false);
        expect(handleSudoRequired(undefined)).toBe(false);
        expect(assignSpy).not.toHaveBeenCalled();
    });
});
