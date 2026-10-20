import {
    familyRevocationCheck,
    resolveSessionFromRequest,
    type RevocationCheck,
    type SessionPayload,
} from '@orangecheck/auth-core';

import { refuseCookieSession, type OriginBearingRequest } from './origin';

export type { SessionPayload };

export type SessionResult =
    | { ok: true; session: SessionPayload; via: 'tab' | 'cookie' }
    | {
          ok: false;
          /**
           * `no_session` · nothing presented. `tab_invalid` · a per-tab token
           * that does not verify (auth-core never falls back to the cookie).
           * `refused` · an unsafe method from a caller the origin gate refuses.
           * `revoked` · a valid token the auth host has ended (signed out,
           * replaced, its account cut off or deleted), or one `isRevoked` names.
           * `unverified` · an unsafe method while the revocation feed is too
           * stale to vouch for the token. Reads still pass.
           */
          reason: 'no_session' | 'tab_invalid' | 'refused' | 'revoked' | 'unverified';
          /** True when the request carried a per-tab token. */
          tab: boolean;
      };

export interface SessionReaderOptions {
    /**
     * The family revocation check: the auth host's list of ended sessions,
     * fetched at most once a minute. Default auth-core's
     * `familyRevocationCheck()`, which reads `OC_REVOCATION_FEED_TOKEN`.
     * `false` turns it off; only a test has a reason to.
     */
    revocation?: RevocationCheck | false;
    /**
     * The site's own record of ended sessions or deleted accounts, checked
     * after the family one. Takes the whole verified payload; a hit signs the
     * caller out.
     */
    isRevoked?: (session: SessionPayload) => boolean | Promise<boolean>;
    /** Passed to the origin gate. Default: true unless NODE_ENV is production. */
    developing?: boolean;
}

export interface SessionReader {
    /** The effective session and, when there is none, why. */
    resolve(req: OriginBearingRequest): Promise<SessionResult>;
    /** The effective session, or null. */
    read(req: OriginBearingRequest): Promise<SessionPayload | null>;
}

function verifyConfig() {
    const publicJwk = process.env.OC_AUTH_PUBLIC_JWK?.trim();
    if (!publicJwk) {
        throw new Error('OC_AUTH_PUBLIC_JWK is not set; this site cannot verify oc_session cookies.');
    }
    // auth-core reads base64url. Raw JSON fails every verification without a symptom.
    if (publicJwk.startsWith('{')) {
        throw new Error('OC_AUTH_PUBLIC_JWK holds raw JSON; it must be the base64url-encoded JWK.');
    }
    return { publicJwk, issuer: process.env.OC_AUTH_ISSUER ?? 'https://ochk.io' };
}

/** auth-core's TAB_SESSION_HEADER; a wire name, so it cannot change. */
const TAB_SESSION_HEADER = 'x-oc-tab-session';

const hasTabToken = (req: OriginBearingRequest) => {
    const raw = req.headers[TAB_SESSION_HEADER];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && v.length > 0;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Reads the per-tab `x-oc-tab-session` header first, then every `oc_session`
 * cookie in the jar (browsers send duplicates from different Domains), with
 * the origin gate in front: a cross-site unsafe request gets no session at all.
 * A token that verifies is then checked against the auth host's ended
 * sessions, so a signed-out one stops working here within a minute.
 */
export function createSessionReader(opts: SessionReaderOptions = {}): SessionReader {
    async function resolve(req: OriginBearingRequest): Promise<SessionResult> {
        const tab = hasTabToken(req);
        if (refuseCookieSession(req, { developing: opts.developing })) return { ok: false, reason: 'refused', tab };
        const r = await resolveSessionFromRequest(req.headers, verifyConfig());
        if (!r.ok) return { ok: false, reason: r.reason, tab };
        const revocation = opts.revocation ?? familyRevocationCheck();
        if (revocation) {
            const status = await revocation.status(r.payload);
            if (status === 'revoked') return { ok: false, reason: 'revoked', tab };
            if (status === 'unverified' && !SAFE_METHODS.has((req.method ?? '').toUpperCase())) {
                return { ok: false, reason: 'unverified', tab };
            }
        }
        if (opts.isRevoked && (await opts.isRevoked(r.payload))) {
            return { ok: false, reason: 'revoked', tab };
        }
        return { ok: true, session: r.payload, via: r.via };
    }
    return {
        resolve,
        read: async (req) => {
            const r = await resolve(req);
            return r.ok ? r.session : null;
        },
    };
}
