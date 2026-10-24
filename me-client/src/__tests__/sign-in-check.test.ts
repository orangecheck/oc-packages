/**
 * `checkOcToken` is the sign-in POST's check: `verifyOcToken` answers null for
 * a token that fails and for a key set that can't be read alike, so an outage
 * read as a failed sign-in. It tells them apart and keeps the handle rule.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => ({ answer: { status: 'invalid' } as Record<string, unknown> }));
vi.mock('@orangecheck/auth-core', async (importOriginal) => {
    const real = await importOriginal<typeof import('@orangecheck/auth-core')>();
    return { ...real, checkOcToken: vi.fn(async () => core.answer) };
});
import { checkOcToken as coreCheckOcToken } from '@orangecheck/auth-core';

import { checkOcToken } from '../server';

const SDK = /^@orangecheck\/me-client: /;
const session = { sub: 'acct-1', did_oc: 'did:oc:abc', jti: 'j1', aud: 'https://site.example', rh: 'rh_1' };

afterEach(() => {
    vi.mocked(coreCheckOcToken).mockClear();
});

describe('checkOcToken (me-client)', () => {
    it('answers valid with the session', async () => {
        core.answer = { status: 'valid', session };
        expect(await checkOcToken('t', { audience: 'https://site.example' })).toEqual({ status: 'valid', session });
        expect(coreCheckOcToken).toHaveBeenCalledWith('t', { audience: 'https://site.example' });
    });

    it('answers unavailable for a key set that cannot be read, so the POST can answer 503', async () => {
        core.answer = { status: 'unavailable' };
        expect(await checkOcToken('t', { audience: 'https://site.example' })).toEqual({
            status: 'unavailable',
            reason: 'key_set_unavailable',
        });
    });

    it('answers invalid for a token that fails', async () => {
        core.answer = { status: 'invalid' };
        expect(await checkOcToken('t', { audience: 'https://site.example' })).toEqual({ status: 'invalid' });
    });

    it('refuses a bound token with no handle unless the site opted out', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        core.answer = { status: 'valid', session: { ...session, rh: undefined } };
        expect(await checkOcToken('t', { audience: 'https://site.example' })).toEqual({
            status: 'invalid',
            reason: 'no_session_handle',
        });
        expect((await checkOcToken('t', { audience: 'https://site.example', requireHandle: false })).status).toBe('valid');
        warn.mockRestore();
    });

    it('refuses options it cannot read', async () => {
        await expect(checkOcToken('t', { requireHandle: 'yes' } as never)).rejects.toThrow(SDK);
        await expect(checkOcToken('t', null as never)).rejects.toThrow(SDK);
    });
});
