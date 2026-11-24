import * as current from '@orangecheck/auth-core';
import * as oldest from 'auth-core-2.22.0';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AUDIENCE, EMAIL, IDENTITY_KEY, keyed, plain, withoutIdentityKey } from '../src/account';
import { ISSUER, jwksFetch, mint, publicJwkB64 } from '../src/mint';

/**
 * Plan §2, auth-core 2.35.0 and 2.22.0: an account carrying an identity key reads, through every
 * session reader, exactly as it read before, and never as a Bitcoin sign-in.
 */

beforeAll(() => vi.stubGlobal('fetch', jwksFetch()));
afterAll(() => vi.unstubAllGlobals());

const session = { plain: await mint(plain.token_claims), keyed: await mint(keyed.token_claims) };
const bound = {
    plain: await mint(plain.audience_token_claims),
    keyed: await mint(keyed.audience_token_claims),
};

type Payload = Record<string, unknown>;

describe.each([
    ['auth-core 2.35.0', current],
    ['auth-core 2.22.0', oldest],
] as const)('%s', (_name, ac) => {
    const cfg = { publicJwk: publicJwkB64, issuer: ISSUER };
    const read = async (token: string) => (await ac.verifySessionToken(token, cfg)) as Payload;

    it('verifySessionToken returns the same session, plus a field it never reads', async () => {
        const before = await read(session.plain);
        const after = await read(session.keyed);
        expect(before).toMatchObject({ did_oc: plain.token_claims.did_oc, amr: ['email'] });
        expect(withoutIdentityKey(after)).toEqual(before);
        expect(after.identity_key).toEqual(IDENTITY_KEY);
    });

    it('never reads it as signing by bip322', async () => {
        const after = await read(session.keyed);
        expect(after.signing_method).toBe(plain.token_claims.signing_method);
        expect(after.signing_method).not.toBe('bip322');
    });

    it('shows the person by their email, never by the address', async () => {
        const before = ac.resolveDisplayIdentity((await read(session.plain)) as never);
        const after = ac.resolveDisplayIdentity((await read(session.keyed)) as never);
        expect(before).toEqual({ kind: 'email', value: EMAIL });
        expect(after).toEqual(before);
    });

    it("checkOcToken reads the popup's token for its site the same", async () => {
        const before = await ac.checkOcToken(bound.plain, { audience: AUDIENCE });
        const after = await ac.checkOcToken(bound.keyed, { audience: AUDIENCE });
        expect(before).toMatchObject({ status: 'valid', session: { aud: AUDIENCE, amr: ['email'] } });
        expect(after.status).toBe('valid');
        const s = (after as { session: Payload }).session;
        expect(withoutIdentityKey(s)).toEqual((before as { session: Payload }).session);
    });

    it('getOcSession reads the cookie and the bearer token the same', async () => {
        const cookie = { cookie: `oc_session=${session.plain}` };
        const cookieKeyed = { cookie: `oc_session=${session.keyed}` };
        const before = (await ac.getOcSession(cookie)) as Payload;
        expect(before).toMatchObject({ did_oc: plain.token_claims.did_oc });
        expect(withoutIdentityKey((await ac.getOcSession(cookieKeyed)) as Payload)).toEqual(before);

        const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
        const site = { audience: AUDIENCE };
        const b = (await ac.getOcSession(bearer(bound.plain), site)) as Payload;
        expect(b).toMatchObject({ aud: AUDIENCE });
        expect(withoutIdentityKey((await ac.getOcSession(bearer(bound.keyed), site)) as Payload)).toEqual(b);
    });
});

describe('auth-core 2.35.0 sign-in rules', () => {
    const cfg = { publicJwk: publicJwkB64, issuer: ISSUER };
    const read = async (token: string) => (await current.verifySessionToken(token, cfg))!;

    it('reads the same sign-in facts: email, nothing else', async () => {
        const before = current.readSignInFacts(await read(session.plain));
        expect(before.amr).toEqual(['email']);
        expect(typeof before.auth_time).toBe('number');
        expect(current.readSignInFacts(await read(session.keyed))).toEqual(before);
    });

    it('a site asking for an email sign-in still admits it', async () => {
        const rule = { audience: AUDIENCE, requireSignIn: { amr: ['email'] as const } };
        expect((await current.checkOcToken(bound.plain, rule)).status).toBe('valid');
        expect((await current.checkOcToken(bound.keyed, rule)).status).toBe('valid');
    });

    it('a site asking for a Bitcoin sign-in admits neither', async () => {
        const rule = { audience: AUDIENCE, requireSignIn: { amr: ['bip322'] as const } };
        for (const t of [bound.plain, bound.keyed]) {
            expect(await current.checkOcToken(t, rule)).toEqual({
                status: 'invalid',
                reason: 'insufficient_authentication',
            });
        }
    });

    it('reproofFresh counts a fresh tap the same', async () => {
        const at = Math.floor(Date.now() / 1000);
        const tapped = (claims: Record<string, unknown>) => mint(claims, { step_up_at: at });
        const before = await read(await tapped(plain.token_claims));
        const after = await read(await tapped(keyed.token_claims));
        expect(current.reproofFresh(before, { max_age_secs: 300 })).toBe(true);
        expect(current.reproofFresh(after, { max_age_secs: 300 })).toBe(true);
    });
});
