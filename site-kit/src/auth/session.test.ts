import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeKeys, mint, type Keys } from './fixtures';
import { createSessionReader } from './session';

let keys: Keys;
beforeEach(() => {
    keys = makeKeys();
    process.env.OC_AUTH_PUBLIC_JWK = keys.publicJwk;
    delete process.env.OC_AUTH_ISSUER;
});
afterEach(() => {
    delete process.env.OC_AUTH_PUBLIC_JWK;
});

const get = (headers: Record<string, string>) => ({ method: 'GET', headers });

describe('createSessionReader', () => {
    it('reads a valid cookie, skipping a stale duplicate before it', async () => {
        const good = await mint(keys, 'did:oc:aa');
        const r = await createSessionReader().resolve(get({ cookie: `oc_session=garbage; oc_session=${good}` }));
        expect(r).toMatchObject({ ok: true, via: 'cookie', session: { did_oc: 'did:oc:aa' } });
    });

    it('prefers the per-tab token over the cookie', async () => {
        const cookie = await mint(keys, 'did:oc:cookie');
        const tab = await mint(keys, 'did:oc:tab');
        const r = await createSessionReader().resolve(get({ cookie: `oc_session=${cookie}`, 'x-oc-tab-session': tab }));
        expect(r).toMatchObject({ ok: true, via: 'tab', session: { did_oc: 'did:oc:tab' } });
    });

    it('fails closed on a bad per-tab token and never falls back to the cookie', async () => {
        const cookie = await mint(keys, 'did:oc:cookie');
        const r = await createSessionReader().resolve(get({ cookie: `oc_session=${cookie}`, 'x-oc-tab-session': 'dead' }));
        expect(r).toEqual({ ok: false, reason: 'tab_invalid', tab: true });
    });

    it('rejects a token signed by another key, and an expired one', async () => {
        const other = await mint(makeKeys(), 'did:oc:x');
        const expired = await mint(keys, 'did:oc:x', {}, -60);
        for (const t of [other, expired]) {
            expect(await createSessionReader().resolve(get({ cookie: `oc_session=${t}` }))).toEqual({ ok: false, reason: 'no_session', tab: false });
        }
    });

    it('gives a cross-site POST no session, however valid its cookie', async () => {
        const cookie = await mint(keys, 'did:oc:aa');
        const reader = createSessionReader({ developing: false });
        const post = (h: Record<string, string>) => ({ method: 'POST', headers: { cookie: `oc_session=${cookie}`, ...h } });
        expect(await reader.read(post({ 'sec-fetch-site': 'cross-site' }))).toBeNull();
        expect(await reader.read(post({}))).toBeNull();
        expect(await reader.read(post({ 'sec-fetch-site': 'same-site', origin: 'https://status.ochk.io' }))).toBeNull();
        expect((await reader.resolve(post({ 'sec-fetch-site': 'cross-site' }))).ok).toBe(false);
        expect(await reader.read(post({ 'sec-fetch-site': 'same-origin' }))).toMatchObject({ did_oc: 'did:oc:aa' });
        expect(await reader.read(post({ 'sec-fetch-site': 'same-site', origin: 'https://vault.ochk.io' }))).toMatchObject({ did_oc: 'did:oc:aa' });
    });

    it('signs out an account the site treats as deleted', async () => {
        const cookie = await mint(keys, 'did:oc:gone');
        const reader = createSessionReader({ isRevoked: async (did) => did === 'did:oc:gone' });
        expect(await reader.resolve(get({ cookie: `oc_session=${cookie}` }))).toEqual({ ok: false, reason: 'revoked', tab: false });
    });

    it('fails loudly without a key, or with the key as raw JSON', async () => {
        delete process.env.OC_AUTH_PUBLIC_JWK;
        await expect(createSessionReader().resolve(get({}))).rejects.toThrow(/not set/);
        process.env.OC_AUTH_PUBLIC_JWK = Buffer.from(keys.publicJwk, 'base64url').toString('utf8');
        await expect(createSessionReader().resolve(get({}))).rejects.toThrow(/raw JSON/);
    });

    it('checks the issuer', async () => {
        process.env.OC_AUTH_ISSUER = 'https://elsewhere.example';
        const cookie = await mint(keys, 'did:oc:aa');
        expect((await createSessionReader().resolve(get({ cookie: `oc_session=${cookie}` }))).ok).toBe(false);
    });
});
