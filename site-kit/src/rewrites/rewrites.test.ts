import type { NextConfig } from 'next';

import { describe, expect, it } from 'vitest';

import { externalRewrites, isSitePath } from './index';

const SCRIPT = {
    source: '/oc-insights.js',
    destination: 'https://plausible.io/js/script.outbound-links.pageview-props.tagged-events.js',
};
const EVENT = { source: '/oc-insights/event', destination: '/api/oc-insights/event' };

describe('externalRewrites: the rewrites that send a request to another origin', () => {
    it('finds a rewrite to plausible.io beside the site’s own', async () => {
        const config: NextConfig = { rewrites: async () => [SCRIPT, EVENT] };
        expect(await externalRewrites(config)).toEqual([SCRIPT]);
    });

    it('reads every phase of a phased list', async () => {
        const before = { source: '/a', destination: 'https://a.example/x' };
        const after = { source: '/b', destination: 'http://b.example' };
        const fallback = { source: '/c', destination: 'https://c.example/:path*' };
        const config: NextConfig = {
            rewrites: async () => ({
                beforeFiles: [before, { source: '/d', destination: '/d2' }],
                afterFiles: [after],
                fallback: [fallback],
            }),
        };
        expect(await externalRewrites(config)).toEqual([before, after, fallback]);
    });

    it('counts a protocol-relative or backslash destination as another origin', async () => {
        const slashes = { source: '/s', destination: '//evil.example/x' };
        const backslash = { source: '/t', destination: '/\\evil.example/x' };
        const config = { rewrites: () => [slashes, backslash, EVENT] };
        expect(await externalRewrites(config)).toEqual([slashes, backslash]);
    });

    it('counts a destination built from a missing variable as another origin', async () => {
        const unset = { source: '/u', destination: `${process.env.SITE_KIT_TEST_UNSET}/x` };
        expect(await externalRewrites({ rewrites: () => [unset] })).toEqual([unset]);
    });

    it('refuses a config exported as a function, which would otherwise read as empty', async () => {
        const asFunction = (() => ({ rewrites: async () => [SCRIPT] })) as unknown as NextConfig;
        await expect(externalRewrites(asFunction)).rejects.toThrow(TypeError);
    });

    it('is empty for a site with only its own paths, or no rewrites at all', async () => {
        const own: NextConfig = {
            rewrites: async () => [EVENT, { source: '/.well-known/jwks.json', destination: '/api/auth/jwks' }],
        };
        expect(await externalRewrites(own)).toEqual([]);
        expect(await externalRewrites({})).toEqual([]);
    });
});

describe('isSitePath', () => {
    it.each(['/', '/api/x', '/:path*', '/a//b'])('%s stays on the site', (d) => {
        expect(isSitePath(d)).toBe(true);
    });
    it.each(['https://plausible.io/api/event', 'http://x', '//x', '/\\x', 'api/x', ''])('%s does not', (d) => {
        expect(isSitePath(d)).toBe(false);
    });
});
