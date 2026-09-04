import { describe, expect, it } from 'vitest';

import { ScopeNotGrantedError, assertScopeGranted } from './assert-scope.js';
import type { ScopesEncryptedEnvelope } from './types.js';

const SEALED = {
    v: 1,
    alg: 'x25519-xchacha20poly1305',
    recipients: [{ device_id: 'dev1', ct: 'AA' }],
    ct: 'BB',
    nonce: 'CC',
} as unknown as ScopesEncryptedEnvelope;

function reasonOf(fn: () => void): string {
    try {
        fn();
    } catch (e) {
        return e instanceof ScopeNotGrantedError ? e.reason : `wrong-error:${String(e)}`;
    }
    return 'no-throw';
}

describe('assertScopeGranted', () => {
    it('permits an exact grant and a sub-scope of one', () => {
        expect(() =>
            assertScopeGranted({ scopes: ['mcp:invoke(server=s,tool=t)'] }, 'mcp:invoke(server=s,tool=t)', 'f')
        ).not.toThrow();
        expect(() =>
            assertScopeGranted({ scopes: ['mcp:invoke(server=s)'] }, 'mcp:invoke(server=s,tool=t)', 'f')
        ).not.toThrow();
    });

    it('refuses a scope outside the grant', () => {
        expect(
            reasonOf(() => assertScopeGranted({ scopes: ['mcp:invoke(server=a)'] }, 'mcp:invoke(server=b)', 'f'))
        ).toBe('not_subscope');
    });

    // The whole reason this module exists. Five adapters open-coded
    // `(scopes ?? []).map(parseScope)`, so a v1.2 private delegation — where
    // `scopes` is absent BECAUSE it is sealed — reported "not a sub-scope of
    // any granted scope". The refusal was right; the diagnosis sent the
    // integrator to audit a scope string that was very possibly correct.
    it('names encrypted scopes as such rather than blaming the scope string', () => {
        const d = { scopes_encrypted: SEALED };
        expect(reasonOf(() => assertScopeGranted(d, 'mcp:invoke(server=s)', 'f'))).toBe('scopes_encrypted');
        try {
            assertScopeGranted(d, 'mcp:invoke(server=s)', 'f');
        } catch (e) {
            expect((e as Error).message).toMatch(/decryptPrivateScopes/);
            expect((e as Error).message).not.toMatch(/not a sub-scope/);
        }
    });

    it('treats absent and empty scopes as granting nothing, not everything', () => {
        expect(reasonOf(() => assertScopeGranted({}, 'x:y', 'f'))).toBe('no_scopes');
        expect(reasonOf(() => assertScopeGranted({ scopes: [] }, 'x:y', 'f'))).toBe('no_scopes');
    });

    // A sealed delegation that ALSO carries a scopes array must not be
    // evaluated against that array: the fields are exclusive per the spec, so
    // a populated `scopes` alongside `scopes_encrypted` is a malformed
    // envelope and possibly an attempt to present a benign readable grant
    // while the real one stays hidden.
    it('refuses on the sealed field even when a scopes array is also present', () => {
        expect(
            reasonOf(() =>
                assertScopeGranted({ scopes: ['x:y'], scopes_encrypted: SEALED }, 'x:y', 'f')
            )
        ).toBe('scopes_encrypted');
    });
});
