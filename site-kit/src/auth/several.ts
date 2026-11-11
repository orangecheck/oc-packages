import { cookiePickRefused, serializeSessionCookie } from '@orangecheck/auth-core';
import type { NextApiRequest, NextApiResponse } from 'next';

import { refuseCookieSession, type OriginBearingRequest } from './origin';

/**
 * A site's session reader throws this when a state change carries several
 * `oc_session` cookies and no per-tab token, so the route answers 401
 * `several_sessions` through `answersUnverified` and clears the strays.
 */
export class SeveralSessions extends Error {
    constructor() {
        super('several_sessions');
        this.name = 'SeveralSessions';
    }
}

/**
 * True when an allowed state change carries several `oc_session` cookies and
 * no per-tab token: the browser's cookie order would choose the account, so
 * no reader takes one. A caller the origin gate refuses is not counted here.
 */
export function severalSessionsRefused(req: OriginBearingRequest, opts: { developing?: boolean } = {}): boolean {
    return !refuseCookieSession(req, opts) && cookiePickRefused(req.method, req.headers);
}

/** One `oc_session` clear, with the attributes the auth host sets the cookie with. */
function clearAt(at: { domain?: string; path: string }): string {
    const secure = process.env.NODE_ENV === 'production';
    return serializeSessionCookie('', {
        ...at,
        secure,
        sameSite: secure ? 'None' : 'Lax',
        maxAge: 0,
        expires: new Date(0),
    });
}

/** An RFC 6265 path-value: any CHAR but the controls and ';'. */
const COOKIE_PATH = /^[\x20-\x3a\x3c-\x7e]+$/;

/**
 * Clears for every `oc_session` a request to `url` could have carried besides
 * the one at `domain` and `/`. A browser sends a cookie only if it is
 * host-only or set for a domain the host sits under, and only if its Path
 * prefixes the request's path at a `/` boundary (RFC 6265 5.1.3, 5.1.4). So
 * this clears host-only cookies at every such prefix, and `domain` cookies at
 * every one but `/`. Without a `domain`, only host-only cookies below `/`.
 */
export function strayCookieClears(url: string | undefined, domain?: string): string[] {
    const path = new URL(url ?? '/', 'https://x.invalid').pathname;
    const out: string[] = [];
    for (let i = 1; i <= path.length; i++) {
        const at = path.slice(0, i);
        if (!(i === path.length || at.endsWith('/') || path[i] === '/')) continue;
        // No cookie can be set at a path holding a control or ';', and a ';' would add attributes here.
        if (!COOKIE_PATH.test(at)) break;
        if (domain || at !== '/') out.push(clearAt({ path: at }));
        if (domain && at !== '/') out.push(clearAt({ domain, path: at }));
    }
    return out;
}

/** The auth host's name when this request's host is it or sits under it, from `OC_AUTH_ISSUER` (default ochk.io). */
function sessionCookieDomain(req: OriginBearingRequest): string | undefined {
    const issuer = new URL(process.env.OC_AUTH_ISSUER ?? 'https://ochk.io').hostname;
    const raw = req.headers.host;
    const host = (Array.isArray(raw) ? raw[0] : raw)?.split(':')[0]?.toLowerCase();
    if (!host) return undefined;
    return host === issuer || host.endsWith(`.${issuer}`) ? issuer : undefined;
}

/**
 * 401 `{ ok: false, reason: 'several_sessions' }`, never cached, with a clear
 * for every stray `oc_session` this request's path carried. The cookie at the
 * auth host's domain and `/` stays, so the person is still signed in, and the
 * same request sent again carries that one cookie.
 */
export function answerSeveralSessions(req: NextApiRequest, res: NextApiResponse): void {
    res.setHeader('Set-Cookie', strayCookieClears(req.url, sessionCookieDomain(req)));
    res.setHeader('Cache-Control', 'no-store, private');
    res.status(401).json({ ok: false, reason: 'several_sessions' });
}
