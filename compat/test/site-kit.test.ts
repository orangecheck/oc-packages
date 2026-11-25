import * as current from '@orangecheck/site-kit/auth';
import { VaultClient } from '@orangecheck/vault-core';
import * as older from 'site-kit-0.17.0/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EMAIL, IDENTITY_KEY, keyed, plain, withoutIdentityKey } from '../src/account';
import { mint, publicJwkB64 } from '../src/mint';

/**
 * Plan §2, site-kit: ten tool sites answer their own /api/auth/me from the session cookie with
 * 0.18.0's createMeHandler, and vault-core 0.6.0's fetchIdentity reads vault.ochk.io's answer.
 * 0.17.0's createSessionReader is pinned too, though no site runs it: the four sites still on
 * 0.17.0 read the session with auth-core's verifySessionToken (auth-core.test.ts). ochk.io's
 * revocation feed is left out (revocation: false): it answers by session, never by claim.
 */

type Account = typeof plain;
type Kit = Pick<typeof current, 'createMeHandler' | 'createSessionReader'>;

let saved: string | undefined;
beforeAll(() => {
    saved = process.env.OC_AUTH_PUBLIC_JWK;
    process.env.OC_AUTH_PUBLIC_JWK = publicJwkB64;
});
afterAll(() => {
    if (saved === undefined) delete process.env.OC_AUTH_PUBLIC_JWK;
    else process.env.OC_AUTH_PUBLIC_JWK = saved;
});

const requestFor = async (a: Account) => ({
    method: 'GET',
    headers: { cookie: `oc_session=${await mint(a.token_claims)}` },
});

/** What a tool site's /api/auth/me answers for the account's session cookie. */
async function meAnswer(kit: Kit, a: Account) {
    const handler = kit.createMeHandler({ reader: kit.createSessionReader({ revocation: false }) });
    const out: { status: number; body: { ok: boolean; account: Record<string, unknown> | null } | null } = {
        status: 0,
        body: null,
    };
    const res = {
        setHeader: () => res,
        status: (code: number) => ((out.status = code), res),
        json: (body: typeof out.body) => ((out.body = body), res),
    };
    await handler((await requestFor(a)) as never, res as never);
    return out;
}

/** What vault-core's fetchIdentity reads from that answer on vault.ochk.io. */
async function vaultIdentity(answer: Awaited<ReturnType<typeof meAnswer>>) {
    const client = new VaultClient({
        fetch: async (input) =>
            String(input) === 'https://vault.ochk.io/api/auth/me'
                ? Response.json(answer.body, { status: answer.status })
                : Response.json({ ok: false }, { status: 404 }),
    });
    return client.fetchIdentity();
}

describe('site-kit 0.18.0 and vault-core 0.6.0', () => {
    it('createMeHandler answers the same account, and fetchIdentity reads the same did:oc', async () => {
        const before = await meAnswer(current, plain);
        expect(before.status).toBe(200);
        expect(before.body!.account).toMatchObject({
            did_oc: plain.token_claims.did_oc,
            primary_btc: null,
            display_identity: { kind: 'email', value: EMAIL },
        });
        expect(before.body!.account!.signing_method).not.toBe('bip322');
        const after = await meAnswer(current, keyed);
        expect(after).toEqual(before);
        expect(JSON.stringify(after.body)).not.toContain(IDENTITY_KEY.address);
        expect(await vaultIdentity(before)).toBe(plain.token_claims.did_oc);
        expect(await vaultIdentity(after)).toBe(plain.token_claims.did_oc);
    });
});

describe.each([
    ['site-kit 0.18.0', current as Kit],
    ['site-kit 0.17.0', older as unknown as Kit],
])('%s', (_name, kit) => {
    it('createSessionReader returns the same session, plus a claim it never reads', async () => {
        const reader = kit.createSessionReader({ revocation: false });
        const before = await reader.read((await requestFor(plain)) as never);
        expect(before).toMatchObject({ did_oc: plain.token_claims.did_oc, amr: ['email'] });
        const after = await reader.read((await requestFor(keyed)) as never);
        expect(withoutIdentityKey(after as Record<string, unknown>)).toEqual(before);
        expect((after as Record<string, unknown>).identity_key).toEqual(IDENTITY_KEY);
    });
});
