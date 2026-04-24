import { describe, expect, it } from 'vitest';

import { buildSignInUrl, DEFAULT_CONFIG, resolveConfig } from '../types';

describe('resolveConfig', () => {
    it('falls back to defaults when nothing is passed', () => {
        expect(resolveConfig(undefined)).toEqual(DEFAULT_CONFIG);
    });

    it('merges partial config over the defaults', () => {
        expect(resolveConfig({ authOrigin: 'https://auth.example.com' })).toEqual({
            ...DEFAULT_CONFIG,
            authOrigin: 'https://auth.example.com',
        });
    });
});

describe('buildSignInUrl', () => {
    const cfg = DEFAULT_CONFIG;

    it('returns the bare sign-in URL when returnTo is omitted', () => {
        expect(buildSignInUrl(cfg)).toBe('https://ochk.io/signin');
    });

    it('url-encodes the returnTo query parameter', () => {
        const url = buildSignInUrl(cfg, 'https://attest.ochk.io/create?x=1');
        expect(url).toBe(
            'https://ochk.io/signin?return_to=https%3A%2F%2Fattest.ochk.io%2Fcreate%3Fx%3D1'
        );
    });

    it('honors a custom sign-in path', () => {
        expect(buildSignInUrl({ ...cfg, signInPath: '/auth/sign-in' })).toBe(
            'https://ochk.io/auth/sign-in'
        );
    });
});
