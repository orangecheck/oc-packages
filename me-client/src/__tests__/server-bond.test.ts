import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { withOcAuth } from '../server';

/**
 * An app that asks for backed accounts (oc-attest-protocol BOND.md) refuses an
 * account whose bond doesn't meet its floors, and lets everyone else through
 * as before. The floors come from code (`requireBond`) or from the project's
 * own settings (`projectKey`), read from its public config.
 */

const MINE = 'https://my-site.example';
const KID = 'k1';
let privateKey: CryptoKey;
let jwks: { keys: unknown[] };
let config: { status: number; body: unknown } = { status: 200, body: {} };
let configReads = 0;

beforeEach(async () => {
    _resetJwksCachesForTests();
    const pair = await generateKeyPair('EdDSA', { extractable: true });
    privateKey = pair.privateKey as CryptoKey;
    jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID }] };
    configReads = 0;
    vi.stubGlobal('fetch', async (url: string) => {
        if (/\/api\/integrator\/[^/]+\/sign-in$/.test(String(url))) {
            configReads++;
            return new Response(JSON.stringify(config.body), { status: config.status });
        }
        return { ok: true, json: async () => jwks } as Response;
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
});

const BOND = {
    v: 1,
    sats_floor: 100_000,
    days_floor: 30,
    height: 971_800,
    checked_at: Math.floor(Date.now() / 1000) - 60,
    nullifier: 'ab'.repeat(32),
};

async function token(oc_bond?: unknown) {
    return new SignJWT({ did_oc: 'did:oc:0123456789abcdef0123456789abcdef', ...(oc_bond ? { oc_bond } : {}) })
        .setProtectedHeader({ alg: 'EdDSA', kid: KID })
        .setSubject('acct-1')
        .setJti('j-1')
        .setIssuer('https://ochk.io')
        .setAudience(MINE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
}

async function call(bearer: string | null, options: Parameters<typeof withOcAuth>[1]) {
    const out = { status: 200, body: undefined as unknown, ran: false };
    const handler = withOcAuth(async () => {
        out.ran = true;
    }, options);
    const res = {
        status(c: number) {
            out.status = c;
            return res;
        },
        json(b: unknown) {
            out.body = b;
            return undefined;
        },
        setHeader: () => undefined,
    };
    await handler({ headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }, res);
    return out;
}

describe('withOcAuth · requireBond', () => {
    it('lets a backed account through and refuses one below the floor, saying what it needs', async () => {
        const ok = await call(await token(BOND), { audience: MINE, requireBond: { minSats: 100_000, minDays: 30 } });
        expect(ok.ran).toBe(true);
        const low = await call(await token(BOND), { audience: MINE, requireBond: { minSats: 1_000_000 } });
        expect(low.ran).toBe(false);
        expect(low.status).toBe(403);
        expect(low.body).toMatchObject({
            reason: 'bond_required',
            need: { minSats: 1_000_000 },
            have: { sats_floor: 100_000, days_floor: 30 },
        });
    });

    it('refuses an unbacked account, and asks a signed-out one to sign in', async () => {
        const none = await call(await token(), { audience: MINE, requireBond: { minSats: 1_000 } });
        expect(none.status).toBe(403);
        expect(none.body).toMatchObject({ have: null });
        expect((await call(null, { audience: MINE, requireBond: { minSats: 1_000 } })).status).toBe(401);
    });

    it('changes nothing for an app that asks for no bond', async () => {
        const r = await call(await token(), { audience: MINE });
        expect(r.ran).toBe(true);
        expect(configReads).toBe(0);
    });
});

describe('withOcAuth · projectKey', () => {
    it('enforces the requirement set in the project settings, read once and cached', async () => {
        config = { status: 200, body: { ok: true, require_bond: { min_sats: 100_000, min_days: 90 } } };
        const opts = { audience: MINE, projectKey: 'pk_live_cached' };
        const r = await call(await token(BOND), opts);
        expect(r.status).toBe(403);
        expect(r.body).toMatchObject({ need: { minSats: 100_000, minDays: 90 } });
        await call(await token(BOND), opts);
        expect(configReads).toBe(1);
    });

    it('lets every account in when the project asks for none', async () => {
        config = { status: 200, body: { ok: true, require_bond: null } };
        expect((await call(await token(), { audience: MINE, projectKey: 'pk_live_open' })).ran).toBe(true);
    });

    it('refuses rather than waves through when the requirement has never been readable', async () => {
        config = { status: 503, body: {} };
        const r = await call(await token(BOND), { audience: MINE, projectKey: 'pk_live_down' });
        expect(r.ran).toBe(false);
        expect(r.status).toBe(503);
        expect(r.body).toMatchObject({ reason: 'bond_policy_unavailable' });
    });
});
