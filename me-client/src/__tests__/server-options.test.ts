/**
 * The server adapters refuse an option they do not read. A misspelt
 * `projectKey` would otherwise skip the project's sign-in rule, a misspelt
 * `audience` would accept family sessions, and a misspelt `requireBond.minSats`
 * would read as 0.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/auth-core', async (importOriginal) => {
    const real = await importOriginal<typeof import('@orangecheck/auth-core')>();
    return { ...real, getOcSession: vi.fn(real.getOcSession) };
});
import { getOcSession as coreGetOcSession } from '@orangecheck/auth-core';

import {
    checkOcSession,
    getOcSession,
    ocAuthExpress,
    ocAuthHono,
    withOcAuth,
    type WithOcAuthOptions,
} from '../server';

const handler = () => undefined;
const headers = { cookie: null, authorization: null };

describe('unknown options', () => {
    it('every adapter throws when it is built with a misspelt projectKey', () => {
        const misspelt = { projectkey: 'pk_live_example' } as unknown as WithOcAuthOptions;
        expect(() => withOcAuth(handler, misspelt)).toThrow(TypeError);
        expect(() => withOcAuth(handler, misspelt)).toThrow(/unknown option projectkey/);
        expect(() => ocAuthExpress(misspelt)).toThrow(/unknown option projectkey/);
        expect(() => ocAuthHono(misspelt)).toThrow(/unknown option projectkey/);
    });

    it('a misspelt audience is refused, not read as no audience', async () => {
        const misspelt = { audiance: 'https://site.example' } as unknown as WithOcAuthOptions;
        expect(() => ocAuthExpress(misspelt)).toThrow(/unknown option audiance/);
        await expect(getOcSession(headers, misspelt)).rejects.toThrow(/unknown option audiance/);
        await expect(checkOcSession(headers, misspelt)).rejects.toThrow(/unknown option audiance/);
    });

    it('a misspelt bond threshold is refused, not read as 0', () => {
        const misspelt = { requireBond: { minsats: 100_000 } } as unknown as WithOcAuthOptions;
        expect(() => withOcAuth(handler, misspelt)).toThrow(/requireBond: unknown option minsats/);
    });

    it('every option they read is accepted', async () => {
        const known: WithOcAuthOptions = {
            issuer: 'https://ochk.io',
            jwksCacheTtlMs: 60_000,
            jwksMaxStaleMs: 60_000,
            audience: 'https://site.example',
            method: 'GET',
            projectKey: 'pk_live_example',
            meOrigin: 'https://me.ochk.io',
            revocation: false,
            required: true,
            requireBond: { minSats: 1, minDays: 1, maxAgeSecs: 60 },
        };
        expect(() => withOcAuth(handler, known)).not.toThrow();
        expect(() => ocAuthExpress(known)).not.toThrow();
        expect(() => ocAuthHono(known)).not.toThrow();
        await expect(checkOcSession(headers, known)).resolves.toEqual({ status: 'signed_out' });
    });

    it('passes auth-core only the options auth-core reads', async () => {
        vi.mocked(coreGetOcSession).mockClear();
        await checkOcSession(headers, {
            audience: 'https://site.example',
            method: 'POST',
            projectKey: 'pk_live_example',
            required: true,
            requireBond: { minSats: 1 },
        });
        const passed = vi.mocked(coreGetOcSession).mock.calls[0]?.[1] ?? {};
        expect(Object.keys(passed).sort()).toEqual(['audience', 'issuer', 'jwksCacheTtlMs', 'jwksMaxStaleMs']);
        expect(passed.audience).toBe('https://site.example');
    });
});
