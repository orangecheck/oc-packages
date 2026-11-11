import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeKeys, mint, type Keys } from './fixtures';
import * as entry from './index';
import { answerSeveralSessions, SeveralSessions, severalSessionsRefused, strayCookieClears } from './several';
import { createSessionReader } from './session';
import { answersUnverified } from './unverified';

let keys: Keys;
beforeEach(() => {
    keys = makeKeys();
    process.env.OC_AUTH_PUBLIC_JWK = keys.publicJwk;
    delete process.env.OC_AUTH_ISSUER;
});
afterEach(() => {
    delete process.env.OC_AUTH_PUBLIC_JWK;
});

/** Each clear as "<domain or host> <path>". */
const paths = (set: string[]) =>
    set.map((c) => `${/Domain=([^;]+)/.exec(c)?.[1] ?? 'host'} ${/Path=([^;]+)/.exec(c)?.[1]}`);

function recorder() {
    const out = { status: 0, headers: {} as Record<string, string | string[]>, body: undefined as unknown };
    const res = {
        headersSent: false,
        setHeader(k: string, v: string | string[]) {
            out.headers[k.toLowerCase()] = v;
            return res;
        },
        status(s: number) {
            out.status = s;
            return res;
        },
        json(b: unknown) {
            out.body = b;
            return res;
        },
    };
    return { res: res as unknown as NextApiResponse & { headersSent: boolean }, out };
}

/** A browser's oc_session cookies for the family, enough to apply clears and say what a request sends (RFC 6265 5.3, 5.4). */
type Cookie = { value: string; domain: string; hostOnly: boolean; path: string };
function jar(cookies: Cookie[]) {
    let held = [...cookies];
    const pathMatch = (req: string, at: string) =>
        req === at || (req.startsWith(at) && (at.endsWith('/') || req[at.length] === '/'));
    return {
        apply(host: string, setCookies: string[]) {
            for (const c of setCookies) {
                expect(c).toMatch(/^oc_session=;.*Max-Age=0/);
                const domain = /Domain=([^;]+)/.exec(c)?.[1]?.replace(/^\./, '');
                if (domain && !(host === domain || host.endsWith(`.${domain}`))) continue;
                const path = /Path=([^;]+)/.exec(c)![1]!;
                held = held.filter(
                    (k) => !(k.path === path && (domain ? !k.hostOnly && k.domain === domain : k.hostOnly && k.domain === host))
                );
            }
        },
        cookieFor(host: string, path: string) {
            return held
                .filter((k) => (k.hostOnly ? k.domain === host : host === k.domain || host.endsWith(`.${k.domain}`)))
                .filter((k) => pathMatch(path, k.path))
                .sort((a, b) => b.path.length - a.path.length)
                .map((k) => `oc_session=${k.value}`)
                .join('; ');
        },
    };
}

describe('strayCookieClears', () => {
    it('clears host-only cookies at every prefix, and the domain at every prefix but /', () => {
        expect(paths(strayCookieClears('/api/checkout?x=1', 'ochk.io'))).toEqual([
            'host /',
            'host /api',
            'ochk.io /api',
            'host /api/',
            'ochk.io /api/',
            'host /api/checkout',
            'ochk.io /api/checkout',
        ]);
    });

    it('without a domain, clears only host-only cookies below /', () => {
        expect(paths(strayCookieClears('/api/x'))).toEqual(['host /api', 'host /api/', 'host /api/x']);
    });

    it('stops at a part of the path no cookie can be set at, so no clear gains an attribute', () => {
        const set = strayCookieClears('/api/auth/webauthn/credentials/x;Domain=evil.example;Path=/', '.ochk.io');
        expect(set.filter((c) => /evil|;\s*Path=[^;]*;\s*Path=/i.test(c))).toEqual([]);
        expect(set.map((c) => c.match(/;\s*(Domain|Path)=/gi)?.length)).toEqual(
            set.map((c) => (/Domain=/.test(c) ? 2 : 1))
        );
        expect(paths(set).at(-1)).toBe('.ochk.io /api/auth/webauthn/credentials/');
    });

    it('still clears every part of a path a cookie can be set at, escaped ones too', () => {
        expect(paths(strayCookieClears('/api/auth/x%3By?z=;', '.ochk.io'))).toEqual([
            'host /',
            'host /api',
            '.ochk.io /api',
            'host /api/',
            '.ochk.io /api/',
            'host /api/auth',
            '.ochk.io /api/auth',
            'host /api/auth/',
            '.ochk.io /api/auth/',
            'host /api/auth/x%3By',
            '.ochk.io /api/auth/x%3By',
        ]);
    });
});

describe('severalSessionsRefused', () => {
    const req = (method: string, headers: Record<string, string>) => ({
        method,
        headers: { 'sec-fetch-site': 'same-origin', ...headers },
    });
    const two = 'oc_session=a; oc_session=b';

    it('holds for an allowed write with two cookies and no tab token', () => {
        expect(severalSessionsRefused(req('POST', { cookie: two }))).toBe(true);
        expect(severalSessionsRefused(req('delete', { cookie: two }))).toBe(true);
    });

    it('does not hold for a read, one cookie, a tab token, or a caller the origin gate refuses', () => {
        expect(severalSessionsRefused(req('GET', { cookie: two }))).toBe(false);
        expect(severalSessionsRefused(req('POST', { cookie: 'oc_session=a' }))).toBe(false);
        expect(severalSessionsRefused(req('POST', { cookie: two, 'x-oc-tab-session': 't' }))).toBe(false);
        expect(
            severalSessionsRefused(req('POST', { cookie: two, 'sec-fetch-site': 'cross-site' }), { developing: false })
        ).toBe(false);
    });
});

describe('answerSeveralSessions', () => {
    const answer = (host: string, url = '/api/checkout') => {
        const { res, out } = recorder();
        answerSeveralSessions({ method: 'POST', url, headers: { host } } as unknown as NextApiRequest, res);
        return out;
    };

    it('answers 401 several_sessions, never cached, and clears the strays at the auth host domain', () => {
        const out = answer('vault.ochk.io');
        expect(out.status).toBe(401);
        expect(out.body).toEqual({ ok: false, reason: 'several_sessions' });
        expect(out.headers['cache-control']).toBe('no-store, private');
        expect(paths(out.headers['set-cookie'] as string[])).toEqual(
            paths(strayCookieClears('/api/checkout', 'ochk.io'))
        );
    });

    it('takes the domain from OC_AUTH_ISSUER, and clears only host-only cookies on a host outside it', () => {
        process.env.OC_AUTH_ISSUER = 'https://auth.example.test';
        expect(paths(answer('vault.auth.example.test:443').headers['set-cookie'] as string[])).toContain(
            'auth.example.test /api'
        );
        delete process.env.OC_AUTH_ISSUER;
        const preview = paths(answer('oc-vault-web-git-x.vercel.app').headers['set-cookie'] as string[]);
        expect(preview.filter((p) => !p.startsWith('host '))).toEqual([]);
        expect(preview).not.toContain('host /');
    });

    it('leaves the request sent again one cookie, which the reader then takes', async () => {
        const mine = await mint(keys, 'did:oc:mine');
        const stray = await mint(keys, 'did:oc:stray');
        const old = await mint(keys, 'did:oc:old');
        const browser = jar([
            { value: mine, domain: 'ochk.io', hostOnly: false, path: '/' },
            { value: stray, domain: 'ochk.io', hostOnly: false, path: '/api' },
            { value: old, domain: 'vault.ochk.io', hostOnly: true, path: '/' },
        ]);
        const reader = createSessionReader({ revocation: false });
        const post = () => ({
            method: 'POST',
            url: '/api/checkout',
            headers: {
                host: 'vault.ochk.io',
                'sec-fetch-site': 'same-origin',
                cookie: browser.cookieFor('vault.ochk.io', '/api/checkout'),
            },
        });

        const first = post();
        expect(first.headers.cookie.split('; ')).toHaveLength(3);
        expect(await reader.resolve(first)).toEqual({ ok: false, reason: 'several_sessions', tab: false });
        const { res, out } = recorder();
        answerSeveralSessions(first as unknown as NextApiRequest, res);
        browser.apply('vault.ochk.io', out.headers['set-cookie'] as string[]);

        const again = post();
        expect(again.headers.cookie).toBe(`oc_session=${mine}`);
        expect(await reader.resolve(again)).toMatchObject({ ok: true, session: { did_oc: 'did:oc:mine' } });
        expect(browser.cookieFor('ochk.io', '/')).toBe(`oc_session=${mine}`);
    });
});

describe('answersUnverified and SeveralSessions', () => {
    const req = { method: 'POST', url: '/api/x', headers: { host: 'chat.ochk.io' } } as unknown as NextApiRequest;

    it('answers it 401 several_sessions with the clears', async () => {
        const { res, out } = recorder();
        await answersUnverified(() => {
            throw new SeveralSessions();
        })(req, res);
        expect(out.status).toBe(401);
        expect(out.body).toEqual({ ok: false, reason: 'several_sessions' });
        expect(paths(out.headers['set-cookie'] as string[])).toContain('ochk.io /api');
    });

    it('lets it out once the route has started its answer, and lets a lookalike out', async () => {
        const { res } = recorder();
        const err = new SeveralSessions();
        await expect(answersUnverified(() => Promise.reject(err))(req, Object.assign(res, { headersSent: true }))).rejects.toBe(
            err
        );
        const lookalike = Object.assign(new Error('several_sessions'), { name: 'SeveralSessions' });
        const fresh = recorder();
        await expect(answersUnverified(() => Promise.reject(lookalike))(req, fresh.res)).rejects.toBe(lookalike);
    });

    it('is exported from the auth entry a site imports', () => {
        expect(entry.SeveralSessions).toBe(SeveralSessions);
        expect(entry.answerSeveralSessions).toBe(answerSeveralSessions);
        expect(entry.severalSessionsRefused).toBe(severalSessionsRefused);
        expect(entry.strayCookieClears).toBe(strayCookieClears);
    });
});
