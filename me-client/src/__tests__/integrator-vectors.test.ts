import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    _resetJwksCachesForTests,
    integratorRevocationCheck,
    revocationKey,
} from '@orangecheck/auth-core';

import { oc } from '../index';
import { verifyOcToken } from '../server';
import { verify as verifyWebhook, type OcPublicJwk } from '../webhook';

/**
 * The wire formats an integrator's own backend speaks, held to the vectors in
 * test-vectors/integrator.json. sdk-py reads the same file
 * (tests/test_integrator_vectors.py), so a Python site and a Node site accept
 * and refuse exactly the same tokens, event signatures, webhooks and ended sessions.
 */

const V = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'test-vectors', 'integrator.json'), 'utf8')
) as {
    now: number;
    session: {
        issuer: string;
        jwks: { keys: unknown[] };
        valid: { name: string; token: string; audience: string; claims: Record<string, unknown> }[];
        invalid: { name: string; token: string; audience: string }[];
    };
    event: {
        name: string;
        secret: string;
        timestamp: number;
        fields: {
            project_key: string;
            subtype: string;
            payment_amount_sats?: number;
            action_label?: string;
            user_address?: string;
        };
        body: string;
        header: string;
    }[];
    webhook: {
        jwks: { keys: OcPublicJwk[] };
        valid: { name: string; headers: Record<string, string>; body: string }[];
        invalid: { name: string; headers: Record<string, string>; body: string }[];
    };
};

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('sign-in tokens · verifyOcToken', () => {
    beforeEach(() => {
        _resetJwksCachesForTests();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(V.now * 1000);
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                expect(url).toBe('https://ochk.io/.well-known/jwks.json');
                return { ok: true, status: 200, json: async () => V.session.jwks } as Response;
            })
        );
    });

    it.each(V.session.valid)('accepts: $name', async (v) => {
        const p = await verifyOcToken(v.token, { audience: v.audience });
        expect(p).toMatchObject(v.claims);
    });

    it.each(V.session.invalid)('refuses: $name', async (v) => {
        expect(await verifyOcToken(v.token, { audience: v.audience })).toBeNull();
    });
});

describe('event signatures · oc.event.fire', () => {
    it.each(V.event)('sends the vector body and header: $name', async (v) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(v.timestamp * 1000);
        const calls: RequestInit[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (_url: string, init: RequestInit) => {
                calls.push(init);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ ok: true }),
                    headers: { get: () => null },
                } as unknown as Response;
            })
        );
        await oc.event.fire({
            project_key: v.fields.project_key,
            subtype: v.fields.subtype,
            payment_amount_sats: v.fields.payment_amount_sats,
            action_label: v.fields.action_label,
            userAddress: v.fields.user_address,
            signingSecret: v.secret,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.body).toBe(v.body);
        expect((calls[0]!.headers as Record<string, string>)['x-oc-signature']).toBe(v.header);
    });
});

describe('webhook signatures · oc.webhook.verify', () => {
    const jwk = V.webhook.jwks.keys[0]!;

    it.each(V.webhook.valid)('accepts: $name', async (v) => {
        const r = await verifyWebhook(v.body, v.headers['OC-Signature'], v.headers['OC-Key-Id'], {
            jwk,
        });
        expect(r).toEqual({ ok: true });
    });

    it.each(V.webhook.invalid)('refuses: $name', async (v) => {
        const r = await verifyWebhook(v.body, v.headers['OC-Signature'], v.headers['OC-Key-Id'], {
            jwk,
        });
        expect(r.ok).toBe(false);
    });
});

const R = (V as unknown as {
    revocation: {
        request: { project_key: string; secret: string; timestamp: number; url: string; header: string };
        keys: { sub: string; key: string }[];
        feed: { v: 1; at: number; tokens: string[]; accounts: Record<string, number> };
        sessions: { name: string; sub: string; iat: number | null; status: string }[];
    };
}).revocation;

describe('vectors · account cutoffs', () => {
    const seen: { url: string; signature: string | null }[] = [];
    const check = () =>
        integratorRevocationCheck({
            projectKey: R.request.project_key,
            signingSecret: R.request.secret,
            now: () => R.request.timestamp * 1000,
            fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
                seen.push({ url: String(url), signature: new Headers(init?.headers).get('x-oc-signature') });
                return Response.json(R.feed);
            }) as typeof fetch,
        })!;

    it('signs the request as the vector does', async () => {
        await check().status({ sub: 'x', iat: 0 });
        expect(seen.at(-1)).toEqual({ url: R.request.url, signature: R.request.header });
    });

    it.each(R.keys)('derives the key for $sub', async (v) => {
        expect(await revocationKey('sub', v.sub)).toBe(v.key);
    });

    it.each(R.sessions)('decides: $name', async (v) => {
        const c = check();
        expect(await c.status({ sub: v.sub, iat: v.iat ?? undefined, jti: 'j' })).toBe(v.status);
    });
});
