/**
 * Multi-account · roster surface tests.
 *
 * Covers the wire-level pieces the React provider relies on:
 *   - buildAddAccountUrl appends ?add=1 (and preserves return_to)
 *   - The Required<OcAuthConfig> default carries the right logout path
 *     so signOut({scope:'current'}) can compose `?scope=current` onto
 *     it without confusion
 *
 * The provider itself is tested via jsdom in webauthn/sudo suites that
 * already mount @testing-library/react; replicating that here would
 * duplicate setup, so this file focuses on the pure functions that
 * underpin the multi-account flow.
 */

import { describe, expect, it } from 'vitest';

import { buildAddAccountUrl, DEFAULT_CONFIG, resolveConfig } from '../types';

describe('buildAddAccountUrl', () => {
    const cfg = DEFAULT_CONFIG;

    it('appends ?add=1 to the bare sign-in URL', () => {
        expect(buildAddAccountUrl(cfg)).toBe('https://ochk.io/signin?add=1');
    });

    it('preserves return_to alongside add=1', () => {
        const url = buildAddAccountUrl(cfg, 'https://stamp.ochk.io/dashboard');
        // Either ordering is acceptable URL-spec-wise — assert on parsed
        // params rather than literal string layout so the test survives
        // a switch to URLSearchParams default ordering changes.
        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe('https://ochk.io/signin');
        expect(parsed.searchParams.get('add')).toBe('1');
        expect(parsed.searchParams.get('return_to')).toBe('https://stamp.ochk.io/dashboard');
    });

    it('honors a custom signInPath when computing the add URL', () => {
        const custom = resolveConfig({ signInPath: '/auth/login' });
        expect(buildAddAccountUrl(custom)).toBe('https://ochk.io/auth/login?add=1');
    });

    it('does not collide with an existing add param on the returnTo', () => {
        // The returnTo URL has its own `add` param (it points at a page
        // that itself uses one) — buildAddAccountUrl sets the host-side
        // `add` on the OUTER URL, not on the returnTo string. The two
        // ?add=… occurrences are at different URL layers; the outer one
        // is what the auth host reads.
        const url = buildAddAccountUrl(cfg, 'https://app.example.com/page?add=foo');
        const parsed = new URL(url);
        expect(parsed.searchParams.get('add')).toBe('1');
        expect(parsed.searchParams.get('return_to')).toBe('https://app.example.com/page?add=foo');
    });
});

describe('resolveConfig defaults · multi-account composition', () => {
    it('default logoutPath is shape-compatible with ?scope=current append', () => {
        // The provider's signOut({scope:'current'}) builds a URL by
        // `new URL(authOrigin + logoutPath)` then sets ?scope=current on
        // it. This test guards against a future change to logoutPath
        // that would break that composition (e.g. baking a query string
        // into the default path itself).
        const cfg = DEFAULT_CONFIG;
        expect(cfg.logoutPath.includes('?')).toBe(false);
        const composed = new URL(`${cfg.authOrigin}${cfg.logoutPath}`);
        composed.searchParams.set('scope', 'current');
        expect(composed.toString()).toBe('https://ochk.io/api/auth/logout?scope=current');
    });
});
