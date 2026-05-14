/**
 * @orangecheck/me-client/server
 *
 * Server-side verification helpers for OC integrators.
 *
 *   import {
 *     withOcAuth,
 *     getOcSession,
 *     verifyOcToken,
 *     verifyActivityAttestation,
 *   } from '@orangecheck/me-client/server';
 *
 * Zero env vars, zero JWK handling. Internally lazy-fetches the auth
 * host's JWKS at https://ochk.io/.well-known/jwks.json and the
 * envelope JWKS at https://me.ochk.io/.well-known/oc-envelope-jwks.json,
 * caches both in-process. Integrators write code; we handle the crypto.
 *
 * Three layers of session verification, smallest to thickest:
 *
 *   verifyOcToken(token)       → SessionPayload | null
 *   getOcSession(headers)      → SessionPayload | null   (cookie OR Bearer)
 *   withOcAuth(handler)        → Next.js Pages adapter that injects
 *                                req.ocSession on the request object
 *   ocAuthExpress(opts?)       → Express / Connect middleware
 *   ocAuthHono(opts?)          → Hono middleware
 *
 * Plus the activity-attestation verifier · for sybil-resistance gating:
 *
 *   verifyActivityAttestation(bundle, opts?) → ActivityVerifyResult
 *
 * Same envelope-JWKS verification posture as the public /verify-activity
 * page; same five checks (shape / id / kid / sig / freshness). Use to
 * gate sensitive flows on cross-integrator lifetime_sats + duration +
 * distinct_count + active_days · all values are content-addressed and
 * signed.
 *
 * All thin wrappers around the same crypto primitives. Bring your own
 * framework.
 */

import {
    getOcSession as getOcSessionCore,
    verifyOcToken,
    type SessionPayload,
    type VerifyOcOptions,
    type SessionRequestHeaders,
} from '@orangecheck/auth-core';

export { verifyOcToken };
export type { SessionPayload, VerifyOcOptions };

// Activity-attestation verifier · re-export from the identity module so
// server-side integrators get the gating helper alongside session
// verification without a second import path.
export {
    identity,
    verifyActivityAttestation,
    refreshEnvelopeJwks,
} from './identity';
export type {
    ActivityAttestation,
    ActivityAttestationBundle,
    ActivityVerifyCheck,
    ActivityVerifyResult,
    VerifyActivityOptions,
} from './identity';

/**
 * Verify the OC session for a request. Accepts either:
 *
 *   - A Web Headers object (Hono / edge / Fetch API): `c.req.raw.headers`
 *   - A plain `{ cookie, authorization }` object (Express / Next.js Pages /
 *     Fastify / etc.): `{ cookie: req.headers.cookie, authorization: req.headers.authorization }`
 *
 * Reads the `oc_session` cookie first; falls back to
 * `Authorization: Bearer <token>` so cross-domain integrators (no
 * .ochk.io cookie reach) verify the same way.
 *
 * Returns `null` for unauthenticated requests. Never throws.
 */
export async function getOcSession(
    headers: SessionRequestHeaders | Headers,
    options: VerifyOcOptions = {}
): Promise<SessionPayload | null> {
    return getOcSessionCore(headers, options);
}

// ─── Next.js Pages Router adapter ────────────────────────────────────────

interface NextApiRequestLike {
    headers: { cookie?: string; authorization?: string; [k: string]: unknown };
    ocSession?: SessionPayload | null;
}
interface NextApiResponseLike {
    status(code: number): NextApiResponseLike;
    json(body: unknown): unknown;
    setHeader(name: string, value: string | number | readonly string[]): unknown;
}
type NextApiHandlerLike = (req: NextApiRequestLike, res: NextApiResponseLike) => unknown | Promise<unknown>;

export interface WithOcAuthOptions extends VerifyOcOptions {
    /** When true, unauthenticated requests get a 401 + `{ok:false}` response
     *  before the wrapped handler runs. Default: false — handler runs and
     *  receives `req.ocSession === null`, useful when the route serves both
     *  signed-in and anonymous users. */
    required?: boolean;
}

/**
 * Wrap a Next.js Pages-Router API route handler. Adds `req.ocSession` —
 * the verified SessionPayload, or null when unauthenticated.
 *
 *   // pages/api/me/profile.ts
 *   import { withOcAuth } from '@orangecheck/me-client/server';
 *
 *   export default withOcAuth(async (req, res) => {
 *     if (!req.ocSession) return res.status(401).json({ ok: false });
 *     res.status(200).json({ account: { address: req.ocSession.did_oc } });
 *   }, { required: true });
 *
 * `Cache-Control: no-store, private` and `Vary: Cookie, Authorization`
 * are set on every authenticated response — without them a cached 401
 * leaks anonymous to authenticated callers.
 */
export function withOcAuth<T extends NextApiHandlerLike>(
    handler: T,
    options: WithOcAuthOptions = {}
): T {
    const wrapped = async (req: NextApiRequestLike, res: NextApiResponseLike) => {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Vary', 'Cookie, Authorization');
        const session = await getOcSession(
            {
                cookie: typeof req.headers.cookie === 'string' ? req.headers.cookie : null,
                authorization:
                    typeof req.headers.authorization === 'string'
                        ? req.headers.authorization
                        : null,
            },
            options
        );
        req.ocSession = session;
        if (options.required && !session) {
            return res.status(401).json({ ok: false, reason: 'unauthenticated' });
        }
        return handler(req, res);
    };
    return wrapped as unknown as T;
}

// ─── Express / Connect middleware ────────────────────────────────────────

interface ExpressRequestLike {
    headers: { cookie?: string; authorization?: string; [k: string]: unknown };
    ocSession?: SessionPayload | null;
}
interface ExpressResponseLike {
    status(code: number): ExpressResponseLike;
    json(body: unknown): unknown;
    setHeader(name: string, value: string | number | readonly string[]): unknown;
}
type ExpressNextLike = (err?: unknown) => void;

/**
 * Express / Connect middleware. Attaches `req.ocSession` (verified
 * SessionPayload | null) and calls next(). Use it as a global middleware
 * or per-route.
 *
 *   import express from 'express';
 *   import { ocAuthExpress } from '@orangecheck/me-client/server';
 *
 *   const app = express();
 *   app.use(ocAuthExpress());
 *
 *   app.get('/api/profile', (req, res) => {
 *     if (!req.ocSession) return res.status(401).json({ error: 'sign in' });
 *     res.json({ address: req.ocSession.did_oc });
 *   });
 *
 * Pass `{ required: true }` to short-circuit unauthenticated requests
 * with a 401 before they reach your handler.
 */
export function ocAuthExpress(options: WithOcAuthOptions = {}) {
    return async (req: ExpressRequestLike, res: ExpressResponseLike, next: ExpressNextLike) => {
        try {
            res.setHeader('Cache-Control', 'no-store, private');
            res.setHeader('Vary', 'Cookie, Authorization');
            const session = await getOcSession(
                {
                    cookie: typeof req.headers.cookie === 'string' ? req.headers.cookie : null,
                    authorization:
                        typeof req.headers.authorization === 'string'
                            ? req.headers.authorization
                            : null,
                },
                options
            );
            req.ocSession = session;
            if (options.required && !session) {
                res.status(401).json({ ok: false, reason: 'unauthenticated' });
                return;
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

// ─── Hono middleware ─────────────────────────────────────────────────────

interface HonoContextLike {
    req: { raw: { headers: Headers } };
    set(key: string, value: unknown): void;
    json(body: unknown, status?: number): unknown;
    header(name: string, value: string): void;
}
type HonoNextLike = () => Promise<void>;

/**
 * Hono middleware. Attaches the verified session at `c.get('ocSession')`.
 *
 *   import { Hono } from 'hono';
 *   import { ocAuthHono } from '@orangecheck/me-client/server';
 *
 *   const app = new Hono();
 *   app.use('*', ocAuthHono());
 *
 *   app.get('/api/profile', (c) => {
 *     const session = c.get('ocSession');
 *     if (!session) return c.json({ error: 'sign in' }, 401);
 *     return c.json({ address: session.did_oc });
 *   });
 */
export function ocAuthHono(options: WithOcAuthOptions = {}) {
    return async (c: HonoContextLike, next: HonoNextLike) => {
        c.header('Cache-Control', 'no-store, private');
        c.header('Vary', 'Cookie, Authorization');
        const session = await getOcSession(c.req.raw.headers, options);
        c.set('ocSession', session);
        if (options.required && !session) {
            return c.json({ ok: false, reason: 'unauthenticated' }, 401);
        }
        await next();
    };
}
