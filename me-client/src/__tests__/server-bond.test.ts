import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests } from '@orangecheck/auth-core';

import { ocAuthExpress, withOcAuth } from '../server';

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
        expect(low.body).toEqual({
            ok: false,
            reason: 'bond_required',
            need: { min_sats: 1_000_000, min_days: 0 },
            have: { sats_floor: 100_000, days_floor: 30 },
            back_url: 'https://ochk.app/me/account#backing',
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
        expect(r.body).toMatchObject({ need: { min_sats: 100_000, min_days: 90 } });
        await call(await token(BOND), opts);
        expect(configReads).toBe(1);
    });

    it('lets code win over the project setting', async () => {
        config = { status: 200, body: { ok: true, require_bond: { min_sats: 10_000_000, min_days: 0 } } };
        const r = await call(await token(BOND), {
            audience: MINE,
            projectKey: 'pk_live_code_wins',
            requireBond: { minSats: 1_000 },
        });
        expect(r.ran).toBe(true);
        expect(configReads).toBe(0);
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

describe('withOcAuth · a projectKey that names no project', () => {
    it('says the key is wrong, once, instead of reporting an outage', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        config = { status: 404, body: { ok: false, error: 'project_not_found' } };
        const opts = { audience: MINE, projectKey: 'pk_live_typo' };
        const r = await call(await token(BOND), opts);
        expect(r.ran).toBe(false);
        expect(r.status).toBe(500);
        expect(r.body).toMatchObject({ reason: 'unknown_project_key' });
        const again = await call(await token(), opts);
        expect(again.body).toMatchObject({ reason: 'unknown_project_key' });
        expect(errors).toHaveBeenCalledTimes(1);
        expect(String(errors.mock.calls[0]![0])).toContain('pk_live_typo');
        errors.mockRestore();
    });
});

describe('withOcAuth · projectKey over time', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('reads a tightened requirement again after a minute', async () => {
        const opts = { audience: MINE, projectKey: 'pk_live_tightened' };
        config = { status: 200, body: { ok: true, require_bond: null } };
        expect((await call(await token(), opts)).ran).toBe(true);
        config = { status: 200, body: { ok: true, require_bond: { min_sats: 1_000, min_days: 0 } } };
        vi.setSystemTime(new Date('2026-10-16T12:00:59Z'));
        expect((await call(await token(), opts)).ran).toBe(true);
        vi.setSystemTime(new Date('2026-10-16T12:01:01Z'));
        expect((await call(await token(), opts)).status).toBe(403);
        expect(configReads).toBe(2);
    });

    it('keeps the last requirement through an outage, asking again every ten seconds', async () => {
        const opts = { audience: MINE, projectKey: 'pk_live_outage' };
        config = { status: 200, body: { ok: true, require_bond: { min_sats: 1_000, min_days: 0 } } };
        await call(await token(BOND), opts);
        config = { status: 503, body: {} };
        vi.setSystemTime(new Date('2026-10-16T12:01:01Z'));
        expect((await call(await token(), opts)).status).toBe(403);
        expect((await call(await token(BOND), opts)).ran).toBe(true);
        expect(configReads).toBe(2);
        vi.setSystemTime(new Date('2026-10-16T12:01:12Z'));
        await call(await token(BOND), opts);
        expect(configReads).toBe(3);
    });
});

describe('withOcAuth · an answer that does not say the rule', () => {
    it.each([
        ['an empty body', {}],
        ['ok false', { ok: false, reason: 'project_not_found' }],
        ['the rule under another key', { ok: true, policy: { require_bond: { min_sats: 100_000 } } }],
        ['a floor that is not a number', { ok: true, require_bond: { min_sats: null, min_days: 0 } }],
        ['a negative floor', { ok: true, require_bond: { min_sats: -1, min_days: 0 } }],
    ])('refuses rather than reads %s as no requirement', async (name, body) => {
        config = { status: 200, body };
        const r = await call(await token(), { audience: MINE, projectKey: `pk_live_shape_${name.replace(/\W/g, '')}` });
        expect(r.ran).toBe(false);
        expect(r.status).toBe(503);
        expect(r.body).toMatchObject({ reason: 'bond_policy_unavailable' });
    });
});

describe('withOcAuth · the rule read from one me.ochk.io is not another one', () => {
    it('keys the rule by where it was read', async () => {
        const reads: string[] = [];
        vi.stubGlobal('fetch', async (url: string) => {
            if (/\/sign-in$/.test(String(url))) {
                reads.push(String(url));
                const open = String(url).startsWith('https://me-test.example');
                return new Response(
                    JSON.stringify({ ok: true, require_bond: open ? null : { min_sats: 100_000, min_days: 0 } }),
                    { status: 200 }
                );
            }
            return { ok: true, json: async () => jwks } as Response;
        });
        const pk = 'pk_live_two_origins';
        expect((await call(await token(), { audience: MINE, projectKey: pk, meOrigin: 'https://me-test.example' })).ran).toBe(true);
        expect((await call(await token(), { audience: MINE, projectKey: pk })).status).toBe(403);
        expect(reads).toEqual([
            `https://me-test.example/api/integrator/${pk}/sign-in`,
            `https://me.ochk.io/api/integrator/${pk}/sign-in`,
        ]);
    });
});

describe('withOcAuth · an outage longer than ten minutes', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('stops standing on the last rule read and refuses until it can read one', async () => {
        const opts = { audience: MINE, projectKey: 'pk_live_long_outage' };
        config = { status: 200, body: { ok: true, require_bond: null } };
        expect((await call(await token(), opts)).ran).toBe(true);
        config = { status: 503, body: {} };
        vi.setSystemTime(new Date('2026-10-16T12:09:59Z'));
        expect((await call(await token(), opts)).ran).toBe(true);
        vi.setSystemTime(new Date('2026-10-16T12:10:01Z'));
        const r = await call(await token(), opts);
        expect(r.ran).toBe(false);
        expect(r.body).toMatchObject({ reason: 'bond_policy_unavailable' });
        config = { status: 200, body: { ok: true, require_bond: null } };
        vi.setSystemTime(new Date('2026-10-16T12:10:12Z'));
        expect((await call(await token(), opts)).ran).toBe(true);
    });
});

describe('withOcAuth · a request with no session', () => {
    it('is served without reading the rule, even while me.ochk.io is down', async () => {
        config = { status: 503, body: {} };
        const r = await call(null, { audience: MINE, projectKey: 'pk_live_anon_down' });
        expect(r.ran).toBe(true);
        expect(configReads).toBe(0);
    });

    it('is not held to the project rule when it can be read', async () => {
        config = { status: 200, body: { ok: true, require_bond: { min_sats: 100_000, min_days: 0 } } };
        expect((await call(null, { audience: MINE, projectKey: 'pk_live_anon_rule' })).ran).toBe(true);
        expect(configReads).toBe(0);
    });

    it('gets 401 with required, still without reading the rule', async () => {
        config = { status: 503, body: {} };
        const r = await call(null, { audience: MINE, projectKey: 'pk_live_anon_required', required: true });
        expect(r.status).toBe(401);
        expect(r.body).toMatchObject({ reason: 'unauthenticated' });
        expect(configReads).toBe(0);
    });

    it('is served by the Express adapter the same way', async () => {
        config = { status: 503, body: {} };
        let passed = false;
        await ocAuthExpress({ audience: MINE, projectKey: 'pk_live_anon_express' })(
            { method: 'GET', headers: {} },
            { status: () => ({ json: () => undefined }), json: () => undefined, setHeader: () => undefined } as never,
            () => {
                passed = true;
            }
        );
        expect(passed).toBe(true);
        expect(configReads).toBe(0);
    });
});
