import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { identity, webhook } from '../index';
import {
    checkOcSession,
    checkSignInRule,
    exchangeNativeCode,
    ocAuthExpress,
    ocAuthHono,
    revokeToken,
    withOcAuth,
} from '../server';

// auth-core's one rule for an origin a site names, read from its vectors (sdk-py reads them too):
// every call here that takes an issuer or meOrigin takes the same set and sends to the same origin.
const V = JSON.parse(
    readFileSync(new URL('../../../auth-core/test-vectors/issuer-origin.json', import.meta.url), 'utf8')
) as { accepted: { input: string; origin: string }[]; refused: string[] };

const NATIVE = {
    code: 'A'.repeat(43),
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    redirectUri: 'http://127.0.0.1:53819/oc/callback',
    audience: 'https://my-site.example',
};
const PROJECT = 'pk_test_AbCdEfGhIjKlMnOp';
const rule = (what: string) => new RegExp(`^@orangecheck/me-client: ${what} must be one origin with no path`);

/** Every URL fetched; each answer is a 503. */
function fetches(): string[] {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: RequestInfo | URL) => {
        urls.push(String(url));
        return new Response('{}', { status: 503 });
    });
    return urls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('revokeToken', () => {
    it.each(V.accepted)('posts to $origin for $input', async ({ input, origin }) => {
        const urls = fetches();
        await revokeToken('a.b.c', { issuer: input });
        expect(urls).toEqual([`${origin}/api/auth/revoke`]);
    });

    it.each(V.refused)('throws for %j and sends nothing', (input) => {
        const urls = fetches();
        expect(() => revokeToken('a.b.c', { issuer: input })).toThrow(rule('revokeToken: issuer'));
        expect(urls).toEqual([]);
    });
});

describe('exchangeNativeCode', () => {
    it.each(V.accepted)('posts to $origin for $input', async ({ input, origin }) => {
        const urls = fetches();
        await exchangeNativeCode(NATIVE, { projectKey: PROJECT, issuer: input });
        expect(urls).toEqual([`${origin}/api/auth/native/token`]);
    });

    it.each(V.refused)('throws for the issuer %j and sends nothing', async (input) => {
        const urls = fetches();
        await expect(exchangeNativeCode(NATIVE, { projectKey: PROJECT, issuer: input })).rejects.toThrow(
            rule('exchangeNativeCode: issuer')
        );
        expect(urls).toEqual([]);
    });

    it.each(V.refused)('throws for meOrigin %j and sends nothing', async (input) => {
        const urls = fetches();
        await expect(exchangeNativeCode(NATIVE, { projectKey: PROJECT, meOrigin: input })).rejects.toThrow(
            rule('exchangeNativeCode: meOrigin')
        );
        expect(urls).toEqual([]);
    });
});

describe('the session check and the adapters', () => {
    it.each(V.accepted)('take $input as issuer and meOrigin', ({ input }) => {
        const options = { issuer: input, meOrigin: input };
        expect(() => withOcAuth(() => undefined, options)).not.toThrow();
        expect(() => ocAuthExpress(options)).not.toThrow();
        expect(() => ocAuthHono(options)).not.toThrow();
    });

    it.each(V.refused)('throw for %j when they are made, before any request', async (input) => {
        const urls = fetches();
        for (const name of ['issuer', 'meOrigin'] as const) {
            const options = { [name]: input };
            expect(() => withOcAuth(() => undefined, options)).toThrow(rule(name));
            expect(() => ocAuthExpress(options)).toThrow(rule(name));
            expect(() => ocAuthHono(options)).toThrow(rule(name));
            await expect(checkOcSession({ authorization: 'Bearer a.b.c' }, options)).rejects.toThrow(rule(name));
        }
        await expect(checkSignInRule({} as never, { projectKey: PROJECT, meOrigin: input })).rejects.toThrow(
            rule('meOrigin')
        );
        expect(urls).toEqual([]);
    });
});

describe('the webhook key set', () => {
    const SIG = 'ab'.repeat(64);

    it.each(V.accepted)('is read at $origin for $input', async ({ input, origin }) => {
        const urls = fetches();
        expect((await webhook.verify('{}', SIG, 'k1', { issuer: input })).ok).toBe(false);
        await expect(webhook.fetchJwks(input)).rejects.toThrow();
        expect(urls).toEqual([`${origin}/api/dev-jwks`, `${origin}/api/dev-jwks`]);
    });

    it.each(V.refused)('is never read for %j', async (input) => {
        const urls = fetches();
        expect(await webhook.verify('{}', SIG, 'k1', { issuer: input })).toEqual({
            ok: false,
            reason: 'issuer must be one origin with no path: https, or http on localhost, 127.0.0.1 or [::1]',
        });
        await expect(webhook.fetchJwks(input)).rejects.toThrow(rule('webhook.fetchJwks: issuer'));
        expect(urls).toEqual([]);
    });
});

describe('the envelope key set', () => {
    it.each(V.accepted)('is refreshed at $origin for $input', async ({ input, origin }) => {
        const urls = fetches();
        await expect(identity.refreshEnvelopeJwks(input)).rejects.toThrow();
        expect(urls).toEqual([`${origin}/.well-known/oc-envelope-jwks.json`]);
    });

    it.each(V.refused)('is never refreshed for %j', async (input) => {
        const urls = fetches();
        await expect(identity.refreshEnvelopeJwks(input)).rejects.toThrow(rule('refreshEnvelopeJwks: issuer'));
        expect(urls).toEqual([]);
    });
});
