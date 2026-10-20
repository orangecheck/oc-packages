import { describe, expect, it } from 'vitest';

import { buildCsp, HSTS, relayOrigin, securityHeaders, siteHeaders, type CspOptions } from './index';

/** stamp.ochk.io's Content-Security-Policy as served on 2026-10-20, before the kit. */
const STAMP_SERVED =
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io https://insights.ochk.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' blob: mediastream:; font-src 'self' data:; connect-src 'self' https://plausible.io https://insights.ochk.io https://attest.ochk.io https://ochk.io https://*.calendar.opentimestamps.org https://finney.calendar.eternitywall.com https://mempool.space https://blockstream.info wss://relay.damus.io wss://nos.lol wss://relay.snort.social wss://relay.primal.net wss://offchain.pub wss://relay.ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const STAMP: CspOptions = {
    script: ['https://plausible.io', 'https://insights.ochk.io'],
    connect: [
        'https://plausible.io',
        'https://insights.ochk.io',
        'https://attest.ochk.io',
        'https://ochk.io',
        'https://*.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://mempool.space',
        'https://blockstream.info',
    ],
    relays: [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.snort.social',
        'wss://relay.primal.net',
        'wss://offchain.pub',
        'wss://relay.ochk.io',
    ],
    img: ['blob:'],
    media: ['blob:', 'mediastream:'],
};

describe('buildCsp', () => {
    it("reproduces stamp's served policy byte for byte", () => {
        expect(buildCsp(STAMP)).toBe(STAMP_SERVED);
    });

    // One snapshot per option set the family uses today.
    it.each<[string, CspOptions, string]>([
        [
            'minimal (docs, prod)',
            { connect: ['https://ochk.io', 'https://attest.ochk.io'] },
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ochk.io https://attest.ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        ],
        [
            'docs, dev',
            { connect: ['https://ochk.io', 'https://attest.ochk.io'], dev: true },
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: https://ochk.io https://attest.ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        ],
        [
            'pledge (media blob only)',
            { script: ['https://insights.ochk.io'], connect: ['https://insights.ochk.io', 'https://ochk.io'], img: ['blob:'], media: ['blob:'] },
            "default-src 'self'; script-src 'self' 'unsafe-inline' https://insights.ochk.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' https://insights.ochk.io https://ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        ],
        [
            'me-demo (frame-src, wildcard family)',
            { connect: ['https://ochk.io', 'https://*.ochk.io'], frame: ['https://me.ochk.io'] },
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ochk.io https://*.ochk.io; frame-src 'self' https://me.ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        ],
        [
            'chat /app (connect https: scheme)',
            { connect: ['https://ochk.io', 'https:'], relays: ['wss://relay.ochk.io/'] },
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://ochk.io https: wss://relay.ochk.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        ],
    ])('%s', (_name, opts, expected) => {
        expect(buildCsp(opts)).toBe(expected);
    });

    it('drops a source listed twice, keeping the first position', () => {
        expect(buildCsp({ connect: ['https://ochk.io'], relays: ['wss://nos.lol', 'wss://nos.lol/'] })).toContain(
            "connect-src 'self' https://ochk.io wss://nos.lol;"
        );
    });

    it.each<[string, CspOptions]>([
        ['a bare wildcard', { connect: ['*'] }],
        ['a wildcard over a TLD', { connect: ['https://*.io'] }],
        ['plain http', { connect: ['http://ochk.io'] }],
        ['an injected directive', { connect: ["https://ochk.io; script-src 'unsafe-eval'"] }],
        ['two sources in one string', { connect: ['https://ochk.io https://evil.example'] }],
        ['a quoted keyword in script-src', { script: ["'unsafe-eval'"] }],
        ['the https: scheme in script-src', { script: ['https:'] }],
        ['a wss host in script-src', { script: ['wss://relay.ochk.io'] }],
        ['data: in script-src', { script: ['data:'] }],
        ['uppercase host', { connect: ['https://OCHK.io'] }],
        ['an http frame', { frame: ['http://me.ochk.io'] }],
        ['a ws relay', { relays: ['ws://relay.ochk.io'] }],
        ['a relay with a query', { relays: ['wss://relay.ochk.io/?x=1'] }],
        ['a relay that is not a URL', { relays: ['relay.ochk.io'] }],
    ])('refuses %s', (_name, opts) => {
        expect(() => buildCsp(opts)).toThrow(TypeError);
    });

    it('never allows eval or ws: unless dev is set', () => {
        const csp = buildCsp(STAMP);
        expect(csp).not.toContain('unsafe-eval');
        expect(csp).not.toMatch(/\bws:/);
    });
});

describe('relayOrigin', () => {
    it('reduces a relay URL to the origin CSP matches on', () => {
        expect(relayOrigin('wss://relay.damus.io')).toBe('wss://relay.damus.io');
        expect(relayOrigin('wss://relay.damus.io/')).toBe('wss://relay.damus.io');
        expect(relayOrigin('wss://nostr.example:443/inbox')).toBe('wss://nostr.example');
    });
});

describe('securityHeaders', () => {
    it('sends the family set in order, HSTS at the longest any copy sent', () => {
        expect(securityHeaders({ csp: STAMP, camera: 'self' })).toEqual([
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'X-Frame-Options', value: 'DENY' },
            { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
            { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
            { key: 'Content-Security-Policy', value: STAMP_SERVED },
        ]);
        expect(HSTS).toBe('max-age=63072000; includeSubDomains; preload');
    });

    it('denies the camera unless asked', () => {
        const pp = securityHeaders({ csp: {} }).find((h) => h.key === 'Permissions-Policy');
        expect(pp?.value).toBe('camera=(), microphone=(), geolocation=()');
    });

    it('appends extra headers but never lets one replace a security header', () => {
        const hs = securityHeaders({ csp: {}, extra: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
        expect(hs.at(-1)).toEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
        expect(() => securityHeaders({ csp: {}, extra: [{ key: 'content-security-policy', value: '*' }] })).toThrow(TypeError);
        expect(() => securityHeaders({ csp: {}, extra: [{ key: 'X-A', value: 'a\r\nSet-Cookie: x=1' }] })).toThrow(TypeError);
    });

    it('siteHeaders applies the set to every path', () => {
        const [rule] = siteHeaders({ csp: STAMP });
        expect(rule?.source).toBe('/:path*');
        expect(rule?.headers.find((h) => h.key === 'Content-Security-Policy')?.value).toBe(STAMP_SERVED);
    });
});
