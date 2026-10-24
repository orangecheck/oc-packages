/**
 * Where did this request come from, and may a COOKIE session authenticate it?
 *
 * `oc_session` is `SameSite=None; Secure`, so a sibling's in-place sign-in can
 * make a credentialed cross-origin call to the auth host. The cost: the browser
 * attaches it to cross-site requests too, including a plain HTML form POST,
 * which needs no preflight. This gate is the compensating control the auth host
 * names: an unsafe method from a cross-site or silent caller gets no cookie
 * session, and a same-site caller only from a listed family site.
 */

import { FAMILY_ORIGINS, isFamilyOrigin } from '@orangecheck/auth-core/family-origins';

/** The family sites, and the check against them, as `@orangecheck/auth-core/family-origins` keeps them. */
export { FAMILY_ORIGINS, isFamilyOrigin };

/** The minimal request shape read here; structural so narrower request types fit. */
export interface OriginBearingRequest {
    method?: string | undefined;
    headers: Record<string, string | string[] | undefined>;
}

export type RequestOriginClass = 'same-origin' | 'same-site' | 'cross-site' | 'unknown';

/** Safe methods change nothing; every SSR page load from a link is a cross-site GET. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * `Sec-Fetch-Site` first: browsers send it and page script cannot set it.
 * `Origin` against `Host` is the fallback. An unrecognised value is cross-site.
 */
export function classifyRequestOrigin(req: OriginBearingRequest): RequestOriginClass {
    const secFetchSite = req.headers['sec-fetch-site'];
    if (typeof secFetchSite === 'string') {
        if (secFetchSite === 'same-origin') return 'same-origin';
        if (secFetchSite === 'same-site') return 'same-site';
        return 'cross-site';
    }
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (typeof origin === 'string' && typeof host === 'string') {
        try {
            return new URL(origin).host === host ? 'same-origin' : 'cross-site';
        } catch {
            return 'cross-site';
        }
    }
    return 'unknown';
}

/**
 * Should a cookie-borne session be refused for this request? True for an
 * unsafe method from a cross-site or silent caller, or from a same-site name
 * that is not a listed family site.
 */
export function refuseCookieSession(req: OriginBearingRequest, opts: { developing?: boolean } = {}): boolean {
    if (SAFE_METHODS.has(req.method ?? 'GET')) return false;
    const c = classifyRequestOrigin(req);
    if (c === 'same-origin') return false;
    if (c === 'same-site') {
        const origin = req.headers.origin;
        return !isFamilyOrigin(typeof origin === 'string' ? origin : undefined, opts.developing);
    }
    return true;
}
