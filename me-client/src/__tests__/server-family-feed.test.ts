import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    _resetFamilyRevocationCheckForTests,
    _resetJwksCachesForTests,
    revocationKey,
    type RevocationCheck,
} from '@orangecheck/auth-core';

import { _resetSessionChecksForTests, checkOcSession, getOcSession, ocAuthExpress, withOcAuth } from '../server';

/**
 * A family session (no `aud`, the ochk.io cookie a *.ochk.io site reads) is
 * ended on ochk.io's own feed, never on a project's list. The server helpers
 * check it there by default, with the site's OC_REVOCATION_FEED_TOKEN, and
 * throw when no feed is configured rather than read it by signature alone.
 */

const ISSUER = 'https://ochk.io';
const FEED = `${ISSUER}/api/auth/revocations`;
const KID = 'k1';
const SITE = 'https://my-site.example';
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let endedJtis: string[];
let feedUp: boolean;
let feedAuth: Array<string | null>;
const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(async () => {
    _resetJwksCachesForTests();
    _resetSessionChecksForTests();
    _resetFamilyRevocationCheckForTests();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    endedJtis = [];
    feedUp = true;
    feedAuth = [];
    vi.stubEnv('OC_PROJECT_KEY', '');
    vi.stubEnv('OC_SIGNING_SECRET', '');
    vi.stubEnv('OC_REVOCATION_FEED_TOKEN', '');
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === FEED) {
            feedAuth.push(new Headers(init?.headers).get('authorization'));
            if (!feedUp) return new Response('down', { status: 503 });
            return Response.json({ v: 1, at: nowSec(), tokens: endedJtis, accounts: {} });
        }
        if (u.includes('/api/integrator/')) throw new Error(`unexpected fetch ${u}`);
        return Response.json(jwks);
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    _resetFamilyRevocationCheckForTests();
});

async function token(aud?: string) {
    const iat = nowSec();
    const jwt = new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef', ...(aud ? { rh: 'rh-1' } : {}) })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer(ISSUER)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 300);
    if (aud) jwt.setAudience(aud);
    return jwt.sign(privateKey);
}
const bearer = async (aud?: string) => ({ authorization: `Bearer ${await token(aud)}`, cookie: null });

describe('a family session with no feed configured', () => {
    it('is refused, with an error that names the setting, never let through', async () => {
        const headers = await bearer();
        await expect(checkOcSession(headers, { method: 'GET' })).rejects.toThrow(/OC_REVOCATION_FEED_TOKEN/);
        await expect(getOcSession(headers)).rejects.toThrow(/OC_REVOCATION_FEED_TOKEN/);
        expect(feedAuth).toEqual([]);
    });

    it('stops the wrapped handler and the Express middleware too', async () => {
        const headers = await bearer();
        let ran = false;
        const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
        await expect(
            withOcAuth(async () => {
                ran = true;
            })({ method: 'GET', headers: { authorization: headers.authorization } }, res)
        ).rejects.toThrow(/OC_REVOCATION_FEED_TOKEN/);
        expect(ran).toBe(false);
        let passed: unknown = 'not called';
        await ocAuthExpress()({ method: 'GET', headers: { authorization: headers.authorization } }, res, (err?: unknown) => {
            passed = err;
        });
        expect(String(passed)).toMatch(/OC_REVOCATION_FEED_TOKEN/);
    });

    it('is read by signature alone only when the site says so', async () => {
        expect(await checkOcSession(await bearer(), { revocation: false })).toMatchObject({ status: 'signed_in' });
    });

    it('leaves an audience token alone: it is checked on its project list, as before', async () => {
        expect(await checkOcSession(await bearer(SITE), { audience: SITE })).toMatchObject({ status: 'signed_in' });
        expect(feedAuth).toEqual([]);
    });

    it('leaves a request with no session alone', async () => {
        expect(await checkOcSession({ cookie: null, authorization: null })).toEqual({ status: 'signed_out' });
    });
});

describe('a family session with the feed configured', () => {
    beforeEach(() => {
        vi.stubEnv('OC_REVOCATION_FEED_TOKEN', 'feed-token');
    });

    it('is signed in while the feed does not end it, read with the site feed token', async () => {
        expect(await checkOcSession(await bearer(), { method: 'POST' })).toMatchObject({ status: 'signed_in' });
        expect(feedAuth).toEqual(['Bearer feed-token']);
    });

    it('is refused once the person ended it everywhere', async () => {
        endedJtis = [await revocationKey('jti', 'j-1')];
        expect(await checkOcSession(await bearer(), { method: 'GET' })).toEqual({ status: 'signed_out' });
        expect(await getOcSession(await bearer())).toBeNull();
    });

    it('while the feed is down: reads go on, a write waits (503, never signed out)', async () => {
        feedUp = false;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(await checkOcSession(await bearer(), { method: 'GET' })).toMatchObject({ status: 'signed_in' });
        expect(await checkOcSession(await bearer(), { method: 'POST' })).toEqual({
            status: 'unavailable',
            reason: 'revocations_unavailable',
        });
    });

    it('a check the site passes still wins', async () => {
        const mine: RevocationCheck = { status: async () => 'revoked', refuses: async () => true };
        expect(await checkOcSession(await bearer(), { revocation: mine })).toEqual({ status: 'signed_out' });
        expect(feedAuth).toEqual([]);
    });
});
