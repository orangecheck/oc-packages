import { describe, expect, it } from 'vitest';

import {
    canonicalizeScope,
    canonicalizeScopeString,
    isSubScope,
    parseScope,
    ScopeParseError,
    validateScope,
} from './scope.js';

describe('parseScope', () => {
    it('parses a bare product:verb scope', () => {
        const s = parseScope('nostr:publish');
        expect(s.product).toBe('nostr');
        expect(s.verb).toBe('publish');
        expect(s.constraints).toHaveLength(0);
    });

    it('parses constraints with =, !=, <=, >=', () => {
        const s = parseScope('ln:send(max_sats<=1000,node=03abc,max_fee_sats<=10)');
        expect(s.constraints).toHaveLength(3);
        expect(s.constraints.find((c) => c.key === 'max_sats')?.op).toBe('<=');
        expect(s.constraints.find((c) => c.key === 'node')?.op).toBe('=');
    });

    it('accepts a wildcard constraint', () => {
        const s = parseScope('http:request(origin=*)');
        expect(s.constraints[0]?.op).toBe('*');
    });

    it('rejects whitespace', () => {
        expect(() => parseScope('lock:seal (recipient=bc)')).toThrow(ScopeParseError);
    });

    it('rejects duplicate keys', () => {
        expect(() => parseScope('ln:send(max_sats=1,max_sats=2)')).toThrow(ScopeParseError);
    });

    it('parses quoted values', () => {
        const s = parseScope('http:request(origin="https://a.example,b")');
        expect(s.constraints[0]?.value).toBe('https://a.example,b');
        expect(s.constraints[0]?.quoted).toBe(true);
    });
});

describe('canonicalize', () => {
    it('sorts constraints by key', () => {
        expect(canonicalizeScopeString('ln:send(node=03abc,max_sats<=1000)')).toBe(
            'ln:send(max_sats<=1000,node=03abc)'
        );
    });

    it('canonicalizes a no-constraint scope', () => {
        expect(canonicalizeScopeString('stamp:sign')).toBe('stamp:sign');
    });

    it('round-trips quoted values', () => {
        expect(canonicalizeScopeString('http:request(origin="a,b")')).toBe(
            'http:request(origin="a,b")'
        );
    });
});

describe('validateScope', () => {
    it('strict mode rejects unregistered product', () => {
        expect(() => validateScope(parseScope('xxx:yyy'))).toThrow(ScopeParseError);
    });

    it('strict mode rejects unregistered constraint key', () => {
        expect(() => validateScope(parseScope('lock:seal(zzz=1)'))).toThrow(ScopeParseError);
    });

    it('permissive mode accepts unregistered product/key', () => {
        expect(() =>
            validateScope(parseScope('xxx:yyy(foo=1)'), { mode: 'permissive' })
        ).not.toThrow();
    });
});

describe('isSubScope (SPEC §7.4)', () => {
    const cs = (s: string) => canonicalizeScope(parseScope(s));
    void cs;

    it('accepts exact match', () => {
        expect(
            isSubScope(
                parseScope('lock:seal(recipient=bc1qalice)'),
                parseScope('lock:seal(recipient=bc1qalice)')
            )
        ).toBe(true);
    });

    it('rejects different value under =', () => {
        expect(
            isSubScope(
                parseScope('stamp:sign(mime=application/pdf)'),
                parseScope('stamp:sign(mime=text/markdown)')
            )
        ).toBe(false);
    });

    it('accepts tighter numeric range', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=500,node=03abc,max_fee_sats=5)'),
                parseScope('ln:send(max_sats<=1000,node=03abc,max_fee_sats<=10)')
            )
        ).toBe(true);
    });

    it('rejects wider numeric range', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=5000)'),
                parseScope('ln:send(max_sats<=1000)')
            )
        ).toBe(false);
    });

    it('wildcard grants admit anything', () => {
        expect(
            isSubScope(
                parseScope('http:request(origin=https://evil.com)'),
                parseScope('http:request(origin=*)')
            )
        ).toBe(true);
    });

    it('exercised may add keys not in granted', () => {
        expect(
            isSubScope(
                parseScope('ln:send(max_sats=500,node=03abc,max_fee_sats=5)'),
                parseScope('ln:send(max_sats<=1000)')
            )
        ).toBe(true);
    });

    it('rejects mismatched product or verb', () => {
        expect(
            isSubScope(parseScope('lock:chat'), parseScope('lock:seal'))
        ).toBe(false);
    });

    it('accepts != with admissible value', () => {
        expect(
            isSubScope(
                parseScope('http:request(method=GET)'),
                parseScope('http:request(method!=POST)')
            )
        ).toBe(true);
    });

    it('rejects != with disallowed value', () => {
        expect(
            isSubScope(
                parseScope('http:request(method=POST)'),
                parseScope('http:request(method!=POST)')
            )
        ).toBe(false);
    });
});
