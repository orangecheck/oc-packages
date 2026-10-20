import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeKeys, mint, recorder, type Keys } from './fixtures';
import { createMeHandler } from './me';
import { createSessionReader } from './session';

let keys: Keys;
beforeEach(() => {
    keys = makeKeys();
    process.env.OC_AUTH_PUBLIC_JWK = keys.publicJwk;
});
afterEach(() => {
    delete process.env.OC_AUTH_PUBLIC_JWK;
});

async function call(handler: ReturnType<typeof createMeHandler>, headers: Record<string, string> = {}, method = 'GET') {
    const { res, out } = recorder();
    await handler({ method, headers } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    return out;
}

const reader = () => createSessionReader();

describe('createMeHandler', () => {
    it('signed out: 200 with a null account, uncacheable', async () => {
        const out = await call(createMeHandler({ reader: reader() }));
        expect(out.status).toBe(200);
        expect(out.body).toEqual({ ok: true, account: null });
        expect(out.headers['cache-control']).toBe('no-store, private');
        expect(out.headers.vary).toBe('Cookie, X-OC-Tab-Session');
    });

    it('signed in: the account shape auth-client normalises', async () => {
        const cookie = await mint(keys, 'did:oc:aa', {
            name: 'satoshi',
            npub: 'npub1x',
            home_federation: 'oc-testnet-v1',
            display_identity: { kind: 'btc', value: 'bc1qexample' },
            is_owner: true,
        });
        const out = await call(createMeHandler({ reader: reader() }), { cookie: `oc_session=${cookie}` });
        expect(out.status).toBe(200);
        expect(out.body).toEqual({
            ok: true,
            account: {
                id: 'acct-did:oc:aa',
                did_oc: 'did:oc:aa',
                primary_btc: null,
                display_name: 'satoshi',
                nostr_npub: 'npub1x',
                display_identity: { kind: 'btc', value: 'bc1qexample' },
                home_federation_slug: 'oc-testnet-v1',
                signing_method: 'bip322',
                is_owner: true,
            },
        });
    });

    it('a dead per-tab pin is a 401, so the client drops it and retries on the cookie', async () => {
        const cookie = await mint(keys, 'did:oc:aa');
        const out = await call(createMeHandler({ reader: reader() }), { cookie: `oc_session=${cookie}`, 'x-oc-tab-session': 'dead' });
        expect(out.status).toBe(401);
        expect(out.body).toEqual({ ok: false, reason: 'tab_invalid' });
    });

    it('a pinned tab whose account is deleted is a 401 too', async () => {
        const tab = await mint(keys, 'did:oc:gone');
        const handler = createMeHandler({ reader: createSessionReader({ isRevoked: (s) => s.did_oc === 'did:oc:gone' }) });
        const out = await call(handler, { 'x-oc-tab-session': tab });
        expect(out).toMatchObject({ status: 401, body: { ok: false, reason: 'revoked' } });
    });

    it('a signed-out cookie reads as signed out, not as the account', async () => {
        const cookie = await mint(keys, 'did:oc:aa');
        const ended = { status: async () => 'revoked' as const, refuses: async () => true };
        const out = await call(createMeHandler({ reader: createSessionReader({ revocation: ended }) }), {
            cookie: `oc_session=${cookie}`,
        });
        expect(out).toMatchObject({ status: 200, body: { ok: true, account: null } });
    });

    it.each(['POST', 'PUT', 'DELETE', 'HEAD'])('%s is 405 with Allow: GET', async (method) => {
        const out = await call(createMeHandler({ reader: reader() }), {}, method);
        expect(out.status).toBe(405);
        expect(out.headers.allow).toBe('GET');
        expect(out.headers['cache-control']).toBe('no-store, private');
    });

    it('ownerHint false: is_owner is always false', async () => {
        const cookie = await mint(keys, 'did:oc:aa', { is_owner: true });
        const out = await call(createMeHandler({ reader: reader(), ownerHint: false }), { cookie: `oc_session=${cookie}` });
        expect((out.body as { account: { is_owner: boolean } }).account.is_owner).toBe(false);
    });

    it('asks the fallback only when there is no session, and never for a dead pin', async () => {
        const fallback = vi.fn(async () => ({
            id: 'did:oc:tok',
            did_oc: 'did:oc:tok',
            primary_btc: null,
            display_name: null,
            nostr_npub: null,
            display_identity: null,
            home_federation_slug: null,
            signing_method: null,
            is_owner: false,
        }));
        const handler = createMeHandler({ reader: reader(), fallback });
        expect((await call(handler)).body).toMatchObject({ ok: true, account: { did_oc: 'did:oc:tok' } });
        expect((await call(handler, { 'x-oc-tab-session': 'dead' })).status).toBe(401);
        const cookie = await mint(keys, 'did:oc:aa');
        await call(handler, { cookie: `oc_session=${cookie}` });
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('runs after() only for a signed-in answer, after it is sent', async () => {
        const seen: string[] = [];
        const handler = createMeHandler({ reader: reader(), after: (s) => seen.push(s.did_oc) });
        await call(handler);
        const cookie = await mint(keys, 'did:oc:aa');
        const out = await call(handler, { cookie: `oc_session=${cookie}` });
        expect(out.status).toBe(200);
        expect(seen).toEqual(['did:oc:aa']);
    });
});
