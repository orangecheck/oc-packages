/**
 * Cross-tenant credential disclosure via the eTLD+1 approximation.
 *
 * `registrableDomain` had a 12-entry suffix set and returned the last two
 * labels for anything else. So `alice.github.io` and `attacker.github.io` both
 * reduced to `github.io`, `matchEntryToPage` answered 'registrable', and a
 * vault client would offer alice's credential on the attacker's page. Same for
 * vercel.app, pages.dev, herokuapp.com, blogspot.com, and every second-level
 * ccTLD outside the list.
 *
 * The docstring claimed it "falls back to the full host when the suffix is
 * unknown (stricter, never looser)". It returned the last two labels — the
 * opposite. The claim described the property the function should have had.
 *
 * The twelve suffixes that WERE listed behaved correctly, which is exactly why
 * a test written against the list would have passed. So these cases are
 * written against the suffixes that were MISSING.
 */
import { describe, expect, it } from 'vitest';

import { matchEntryToPage, registrableDomain } from './origin';

// Every one of these returned 'registrable' — "offer this credential" — before
// the fix. They are sibling tenants on shared hosting: unrelated parties.
const CROSS_TENANT: Array<[string, string]> = [
    ['https://alice.github.io', 'https://attacker.github.io'],
    ['https://alice.gitlab.io', 'https://attacker.gitlab.io'],
    ['https://mine.vercel.app', 'https://evil.vercel.app'],
    ['https://mine.netlify.app', 'https://evil.netlify.app'],
    ['https://a.pages.dev', 'https://b.pages.dev'],
    ['https://a.workers.dev', 'https://b.workers.dev'],
    ['https://mine.herokuapp.com', 'https://theirs.herokuapp.com'],
    ['https://mine.blogspot.com', 'https://theirs.blogspot.com'],
    ['https://mine.wordpress.com', 'https://theirs.wordpress.com'],
    ['https://mine.myshopify.com', 'https://theirs.myshopify.com'],
    ['https://mine.web.app', 'https://theirs.web.app'],
    ['https://mine.firebaseapp.com', 'https://theirs.firebaseapp.com'],
    ['https://mine.azurewebsites.net', 'https://theirs.azurewebsites.net'],
    ['https://mine.onrender.com', 'https://theirs.onrender.com'],
    ['https://mine.fly.dev', 'https://theirs.fly.dev'],
    ['https://mine.replit.dev', 'https://theirs.replit.dev'],
    ['https://mine.notion.site', 'https://theirs.notion.site'],
    ['https://mine.atlassian.net', 'https://theirs.atlassian.net'],
    ['https://mine.sharepoint.com', 'https://theirs.sharepoint.com'],
    // second-level ccTLDs that were outside the original twelve
    ['https://bank.co.il', 'https://evil.co.il'],
    ['https://shop.com.tr', 'https://evil.com.tr'],
    ['https://bank.co.kr', 'https://evil.co.kr'],
    ['https://bank.com.cn', 'https://evil.com.cn'],
    ['https://bank.com.tw', 'https://evil.com.tw'],
];

describe('matchEntryToPage — cross-tenant isolation', () => {
    it.each(CROSS_TENANT)('refuses %s on %s', (entry, page) => {
        expect(matchEntryToPage(entry, page)).toBe('none');
    });
});

describe('matchEntryToPage — legitimate matches still work', () => {
    it('treats www. and the bare domain as the same site', () => {
        expect(matchEntryToPage('https://www.example.com', 'https://example.com')).toBe(
            'registrable'
        );
    });

    it('handles a real multi-label suffix', () => {
        expect(
            matchEntryToPage('https://mail.example.co.uk', 'https://example.co.uk')
        ).toBe('registrable');
    });

    it('reports an identical origin as exact', () => {
        expect(matchEntryToPage('https://example.com', 'https://example.com')).toBe('exact');
    });

    it('offers a subdomain credential on its own tenant', () => {
        // The flip side of the isolation above: alice's OWN pages still match.
        expect(
            matchEntryToPage('https://alice.github.io/repo', 'https://alice.github.io/other')
        ).toBe('exact');
    });

    it('never offers an https entry to an http page', () => {
        expect(matchEntryToPage('https://example.com', 'http://example.com')).toBe('none');
    });
});

describe('registrableDomain', () => {
    it('keeps a shared-hosting tenant label', () => {
        expect(registrableDomain('alice.github.io')).toBe('alice.github.io');
        expect(registrableDomain('mine.vercel.app')).toBe('mine.vercel.app');
    });

    it('reduces a normal host to eTLD+1', () => {
        expect(registrableDomain('mail.example.com')).toBe('example.com');
        expect(registrableDomain('a.b.example.co.uk')).toBe('example.co.uk');
    });

    it('leaves a bare two-label host alone', () => {
        expect(registrableDomain('example.com')).toBe('example.com');
    });
});
