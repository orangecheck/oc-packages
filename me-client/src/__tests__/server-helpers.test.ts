import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetJwksCachesForTests, integratorRevocationCheck } from '@orangecheck/auth-core';

import {
    _resetSessionChecksForTests,
    checkOcToken,
    checkSignInRule,
    exchangeNativeCode,
    getOcSession,
    MemoryJtiStore,
    revokeToken,
    spendOnce,
    withOcAuth,
    type JtiStore,
    type SessionPayload,
    type SignInRuleOptions,
    type WithOcAuthOptions,
    verifyOcToken,
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
        // One origin and nothing else: a path, query, fragment or user name sends the tokens elsewhere.
        for (const bad of [
            'https://ochk.io/#',
            'https://ochk.io?x',
            'https://ochk.io/path',
            'https://u:p@ochk.io',
            'https://ochk.io\\@evil.example',
        ]) {
            expect(() => revokeToken('a.b.c', { issuer: bad }), bad).toThrow(SDK);
        }
    });

    it('refuses an option it does not read', () => {
        stub({ status: 200, body: { ok: true, revoked: 1 } });
        expect(() => revokeToken('a.b.c', { timeout: 5 } as never)).toThrow(/unknown option timeout/);
        expect(() => revokeToken('a.b.c', { timeoutMs: 0 })).toThrow(SDK);
        expect(() => revokeToken('a.b.c', { timeoutMs: 30_001 })).toThrow(SDK);
    });
});

describe('exchangeNativeCode · a native sign-in code traded for its token', () => {
    type In = { code: string; code_verifier: string; redirect_uri: string; project_key: string; audience: string };
    const X = H.exchange_native as {
        url: string;
        input: In;
        body: unknown;
        refused: { name: string; input: Partial<Record<keyof In, unknown>> }[];
        answers: {
            name: string;
            status: number;
            body: unknown;
            jwks?: Answer;
            result: { status: string; reason?: string; claims?: Record<string, unknown> };
        }[];
    };
    const call = (i: Record<string, unknown>) =>
        exchangeNativeCode({
            code: i.code,
            codeVerifier: i.code_verifier,
            redirectUri: i.redirect_uri,
            projectKey: i.project_key,
            audience: i.audience,
        } as Parameters<typeof exchangeNativeCode>[0]);

    function stub(answer: Answer, jwks?: Answer) {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string, init: RequestInit = {}) => {
                const u = String(url);
                if (u === 'https://ochk.io/.well-known/jwks.json') return respond(jwks ?? { status: 200, body: V.session.jwks });
                calls.push({ url: u, init });
                if (answer.status === 0) throw new TypeError('fetch failed');
                if (answer.status >= 300 && answer.status < 400) throw new TypeError('unexpected redirect');
                return respond(answer);
            })
        );
        return calls;
    }

    it('sends what sdk-py sends', async () => {
        const calls = stub({ status: 400, body: { ok: false, reason: 'invalid_grant' } });
        await call(X.input);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(X.url);
        expect(calls[0]!.init).toMatchObject({ method: 'POST', redirect: 'error' });
        expect(JSON.parse(String(calls[0]!.init.body))).toEqual(X.body);
    });

    it.each(X.refused)('refuses before sending: $name', async (r) => {
        const calls = stub({ status: 200, body: { ok: true } });
        const patch = Object.fromEntries(Object.entries(r.input).map(([k, v]) => [k, expand(v)]));
        await expect(call({ ...X.input, ...patch })).rejects.toThrow(SDK);
        expect(calls).toHaveLength(0);
    });

    it.each(X.answers)('reads the answer: $name', async (a) => {
        const body =
            a.body && typeof a.body === 'object' && Array.isArray((a.body as { token?: unknown }).token)
                ? { ...a.body, token: tokenFor((a.body as { token: [string, string, string] }).token) }
                : a.body;
        stub({ status: a.status, body }, a.jwks);
        const got = await call(X.input);
        if (a.result.status === 'valid') {
            expect(got.status).toBe('valid');
            if (got.status === 'valid') expect(got.session).toMatchObject(a.result.claims!);
        } else {
            expect(got).toEqual({ status: a.result.status, reason: a.result.reason });
        }
    });
});

describe('the sign-in rule for a session the site verified · checkSignInRule', () => {
    type Bond = { min_sats?: number; min_days?: number; max_age_secs?: number };
    type RuleCase = {
        name: string;
        session: [string, string, string];
        project_key?: string;
        require_bond?: Bond;
        policy?: Answer;
        expect: { status: number; body?: unknown };
    };
    type Refused = {
        name: string;
        session: [string, string, string] | null;
        verified?: boolean;
        options: Record<string, unknown>;
    };

    /** ochk.io's key set, and the project's rule from `policy`, counting the rule's reads. */
    function serve(policy?: Answer) {
        const reads = { rule: 0 };
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                const u = String(url);
                if (u === 'https://ochk.io/.well-known/jwks.json') return respond({ status: 200, body: V.session.jwks });
                if (/\/api\/integrator\/[^/]+\/sign-in$/.test(u) && policy) {
                    reads.rule += 1;
                    return respond(policy);
                }
                throw new Error(`unexpected fetch ${u}`);
            })
        );
        return reads;
    }

    /** The session verifyOcToken returns for a token in integrator.json, or its claims as read. */
    async function sessionFor(ref: [string, string, string], verified = true): Promise<SessionPayload> {
        const [section, list, name] = ref;
        const found = (V[section][list] as { name: string; token: string; audience: string; claims: SessionPayload }[]).find(
            (v) => v.name === name
        );
        if (!found) throw new Error(`no vector ${ref.join(' / ')}`);
        if (!verified) return { ...found.claims };
        const session = await verifyOcToken(found.token, { audience: found.audience });
        if (!session) throw new Error(`${name} did not verify`);
        return session;
    }

    /** Vector options, in me-client's names. */
    function optionsFor(o: Record<string, unknown>): SignInRuleOptions {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
            if (k === 'project_key') out.projectKey = v;
            else if (k === 'require_bond') {
                const b = v as Bond;
                out.requireBond = {
                    ...(b.min_sats !== undefined ? { minSats: b.min_sats } : {}),
                    ...(b.min_days !== undefined ? { minDays: b.min_days } : {}),
                    ...(b.max_age_secs !== undefined ? { maxAgeSecs: b.max_age_secs } : {}),
                };
            } else out[k] = v;
        }
        return out as SignInRuleOptions;
    }

    it.each(H.sign_in_rule.cases as RuleCase[])('$name', async (c) => {
        const reads = serve(c.policy);
        const options = optionsFor({
            ...(c.project_key ? { project_key: c.project_key } : {}),
            ...(c.require_bond ? { require_bond: c.require_bond } : {}),
        });
        const checked = await checkSignInRule(await sessionFor(c.session), options);
        if (c.expect.status === 200) expect(checked).toEqual({ ok: true });
        else expect(checked).toEqual({ ok: false, status: c.expect.status, body: c.expect.body });
        // An explicit floor wins: the project's rule is never read.
        if (c.require_bond) expect(reads.rule).toBe(0);
    });

    it.each(H.sign_in_rule.refused as Refused[])('refuses: $name', async (r) => {
        const reads = serve({ status: 200, body: { ok: true, require_bond: null } });
        const session = r.session ? await sessionFor(r.session, r.verified !== false) : null;
        await expect(checkSignInRule(session as never, optionsFor(r.options))).rejects.toThrow(SDK);
        expect(reads.rule).toBe(0);
    });

    it('takes the session checkOcToken, getOcSession and withOcAuth hand over', async () => {
        serve({ status: 200, body: { ok: true, require_bond: null } });
        const v = (V.session.valid as { name: string; token: string; audience: string }[]).find(
            (x) => x.name === 'bound to this site'
        )!;
        const options = { projectKey: 'pk_test_srule_paths' };
        const checked = await checkOcToken(v.token, { audience: v.audience });
        expect(checked.status).toBe('valid');
        if (checked.status === 'valid') expect(await checkSignInRule(checked.session, options)).toEqual({ ok: true });
        const headers = { authorization: `Bearer ${v.token}` };
        const got = await getOcSession(headers, { audience: v.audience, revocation: false });
        expect(await checkSignInRule(got!, options)).toEqual({ ok: true });
        let wrapped: unknown = 'not run';
        await withOcAuth(
            async (req) => {
                wrapped = await checkSignInRule(req.ocSession!, options);
            },
            { audience: v.audience, revocation: false }
        )({ method: 'POST', headers }, { status: () => ({ json: () => undefined }), json: () => undefined, setHeader: () => undefined } as never);
        expect(wrapped).toEqual({ ok: true });
    });

    it('reads the rule once a minute, as withOcAuth does', async () => {
        const reads = serve({ status: 200, body: { ok: true, require_bond: null } });
        const session = await sessionFor(['session', 'valid', 'bound to this site']);
        await checkSignInRule(session, { projectKey: 'pk_test_srule_cache' });
        await checkSignInRule(session, { projectKey: 'pk_test_srule_cache' });
        expect(reads.rule).toBe(1);
        vi.setSystemTime(H.now * 1000 + 61_000);
        await checkSignInRule(session, { projectKey: 'pk_test_srule_cache' });
        expect(reads.rule).toBe(2);
    });
});
