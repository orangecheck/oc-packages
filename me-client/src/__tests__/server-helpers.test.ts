import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests, integratorRevocationCheck } from '@orangecheck/auth-core';

import {
    _resetSessionChecksForTests,
    MemoryJtiStore,
    revokeToken,
    spendOnce,
    withOcAuth,
    type JtiStore,
    type WithOcAuthOptions,
} from '../server';

/**
 * A site's own backend: what it answers for a sign-in token, spending a token's
 * jti once, and ending a token at ochk.io. Held to
 * test-vectors/server-helpers.json, which sdk-py reads too
 * (tests/test_server_helpers.py), so a Node site and a Python site answer alike.
 */

const read = (name: string) =>
    JSON.parse(readFileSync(join(__dirname, '..', '..', 'test-vectors', name), 'utf8'));
const H = read('server-helpers.json');
/** The SDK's own refusal, not a TypeError from calling something that isn't there. */
const SDK = /^@orangecheck\/me-client: /;
const V = read('integrator.json');

type Answer = { status: number; body: unknown };
type Case = {
    name: string;
    token: [string, string, string] | null;
    audience: string;
    method: string | null;
    jwks?: Answer;
    list?: Answer;
    policy?: Answer;
    project_key?: string;
    require_bond?: { min_sats?: number; min_days?: number; max_age_secs?: number };
    expect: { status: number; body?: unknown };
};

/** A token named in integrator.json: [section, list, name]. */
function tokenFor(ref: [string, string, string]): string {
    const [section, list, name] = ref;
    const found = (V[section][list] as { name: string; token: string }[]).find((v) => v.name === name);
    if (!found) throw new Error(`no vector ${ref.join(' / ')}`);
    return found.token;
}

/** `{ repeat, of, count }` as the list or string it stands for. */
function expand(input: unknown): unknown {
    if (input && typeof input === 'object' && !Array.isArray(input) && 'repeat' in input) {
        const { repeat, of, count } = input as { repeat: string; of: string; count: number };
        return repeat === 'list' ? Array.from({ length: count }, () => of) : of.repeat(count);
    }
    return input;
}

function respond(answer: Answer): Response {
    const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
    return new Response(body, { status: answer.status });
}

beforeEach(() => {
    _resetJwksCachesForTests();
    _resetSessionChecksForTests();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(H.now * 1000);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('one request · the adapters answer as the vectors say', () => {
    async function answer(c: Case) {
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                const u = String(url);
                if (u === 'https://ochk.io/.well-known/jwks.json')
                    return respond(c.jwks ?? { status: 200, body: V.session.jwks });
                if (u.includes('/api/integrator/revocations?') && c.list) return respond(c.list);
                if (/\/api\/integrator\/[^/]+\/sign-in$/.test(u) && c.policy) return respond(c.policy);
                throw new Error(`unexpected fetch ${u}`);
            })
        );
        const options: WithOcAuthOptions = {
            audience: c.audience,
            required: true,
            revocation: c.list
                ? integratorRevocationCheck({ projectKey: H.check.project_key, signingSecret: H.check.secret })!
                : false,
        };
        if (c.project_key) options.projectKey = c.project_key;
        if (c.require_bond) {
            const b = c.require_bond;
            options.requireBond = {
                ...(b.min_sats !== undefined ? { minSats: b.min_sats } : {}),
                ...(b.min_days !== undefined ? { minDays: b.min_days } : {}),
                ...(b.max_age_secs !== undefined ? { maxAgeSecs: b.max_age_secs } : {}),
            };
        }
        const out = { status: 200, body: undefined as unknown, ran: false };
        const res = {
            status(code: number) {
                out.status = code;
                return res;
            },
            json(body: unknown) {
                out.body = body;
                return undefined;
            },
            setHeader: () => undefined,
        };
        const token = c.token ? tokenFor(c.token) : null;
        await withOcAuth(async () => {
            out.ran = true;
        }, options)(
            {
                ...(c.method ? { method: c.method } : {}),
                headers: token ? { authorization: `Bearer ${token}` } : {},
            },
            res
        );
        return out;
    }

    it.each(H.check.cases as Case[])('$name', async (c) => {
        const out = await answer(c);
        expect(out.status).toBe(c.expect.status);
        if (c.expect.status === 200) expect(out.ran).toBe(true);
        else expect(out.body).toEqual(c.expect.body);
    });
});

describe('spendOnce · a token starts one session', () => {
    it('answers each step as the vectors say, on one store', async () => {
        const store = new MemoryJtiStore();
        for (const s of H.spend_once.steps) {
            vi.setSystemTime(s.now * 1000);
            expect(await spendOnce(s.jti, s.exp, store), s.name).toBe(s.spent);
        }
    });

    it.each(H.spend_once.refused)('refuses a call that cannot be right: $name', (s) => {
        const add = vi.fn(() => true);
        expect(() => spendOnce(s.jti as string, s.exp as number, { add })).toThrow(SDK);
        expect(add).not.toHaveBeenCalled();
    });

    it('never asks the store about an expired token', async () => {
        const add = vi.fn(() => true);
        expect(await spendOnce('jti-x', H.now - 1, { add })).toBe(false);
        expect(add).not.toHaveBeenCalled();
    });

    it('passes the jti and exp to your store, sync or async, and returns its answer', async () => {
        const seen: [string, number][] = [];
        const store: JtiStore = {
            add: async (jti, exp) => {
                seen.push([jti, exp]);
                return seen.length === 1;
            },
        };
        expect(await spendOnce('jti-1', H.now + 60, store)).toBe(true);
        expect(await spendOnce('jti-1', H.now + 60, store)).toBe(false);
        expect(seen).toEqual([
            ['jti-1', H.now + 60],
            ['jti-1', H.now + 60],
        ]);
    });

    it('fails closed when the store answers anything but true or false, or throws', async () => {
        await expect(
            spendOnce('jti-1', H.now + 60, { add: () => 'yes' as unknown as boolean })
        ).rejects.toThrow(SDK);
        await expect(
            spendOnce('jti-1', H.now + 60, {
                add: () => {
                    throw new Error('db down');
                },
            })
        ).rejects.toThrow('db down');
    });

    it('needs a store', () => {
        expect(() => spendOnce('jti-1', H.now + 60, undefined as unknown as JtiStore)).toThrow(SDK);
        expect(() => spendOnce('jti-1', H.now + 60, {} as JtiStore)).toThrow(SDK);
    });
});

describe('revokeToken · ending a token at ochk.io', () => {
    function stub(answer: Answer) {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit) => {
                calls.push({ url: String(url), init });
                if (answer.status === 0) throw new TypeError('fetch failed');
                // fetch with redirect: 'error' rejects on a redirect.
                if (answer.status >= 300 && answer.status < 400) throw new TypeError('unexpected redirect');
                return respond(answer);
            })
        );
        return calls;
    }

    it.each(H.revoke.requests)('sends $name', async (r) => {
        const calls = stub({ status: 200, body: { ok: true, revoked: 1 } });
        await revokeToken(expand(r.input) as string | string[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(H.revoke.url);
        expect(calls[0]!.init.method).toBe('POST');
        expect(calls[0]!.init.redirect).toBe('error');
        expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/json');
        const body = r.body as { tokens: unknown };
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ tokens: expand(body.tokens) });
    });

    it.each(H.revoke.refused)('refuses before sending: $name', (r) => {
        const calls = stub({ status: 200, body: { ok: true, revoked: 1 } });
        expect(() => revokeToken(expand(r.input) as string)).toThrow(SDK);
        expect(calls).toHaveLength(0);
    });

    it.each(H.revoke.answers)('reads the answer: $name', async (a) => {
        stub({ status: a.status, body: a.body });
        expect(await revokeToken('a.b.c')).toEqual(a.result);
    });

    it('goes to the issuer you name, and only an https one (or http on this machine)', async () => {
        const calls = stub({ status: 200, body: { ok: true, revoked: 1 } });
        await revokeToken('a.b.c', { issuer: 'https://oc-www-test.vercel.app/' });
        await revokeToken('a.b.c', { issuer: 'http://localhost:3000' });
        expect(calls.map((c) => c.url)).toEqual([
            'https://oc-www-test.vercel.app/api/auth/revoke',
            'http://localhost:3000/api/auth/revoke',
        ]);
        expect(() => revokeToken('a.b.c', { issuer: 'http://ochk.io' })).toThrow(SDK);
        expect(() => revokeToken('a.b.c', { issuer: 'not a url' })).toThrow(SDK);
    });

    it('refuses an option it does not read', () => {
        stub({ status: 200, body: { ok: true, revoked: 1 } });
        expect(() => revokeToken('a.b.c', { timeout: 5 } as never)).toThrow(/unknown option timeout/);
        expect(() => revokeToken('a.b.c', { timeoutMs: 0 })).toThrow(SDK);
        expect(() => revokeToken('a.b.c', { timeoutMs: 30_001 })).toThrow(SDK);
    });
});
