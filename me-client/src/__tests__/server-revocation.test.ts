import { createHmac } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { _resetSessionChecksForTests, getOcSession, ocAuthExpress, ocAuthHono, withOcAuth } from '../server';

/**
 * A person who signs out everywhere, removes a passkey or deletes the account
 * ends every session they hold. A token from the sign-in popup carries `rh`,
 * its revocation handle for its own audience; with the project key and secret
 * set, the server helpers look it up in me.ochk.io's list of ended handles for
 * that audience (signed with the secret) and refuse what it ends, on every
 * adapter and for every origin the site's tokens come from.
 */

const ISSUER = 'https://ochk.io';
const KID = 'k1';
const SITE = 'https://my-site.example';
const WWW = 'https://www.my-site.example';
const PROJECT = 'pk_live_site1';
const SECRET = 'a'.repeat(64);
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let ended: Record<string, Record<string, number>>;
let feedUp: boolean;
let feedCalls: Array<{ url: string; signature: string | null }>;

const nowSec = () => Math.floor(Date.now() / 1000);
/** Every token in a test carries this iat, so a cutoff set from it cannot race the clock. */
let ISSUED: number;

beforeEach(async () => {
    _resetJwksCachesForTests();
    _resetSessionChecksForTests();
    ISSUED = nowSec();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    ended = {};
    feedUp = true;
    feedCalls = [];
    vi.stubEnv('OC_PROJECT_KEY', PROJECT);
    vi.stubEnv('OC_SIGNING_SECRET', SECRET);
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/integrator/revocations')) {
            feedCalls.push({ url: u, signature: new Headers(init?.headers).get('x-oc-signature') });
            if (!feedUp) return new Response('down', { status: 503 });
            const aud = new URL(u).searchParams.get('aud') ?? '';
            return Response.json({ v: 1, at: nowSec(), tokens: [], accounts: {}, handles: ended[aud] ?? {} });
        }
        return Response.json(jwks);
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

async function token(aud = SITE, rh: string | null = `rh:${aud}`) {
    return new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef', ...(rh ? { rh } : {}) })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer(ISSUER)
        .setAudience(aud)
        .setIssuedAt(ISSUED)
        .setExpirationTime(ISSUED + 300)
        .sign(privateKey);
}

async function viaNext(method: string, jwt?: string, options: Parameters<typeof withOcAuth>[1] = {}) {
    let seen: unknown = 'unset';
    const handler = withOcAuth(async (req) => {
        seen = req.ocSession;
    }, { audience: [SITE, WWW], ...options });
    const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
    await handler({ method, headers: { cookie: `oc_session=${jwt ?? (await token())}` } }, res);
    return seen as { sub?: string } | null;
}

async function viaExpress(method: string) {
    let seen: unknown = 'unset';
    const req = { method, headers: { cookie: `oc_session=${await token()}` } } as {
        method: string;
        headers: { cookie: string };
        ocSession?: unknown;
    };
    const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
    await ocAuthExpress({ audience: SITE })(req, res, () => {
        seen = req.ocSession;
    });
    return seen as { sub?: string } | null;
}

async function viaHono(method: string) {
    let seen: unknown = 'unset';
    const raw = new Request(`${SITE}/api/x`, {
        method,
        headers: { cookie: `oc_session=${await token()}` },
    });
    const c = {
        req: { raw },
        set: (_k: string, v: unknown) => {
            seen = v;
        },
        json: () => undefined,
        header: () => undefined,
    };
    await ocAuthHono({ audience: SITE })(c, async () => undefined);
    return seen as { sub?: string } | null;
}

const listPath = (aud: string) =>
    `/api/integrator/revocations?project_key=${encodeURIComponent(PROJECT)}&aud=${encodeURIComponent(aud)}`;

describe('server helpers · sessions ended everywhere', () => {
    it('refuses a session whose handle the list ends, asking for the token\'s audience, signed', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        expect(await viaNext('GET')).toBeNull();
        expect(feedCalls).toHaveLength(1);
        expect(feedCalls[0]!.url).toBe(`https://me.ochk.io${listPath(SITE)}`);
        const [, t] = /^t=(\d+),/.exec(feedCalls[0]!.signature ?? '') ?? [];
        const mac = createHmac('sha256', SECRET).update(`${t}.GET ${listPath(SITE)}`).digest('hex');
        expect(feedCalls[0]!.signature).toBe(`t=${t},v1=${mac}`);
    });

    it('keeps a session minted after the cutoff', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED - 60 };
        expect((await viaNext('POST'))?.sub).toBe('acct-1');
    });

    it('refuses an ended session from each origin of one configured site', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        ended[WWW] = { [`rh:${WWW}`]: ISSUED + 1 };
        expect(await viaNext('GET', await token(SITE))).toBeNull();
        expect(await viaNext('GET', await token(WWW))).toBeNull();
        expect(new Set(feedCalls.map((f) => new URL(f.url).searchParams.get('aud')))).toEqual(
            new Set([SITE, WWW])
        );
    });

    it('checks a token with no handle by its signature alone', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        expect((await viaNext('POST', await token(SITE, null)))?.sub).toBe('acct-1');
        expect(feedCalls).toHaveLength(0);
    });

    it('refuses on every adapter, and getOcSession too', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        expect(await viaExpress('GET')).toBeNull();
        expect(await viaHono('GET')).toBeNull();
        const headers = { cookie: `oc_session=${await token()}` };
        expect(await getOcSession(headers, { audience: SITE, method: 'GET' })).toBeNull();
    });

    it('keeps reads and refuses writes while the list cannot be read', async () => {
        feedUp = false;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect((await viaNext('GET'))?.sub).toBe('acct-1');
        expect(await viaNext('POST')).toBeNull();
        expect((await viaExpress('GET'))?.sub).toBe('acct-1');
        expect(await viaExpress('POST')).toBeNull();
        expect((await viaHono('GET'))?.sub).toBe('acct-1');
        expect(await viaHono('POST')).toBeNull();
    });

    it('checks nothing without the project secret, and says so once in production', async () => {
        vi.stubEnv('OC_SIGNING_SECRET', '');
        vi.stubEnv('NODE_ENV', 'production');
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect((await viaNext('POST'))?.sub).toBe('acct-1');
        expect((await viaNext('POST'))?.sub).toBe('acct-1');
        expect(feedCalls).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('OC_SIGNING_SECRET');
    });

    it('turns off with revocation: false', async () => {
        ended[SITE] = { [`rh:${SITE}`]: ISSUED + 1 };
        expect((await viaNext('GET', undefined, { revocation: false }))?.sub).toBe('acct-1');
        expect(feedCalls).toHaveLength(0);
    });
});
