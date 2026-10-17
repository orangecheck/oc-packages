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
    bondMeets,
    getOcSession as getOcSessionCore,
    readBondClaim,
    verifyOcToken,
    type BondClaim,
    type SessionPayload,
    type VerifyOcOptions,
    type SessionRequestHeaders,
} from '@orangecheck/auth-core';

export { bondMeets, readBondClaim, verifyOcToken };
export type { BondClaim, SessionPayload, VerifyOcOptions };

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
    const session = await getOcSessionCore(headers, options);
    if (!session && options.audience === undefined) warnIfAudienceMissing(headers);
    return session;
}

let warnedAudience = false;

/**
 * The popup issues a token bound to your site's origin. Verified with no
 * `audience`, it is refused — correctly, since a verifier with no audience
 * accepts only family sessions — and every popup sign-in would 401 with no
 * clue why. Say so, once, the first time it happens.
 */
function warnIfAudienceMissing(headers: SessionRequestHeaders | Headers): void {
    if (warnedAudience) return;
    const auth =
        typeof Headers !== 'undefined' && headers instanceof Headers
            ? headers.get('authorization')
            : (headers as SessionRequestHeaders).authorization;
    const m = typeof auth === 'string' ? /^Bearer\s+([^.]+)\.([^.]+)\./i.exec(auth) : null;
    if (!m) return;
    try {
        const payload = JSON.parse(base64UrlToString(m[2]!)) as { aud?: unknown };
        if (payload.aud === undefined) return;
        warnedAudience = true;
        console.warn(
            `[@orangecheck/me-client] a sign-in token bound to ${JSON.stringify(payload.aud)} was refused ` +
                'because no `audience` is configured. Pass your site origin, e.g. ' +
                "withOcAuth(handler, { audience: 'https://your-site.example' })."
        );
    } catch {
        // Not a JWT we can read · nothing useful to say.
    }
}

function base64UrlToString(s: string): string {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'function') return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Buffer.from(s, 'base64url').toString('utf8');
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
    /**
     * Refuse a signed-in account (403, `reason: 'bond_required'`) unless a
     * bond backs it: one unspent coin of at least `minSats`, unspent at least
     * `minDays` days, checked within `maxAgeSecs`. The app never learns the
     * coin; `req.ocSession.oc_bond.nullifier` is the same for the same coin at
     * your site, so ban that to ban the coin. Implies `required`.
     */
    requireBond?: { minSats?: number; minDays?: number; maxAgeSecs?: number };
    /**
     * Your project key. The requirement you set in the project's settings
     * ("who can sign in") is read from its public config and enforced like
     * `requireBond`, so you change it there, not in code. An explicit
     * `requireBond` wins over it.
     */
    projectKey?: string;
    /** Where the project config is read. Default https://me.ochk.io. */
    meOrigin?: string;
}

type BondNeed = NonNullable<WithOcAuthOptions['requireBond']>;
const POLICY_TTL_MS = 5 * 60_000;
const policies = new Map<string, { at: number; need: BondNeed | null }>();

/**
 * The project's published requirement, cached five minutes. When the config
 * can't be read, the last one read stands; with none read yet it is
 * `undefined`, and the request is refused rather than let through unchecked.
 */
async function projectRequirement(options: WithOcAuthOptions): Promise<BondNeed | null | undefined> {
    const key = options.projectKey!;
    const hit = policies.get(key);
    if (hit && Date.now() - hit.at < POLICY_TTL_MS) return hit.need;
    try {
        const base = options.meOrigin ?? 'https://me.ochk.io';
        const r = await fetch(`${base}/api/integrator/config?project_key=${encodeURIComponent(key)}`, {
            signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as {
            config?: { require_bond?: { min_sats: number; min_days: number } | null };
        };
        const req = j.config?.require_bond ?? null;
        const need = req ? { minSats: req.min_sats, minDays: req.min_days } : null;
        policies.set(key, { at: Date.now(), need });
        return need;
    } catch {
        return hit?.need;
    }
}

/** The requirement in force: explicit, else the project's, else none. */
async function bondNeed(options: WithOcAuthOptions): Promise<BondNeed | null | undefined> {
    if (options.requireBond) return options.requireBond;
    if (options.projectKey) return projectRequirement(options);
    return null;
}

/** Why a session can't pass, as a status and body, or null when it can. */
async function refusal(
    session: SessionPayload | null,
    options: WithOcAuthOptions
): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const need = await bondNeed(options);
    if (!session) {
        return options.required || need !== null
            ? { status: 401, body: { ok: false, reason: 'unauthenticated' } }
            : null;
    }
    if (need === undefined) {
        return { status: 503, body: { ok: false, reason: 'bond_policy_unavailable' } };
    }
    if (need && !bondMeets(session, need)) {
        const have = readBondClaim(session);
        return {
            status: 403,
            body: {
                ok: false,
                reason: 'bond_required',
                need,
                have: have ? { sats_floor: have.sats_floor, days_floor: have.days_floor } : null,
            },
        };
    }
    return null;
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
 *   }, { required: true, audience: 'https://your-site.example' });
 *
 * `audience` is your own origin. The sign-in popup issues each site a token
 * bound to it; a site on *.ochk.io that reads the family cookie omits it.
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
        const refused = await refusal(session, options);
        if (refused) return res.status(refused.status).json(refused.body);
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
            const refused = await refusal(session, options);
            if (refused) {
                res.status(refused.status).json(refused.body);
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
        const refused = await refusal(session, options);
        if (refused) return c.json(refused.body, refused.status);
        await next();
    };
}
