import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { withOcAuth } from '../server';

/**
 * withOcAuth verifies popup tokens against the integrator's own origin.
 *
 * The popup issues each site a token bound to it (auth-core 2.7, aud claim).
 * With `audience` set to the site's origin it verifies; bound to any other
 * origin it does not; and with no audience configured it is refused and the
 * SDK says why, once, instead of leaving every sign-in to 401 silently.
 */

const ISSUER = 'https://ochk.io';
const KID = 'k1';
const MINE = 'https://my-site.example';
const THEIRS = 'https://their-site.example';
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };

beforeEach(async () => {
    _resetJwksCachesForTests();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => jwks }) as Response);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function token(aud?: string) {
    const jwt = new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef' })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime('5m');
    if (aud) jwt.setAudience(aud);
    return jwt.sign(privateKey);
}

async function call(bearer: string, options: Parameters<typeof withOcAuth>[1]) {
    let seen: unknown = 'unset';
    const handler = withOcAuth(async (req) => {
        seen = req.ocSession;
    }, options);
    const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
    await handler({ headers: { authorization: `Bearer ${bearer}` } }, res);
    return seen as { did_oc?: string } | null;
}

describe('withOcAuth · audience', () => {
    it('accepts a token bound to this site', async () => {
        expect((await call(await token(MINE), { audience: MINE }))?.did_oc).toMatch(/^did:oc:/);
    });

    it('refuses a token that was issued to another site', async () => {
        expect(await call(await token(THEIRS), { audience: MINE })).toBeNull();
    });

    it('refuses a bound token when no audience is configured, and says why once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await call(await token(MINE), {})).toBeNull();
        await call(await token(MINE), {});
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('audience');
    });
});
