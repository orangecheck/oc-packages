import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import {
    _resetSessionChecksForTests,
    checkOcSession,
    getOcSession,
    ocAuthExpress,
    ocAuthHono,
    verifyOcToken,
    withOcAuth,
} from '../server';

/**
 * A token from the sign-in popup carries `rh`, its handle on the project's
 * list of ended sessions. One without it can't be reached by "sign out
 * everywhere", so the server helpers refuse it unless the site says
 * `requireHandle: false`. A family session (no `aud`) is not a popup token:
 * the family feed ends it, and it is not held to this.
 */

const ISSUER = 'https://ochk.io';
const KID = 'k1';
const SITE = 'https://my-site.example';
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };

beforeEach(async () => {
    _resetJwksCachesForTests();
    _resetSessionChecksForTests();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => jwks }) as Response);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function token(claims: { aud?: string; rh?: unknown } = {}) {
    const { aud, ...rest } = claims;
    const jwt = new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef', ...rest })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer(ISSUER)
        .setIssuedAt()
        .setExpirationTime('5m');
    if (aud) jwt.setAudience(aud);
    return jwt.sign(privateKey);
}

const bearer = async (claims: { aud?: string; rh?: unknown }) => ({
    authorization: `Bearer ${await token(claims)}`,
});

async function next(bearerToken: string, options: Parameters<typeof withOcAuth>[1]) {
    let seen: unknown = 'not called';
    const out = { status: 0, body: undefined as unknown };
    const res = {
        status(code: number) {
            out.status = code;
            return res;
        },
        json(body: unknown) {
            out.body = body;
            return undefined;
        },
        setHeader: () => undefined,
    };
    await withOcAuth(async (req) => {
        seen = req.ocSession;
    }, options)({ headers: { authorization: `Bearer ${bearerToken}` } }, res);
    return { seen, ...out };
}

describe('a sign-in token without a revocation handle', () => {
    it('is refused by default, with the reason, where a session is required', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const r = await next(await token({ aud: SITE }), { audience: SITE, required: true });
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ ok: false, reason: 'no_session_handle' });
        expect(r.seen).toBe('not called');
    });

    it('is no session at all where one is optional', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect((await next(await token({ aud: SITE }), { audience: SITE })).seen).toBeNull();
    });

    it('is accepted with one', async () => {
        const r = await next(await token({ aud: SITE, rh: 'h-1' }), { audience: SITE, required: true });
        expect((r.seen as { did_oc?: string }).did_oc).toMatch(/^did:oc:/);
    });

    it('is refused with an empty or non-string handle', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        for (const rh of ['', 7, null]) {
            expect((await next(await token({ aud: SITE, rh }), { audience: SITE })).seen).toBeNull();
        }
    });

    it('is accepted when the site opts out with requireHandle: false', async () => {
        const r = await next(await token({ aud: SITE }), { audience: SITE, requireHandle: false });
        expect((r.seen as { did_oc?: string }).did_oc).toMatch(/^did:oc:/);
    });

    it('says why, once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await next(await token({ aud: SITE }), { audience: SITE });
        await next(await token({ aud: SITE }), { audience: SITE });
        const said = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('rh'));
        expect(said).toHaveLength(1);
        expect(said[0]).toContain('requireHandle');
    });

    it('a family session, with no audience, is not held to it', async () => {
        // Its own feed is checked in server-family-feed.test.ts.
        expect((await next(await token({}), { revocation: false })).seen).toMatchObject({ did_oc: expect.any(String) });
    });

    it('getOcSession and checkOcSession refuse it and name the reason', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const headers = await bearer({ aud: SITE });
        expect(await getOcSession(headers, { audience: SITE })).toBeNull();
        expect(await checkOcSession(headers, { audience: SITE })).toEqual({
            status: 'signed_out',
            reason: 'no_session_handle',
        });
        expect(await checkOcSession(headers, { audience: SITE, requireHandle: false })).toMatchObject({
            status: 'signed_in',
        });
    });

    it('verifyOcToken refuses it too, unless told not to', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t = await token({ aud: SITE });
        expect(await verifyOcToken(t, { audience: SITE })).toBeNull();
        expect(await verifyOcToken(t, { audience: SITE, requireHandle: false })).toMatchObject({
            did_oc: expect.any(String),
        });
        expect(await verifyOcToken(await token({ aud: SITE, rh: 'h-1' }), { audience: SITE })).toMatchObject({
            rh: 'h-1',
        });
        // A family session needs none here either.
        expect(await verifyOcToken(await token({}))).toMatchObject({ did_oc: expect.any(String) });
    });

    it('the Express and Hono adapters refuse it the same way', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const t = await token({ aud: SITE });
        const out = { status: 0, body: undefined as unknown, next: false };
        const res = {
            status(code: number) {
                out.status = code;
                return res;
            },
            json(body: unknown) {
                out.body = body;
            },
            setHeader: () => undefined,
        };
        await ocAuthExpress({ audience: SITE, required: true })(
            { headers: { authorization: `Bearer ${t}` } },
            res,
            () => {
                out.next = true;
            }
        );
        expect(out).toMatchObject({ status: 401, body: { reason: 'no_session_handle' }, next: false });

        let answered: { body: unknown; status?: number } | null = null;
        await ocAuthHono({ audience: SITE, required: true })(
            {
                req: { raw: { headers: new Headers({ authorization: `Bearer ${t}` }), method: 'GET' } },
                set: () => undefined,
                json: (body: unknown, status?: number) => {
                    answered = { body, status };
                    return answered;
                },
                header: () => undefined,
            },
            async () => undefined
        );
        expect(answered).toEqual({ body: { ok: false, reason: 'no_session_handle' }, status: 401 });
    });

    it('takes requireHandle as a boolean only', async () => {
        expect(() =>
            withOcAuth(async () => undefined, { audience: SITE, requireHandle: 'false' as unknown as boolean })
        ).toThrow(TypeError);
        await expect(
            verifyOcToken('x.y.z', { audience: SITE, requireHandle: 0 as unknown as boolean })
        ).rejects.toThrow(TypeError);
    });
});
