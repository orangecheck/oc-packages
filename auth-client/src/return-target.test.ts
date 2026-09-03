/**
 * Return-target validation. These are the predicates that decide where a user
 * lands after authenticating, so a hole here is a post-authentication open
 * redirect on every site in the family.
 *
 * There was one. Both functions used to accept a candidate on
 * `startsWith('/') && !startsWith('//')`, and the WHATWG URL parser treats a
 * backslash as a slash in special schemes:
 *
 *     new URL('/\evil.example', 'https://attest.ochk.io').href
 *       -> 'https://evil.example/'
 *
 * OcSignIn hands the result to window.location.assign, so the victim completed
 * a real sign-in on a real ochk.io domain and was then sent to an attacker's
 * page. Only oc-me-web was immune, because its hand-copied local guard happened
 * to reject `/\` — a fix that was never propagated to the other fourteen sites
 * or to this package.
 *
 * The check is now "does it resolve to this origin", because whatever the URL
 * parser makes of the input is exactly what the browser will navigate to.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { familyReturnTarget, safeReturnTo } from './signin';

const ORIGIN = 'https://attest.ochk.io';

beforeEach(() => {
    // jsdom's default origin is not a family host; pin it so the same-origin
    // comparison is meaningful.
    vi.stubGlobal('window', { location: { origin: ORIGIN, assign: vi.fn() } });
});

/** Every one of these resolves off-origin despite looking path-like. */
const OFF_ORIGIN_PATHS = [
    '/\\evil.example', // backslash -> parsed as a slash
    '/\\/evil.example',
    '/\\\\evil.example',
    '//evil.example', // protocol-relative
    '/\t/evil.example', // tab is stripped by the parser
    '/\n/evil.example',
    '/\r/evil.example',
    'https://evil.example/',
    'http://evil.example/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
];

const SAME_ORIGIN_PATHS = ['/', '/dashboard', '/a/abc?x=1#y', '/deep/nested/path'];

describe('safeReturnTo', () => {
    it.each(OFF_ORIGIN_PATHS)('falls back to / for %j', (candidate) => {
        expect(safeReturnTo(candidate)).toBe('/');
    });

    it.each(SAME_ORIGIN_PATHS)('passes %j through', (candidate) => {
        expect(safeReturnTo(candidate)).toBe(candidate);
    });

    it('falls back for absent or non-string input', () => {
        expect(safeReturnTo(undefined)).toBe('/');
        expect(safeReturnTo('' as string)).toBe('/');
        expect(safeReturnTo(42 as unknown as string)).toBe('/');
    });
});

describe('familyReturnTarget', () => {
    it.each(OFF_ORIGIN_PATHS.filter((p) => p.startsWith('/')))(
        'refuses the path-shaped off-origin candidate %j',
        (candidate) => {
            expect(familyReturnTarget(candidate)).toBeUndefined();
        }
    );

    it.each(SAME_ORIGIN_PATHS)('accepts the same-origin path %j', (candidate) => {
        expect(familyReturnTarget(candidate)).toBe(candidate);
    });

    it('accepts absolute https family URLs', () => {
        expect(familyReturnTarget('https://ochk.io/dashboard')).toBe('https://ochk.io/dashboard');
        expect(familyReturnTarget('https://vault.ochk.io/')).toBe('https://vault.ochk.io/');
    });

    it('refuses a lookalike host that merely ends in the brand', () => {
        // endsWith('.ochk.io') is what makes this safe — a bare suffix check on
        // 'ochk.io' would accept these.
        expect(familyReturnTarget('https://evilochk.io/')).toBeUndefined();
        expect(familyReturnTarget('https://ochk.io.evil.example/')).toBeUndefined();
    });

    it('refuses http for absolute family URLs — the auth host is https-only', () => {
        expect(familyReturnTarget('http://ochk.io/')).toBeUndefined();
    });

    it('refuses empty, null and non-string input', () => {
        expect(familyReturnTarget('')).toBeUndefined();
        expect(familyReturnTarget(null)).toBeUndefined();
        expect(familyReturnTarget(undefined)).toBeUndefined();
    });
});
