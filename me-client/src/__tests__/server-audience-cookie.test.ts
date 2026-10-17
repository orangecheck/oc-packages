import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { withOcAuth } from '../server';

/**
 * The docs teach trading the popup token for your own oc_session cookie. A
 * bound token read from that cookie with no `audience` configured is refused
 * like a Bearer one, and the SDK says why instead of a silent 401.
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

async function callWithCookie(jwt: string, options: Parameters<typeof withOcAuth>[1]) {
    let seen: unknown = 'unset';
    const handler = withOcAuth(async (req) => {
        seen = req.ocSession;
    }, options);
    const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
    await handler({ headers: { cookie: `theme=dark; oc_session=${jwt}` } }, res);
    return seen as { did_oc?: string } | null;
}

describe('withOcAuth · audience, from your own cookie', () => {
    it('verifies a bound token from the cookie once audience is set', async () => {
        expect((await callWithCookie(await token(MINE), { audience: MINE }))?.did_oc).toMatch(
            /^did:oc:/
        );
    });

    it('says why a bound cookie token is refused with no audience', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await callWithCookie(await token(MINE), {})).toBeNull();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain(MINE);
    });
});
