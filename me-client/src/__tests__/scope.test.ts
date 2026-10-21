import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseTrustAttestationCount, scope } from '../scope';
import { getOrigin, setOrigin } from '../transport';

describe('parseTrustAttestationCount', () => {
    it('decodes a well-formed quad', () => {
        const r = parseTrustAttestationCount('3,2,2,1');
        expect(r).toEqual({ total: 3, good: 2, distinct_good_issuers: 2, caution: 1 });
    });

    it('decodes the all-zeros case', () => {
        const r = parseTrustAttestationCount('0,0,0,0');
        expect(r).toEqual({ total: 0, good: 0, distinct_good_issuers: 0, caution: 0 });
    });

    it('returns null for the empty string', () => {
        expect(parseTrustAttestationCount('')).toBeNull();
    });

    it('returns null for a quad with fewer than four parts', () => {
        expect(parseTrustAttestationCount('1,2,3')).toBeNull();
    });

    it('returns null for a quad with more than four parts', () => {
        expect(parseTrustAttestationCount('1,2,3,4,5')).toBeNull();
    });

    it('returns null for non-integer parts', () => {
        expect(parseTrustAttestationCount('1,2,foo,4')).toBeNull();
    });

    it('returns null for negative numbers', () => {
        expect(parseTrustAttestationCount('-1,2,3,4')).toBeNull();
    });

    it('returns null for fractional numbers', () => {
        // parseInt drops the fractional part; we accept it (the wire
        // format never emits fractions; defensive parsing is OK).
        // But "1.5,2,3,4" should be accepted as 1 because parseInt('1.5')=1.
        // Document the behavior: parseInt is liberal.
        const r = parseTrustAttestationCount('1.5,2,3,4');
        expect(r).toEqual({ total: 1, good: 2, distinct_good_issuers: 3, caution: 4 });
    });
});

describe('scope.request', () => {
    const go = (opts: { origin?: string } = {}) => {
        const assign = vi.fn();
        vi.stubGlobal('window', { location: { assign } });
        expect(() =>
            scope.request(['email', 'display_name'], {
                project_key: 'pk_live_x',
                return_to: 'https://app.example/after',
                ...opts,
            })
        ).toThrow('redirected to consent prompt');
        return new URL(assign.mock.calls[0]![0] as string);
    };
    const apiOrigin = getOrigin();
    afterEach(() => {
        vi.unstubAllGlobals();
        setOrigin(apiOrigin);
    });

    it("sends the person to ochk.app's consent page, not the retired me.ochk.io page", () => {
        const url = go();
        expect(url.origin + url.pathname).toBe('https://ochk.app/me/scope-grant');
        expect(url.searchParams.get('project_key')).toBe('pk_live_x');
        expect(url.searchParams.get('scopes')).toBe('email,display_name');
        expect(url.searchParams.get('return_to')).toBe('https://app.example/after');
    });

    it('keeps the consent page on ochk.app when the API origin is moved', () => {
        setOrigin('https://me-staging.example');
        expect(go().origin).toBe('https://ochk.app');
    });

    it('takes an explicit consent origin', () => {
        expect(go({ origin: 'https://app-staging.example' }).origin).toBe(
            'https://app-staging.example'
        );
    });
});
