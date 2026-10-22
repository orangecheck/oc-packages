import { createHmac } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests, revocationKey } from '@orangecheck/auth-core';

import { _resetSessionChecksForTests, getOcSession, ocAuthExpress, ocAuthHono, withOcAuth } from '../server';

/**
 * A person who signs out everywhere, removes a passkey or deletes the account
 * ends every session they hold. With the project key and secret set, the
 * server helpers read those account cutoffs from me.ochk.io (signed with the
 * secret) and refuse a session they end, on every adapter.
 */

const ISSUER = 'https://ochk.io';
const KID = 'k1';
const SITE = 'https://my-site.example';
const PROJECT = 'pk_live_site1';
const SECRET = 'a'.repeat(64);
const SUB = 'acct-1';
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let cutoffs: Record<string, number>;
let feedUp: boolean;
let feedCalls: Array<{ url: string; signature: string | null }>;

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(async () => {
    _resetJwksCachesForTests();
    _resetSessionChecksForTests();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    cutoffs = {};
    feedUp = true;
    feedCalls = [];
    vi.stubEnv('OC_PROJECT_KEY', PROJECT);
    vi.stubEnv('OC_SIGNING_SECRET', SECRET);
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/api/integrator/revocations')) {
            feedCalls.push({ url: u, signature: new Headers(init?.headers).get('x-oc-signature') });
            if (!feedUp) return new Response('down', { status: 503 });
            return Response.json({ v: 1, at: nowSec(), tokens: [], accounts: cutoffs });
        }
        return Response.json(jwks);
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

async function token() {
    return new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef' })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject(SUB)
        .setJti('j-1')
        .setIssuer(ISSUER)
        .setAudience(SITE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
}

async function viaNext(method: string, options: Parameters<typeof withOcAuth>[1] = {}) {
    let seen: unknown = 'unset';
    const handler = withOcAuth(async (req) => {
        seen = req.ocSession;
    }, { audience: SITE, ...options });
    const res = { status: () => res, json: () => undefined, setHeader: () => undefined };
    await handler({ method, headers: { cookie: `oc_session=${await token()}` } }, res);
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

describe('server helpers · sessions ended everywhere', () => {
    it('refuses a session its account cutoff ends, asking me.ochk.io with the signed request', async () => {
        cutoffs[await revocationKey('sub', SUB)] = nowSec() + 1;
        expect(await viaNext('GET')).toBeNull();
        expect(feedCalls).toHaveLength(1);
        const query = `project_key=${PROJECT}`;
        expect(feedCalls[0]!.url).toBe(`https://me.ochk.io/api/integrator/revocations?${query}`);
        const [, t] = /^t=(\d+),/.exec(feedCalls[0]!.signature ?? '') ?? [];
        const mac = createHmac('sha256', SECRET).update(`${t}.${query}`).digest('hex');
        expect(feedCalls[0]!.signature).toBe(`t=${t},v1=${mac}`);
    });

    it('keeps a session minted after the cutoff', async () => {
        cutoffs[await revocationKey('sub', SUB)] = nowSec() - 60;
        expect((await viaNext('POST'))?.sub).toBe(SUB);
    });

    it('refuses on every adapter, and getOcSession too', async () => {
        cutoffs[await revocationKey('sub', SUB)] = nowSec() + 1;
        expect(await viaExpress('GET')).toBeNull();
        expect(await viaHono('GET')).toBeNull();
        const headers = { cookie: `oc_session=${await token()}` };
        expect(await getOcSession(headers, { audience: SITE, method: 'GET' })).toBeNull();
    });

    it('keeps reads and refuses writes while the cutoffs cannot be read', async () => {
        feedUp = false;
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect((await viaNext('GET'))?.sub).toBe(SUB);
        expect(await viaNext('POST')).toBeNull();
        expect((await viaExpress('GET'))?.sub).toBe(SUB);
        expect(await viaExpress('POST')).toBeNull();
        expect((await viaHono('GET'))?.sub).toBe(SUB);
        expect(await viaHono('POST')).toBeNull();
    });

    it('checks nothing without the project secret, and says so once in production', async () => {
        vi.stubEnv('OC_SIGNING_SECRET', '');
        vi.stubEnv('NODE_ENV', 'production');
        cutoffs[await revocationKey('sub', SUB)] = nowSec() + 1;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect((await viaNext('POST'))?.sub).toBe(SUB);
        expect((await viaNext('POST'))?.sub).toBe(SUB);
        expect(feedCalls).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toContain('OC_SIGNING_SECRET');
    });

    it('turns off with revocation: false', async () => {
        cutoffs[await revocationKey('sub', SUB)] = nowSec() + 1;
        expect((await viaNext('GET', { revocation: false }))?.sub).toBe(SUB);
        expect(feedCalls).toHaveLength(0);
    });
});
