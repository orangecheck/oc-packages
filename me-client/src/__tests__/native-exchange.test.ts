import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { exchangeNativeCode, verifyOcToken } from '../server';

/**
 * A native app's server trades the code its loopback listener got for the
 * popup's token, and gets it back verified against its own audience. A token
 * from native sign-in carries `azp: "native"`; nothing else about it differs.
 * Each answer ochk.io can give is in test-vectors/server-helpers.json
 * (server-helpers.test.ts), shared with sdk-py; this holds the rest.
 */

const ISSUER = 'https://ochk.io';
const KID = 'k1';
const SITE = 'https://my-site.example';
const INPUT = {
    code: 'A'.repeat(43),
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    redirectUri: 'http://127.0.0.1:53819/oc/callback',
    audience: SITE,
};
const PROJECT = 'pk_test_AbCdEfGhIjKlMnOp';
const OPTS = { projectKey: PROJECT };

let privateKey: CryptoKey;
let jwks: { keys: unknown[] } | null;
let answer: () => Response | Promise<Response>;
let rule: unknown;
const posts: { url: string; init: RequestInit }[] = [];
const ruleReads: string[] = [];

beforeEach(async () => {
    _resetJwksCachesForTests();
    vi.stubEnv('OC_PROJECT_KEY', '');
    vi.stubEnv('OC_SIGNING_SECRET', '');
    posts.length = 0;
    ruleReads.length = 0;
    rule = { ok: true, require_bond: null };
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    answer = async () => Response.json({ ok: true, token: await token(), token_type: 'orangecheck' });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
        if (url.endsWith('/.well-known/jwks.json')) {
            if (!jwks) throw new TypeError('fetch failed');
            return Response.json(jwks);
        }
        if (url.startsWith('https://me.ochk.io/api/integrator/')) {
            ruleReads.push(url);
            return Response.json(rule);
        }
        posts.push({ url, init });
        return answer();
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

async function token(claims: Record<string, unknown> = {}, iss = ISSUER) {
    const { aud = SITE, ...rest } = { rh: 'h'.repeat(22), azp: 'native', ...claims };
    return new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef', ...rest })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer(iss)
        .setAudience(aud as string)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
}

describe('exchangeNativeCode', () => {
    it('trades the code at the auth host and returns the token verified for your audience', async () => {
        const out = await exchangeNativeCode(INPUT, OPTS);
        expect(out.status).toBe('valid');
        if (out.status !== 'valid') return;
        expect(out.session).toMatchObject({ sub: 'acct-1', aud: SITE, azp: 'native' });
        expect(await verifyOcToken(out.token, { audience: SITE })).toMatchObject({ azp: 'native' });
        expect(posts).toHaveLength(1);
        expect(posts[0]!.url).toBe('https://ochk.io/api/auth/native/token');
        expect(posts[0]!.init).toMatchObject({ method: 'POST', redirect: 'error' });
        expect(JSON.parse(posts[0]!.init.body as string)).toEqual({
            grant_type: 'authorization_code',
            code: INPUT.code,
            code_verifier: INPUT.codeVerifier,
            redirect_uri: INPUT.redirectUri,
            project: PROJECT,
        });
    });

    it('reads the rule and sends the trade with your own key, from options or OC_PROJECT_KEY', async () => {
        await exchangeNativeCode(INPUT, { projectKey: 'pk_test_ne_options' });
        vi.stubEnv('OC_PROJECT_KEY', 'pk_test_ne_env');
        await exchangeNativeCode(INPUT);
        expect(posts.map((p) => JSON.parse(p.init.body as string).project)).toEqual([
            'pk_test_ne_options',
            'pk_test_ne_env',
        ]);
        expect(ruleReads).toEqual([
            'https://me.ochk.io/api/integrator/pk_test_ne_options/sign-in',
            'https://me.ochk.io/api/integrator/pk_test_ne_env/sign-in',
        ]);
    });

    it('applies the rule to the session it hands back', async () => {
        rule = { ok: true, require_bond: { min_sats: 1, min_days: 0 } };
        expect(await exchangeNativeCode(INPUT, { projectKey: 'pk_test_ne_rule' })).toMatchObject({
            status: 'invalid',
            reason: 'bond_required',
            need: { min_sats: 1, min_days: 0 },
            have: null,
        });
    });

    it('uses one issuer for the trade and the verification', async () => {
        const local = 'http://127.0.0.1:3000';
        answer = async () => Response.json({ ok: true, token: await token({}, local) });
        expect((await exchangeNativeCode(INPUT, { ...OPTS, issuer: local })).status).toBe('valid');
        expect(posts[0]!.url).toBe(`${local}/api/auth/native/token`);
        // The same token, checked as ochk.io's, fails on its issuer.
        answer = async () => Response.json({ ok: true, token: await token({}, local) });
        expect(await exchangeNativeCode(INPUT, OPTS)).toEqual({ status: 'invalid', reason: 'invalid_token' });
    });

    it('throws on a mistake in the call, before sending anything', async () => {
        const bad: [unknown, unknown?][] = [
            [{ ...INPUT, code: '' }, OPTS],
            [{ ...INPUT, codeVerifier: undefined }, OPTS],
            [{ ...INPUT, audience: '*' }, OPTS],
            // The key decides whose rule and list apply: never one the request carries.
            [{ ...INPUT, projectKey: PROJECT }, OPTS],
            [{ ...INPUT, project: PROJECT }, OPTS],
            [INPUT],
            [INPUT, { projectKey: '' }],
            [INPUT, { ...OPTS, issuer: 'http://ochk.io' }],
            [INPUT, { ...OPTS, issuer: 'https://ochk.io/evil' }],
            [INPUT, { ...OPTS, audience: SITE }],
            [INPUT, { ...OPTS, timeoutMs: 0 }],
            [null, OPTS],
        ];
        for (const [input, options] of bad) {
            await expect(
                exchangeNativeCode(input as typeof INPUT, options as Parameters<typeof exchangeNativeCode>[1])
            ).rejects.toThrow(TypeError);
        }
        expect(posts).toHaveLength(0);
        expect(ruleReads).toHaveLength(0);
    });
});
