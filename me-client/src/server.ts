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
    integratorRevocationCheck,
    readBondClaim,
    verifyOcToken,
    type BondClaim,
    type RevocationCheck,
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

export interface OcSessionOptions extends VerifyOcOptions {
    /**
     * The request's method. While me.ochk.io's list of ended sessions can't be
     * read, reads go on and writes are refused; with no method, a request
     * counts as a write. The adapters pass it for you.
     */
    method?: string;
    /** Your project key. Default `OC_PROJECT_KEY`. */
    projectKey?: string;
    /**
     * Where me.ochk.io is: the project's sign-in rule and its list of ended
     * sessions are read there. Default https://me.ochk.io (`OC_ME_ORIGIN` for
     * the list).
     */
    meOrigin?: string;
    /**
     * The check for sessions the person ended everywhere (sign out
     * everywhere, a passkey removed, the account deleted). Default:
     * auth-core's `integratorRevocationCheck`, from `OC_PROJECT_KEY` and
     * `OC_SIGNING_SECRET`; none when they are unset. `false` turns it off.
     */
    revocation?: RevocationCheck | false;
}

/** One check per me.ochk.io and project key, shared by every request in this process. */
const sessionChecks = new Map<string, RevocationCheck | null>();
let warnedUnchecked = false;

function revocationFor(options: OcSessionOptions): RevocationCheck | null {
    if (options.revocation === false) return null;
    if (options.revocation) return options.revocation;
    const key = `${options.meOrigin ?? ''} ${options.projectKey ?? ''}`;
    if (!sessionChecks.has(key)) {
        sessionChecks.set(
            key,
            integratorRevocationCheck({
                ...(options.projectKey ? { projectKey: options.projectKey } : {}),
                ...(options.meOrigin ? { meOrigin: options.meOrigin } : {}),
            })
        );
    }
    const check = sessionChecks.get(key)!;
    const production = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
    if (!check && !warnedUnchecked && production) {
        warnedUnchecked = true;
        console.warn(
            '[@orangecheck/me-client] sessions are checked by signature only, so one the person ended ' +
                'everywhere stays valid here until it expires. Set OC_PROJECT_KEY and OC_SIGNING_SECRET ' +
                'to refuse it.'
        );
    }
    return check;
}

/** Tests only: forget the per-project checks and the one-time warning. */
export function _resetSessionChecksForTests(): void {
    sessionChecks.clear();
    warnedUnchecked = false;
}

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
 * A session the person ended everywhere is refused once `OC_PROJECT_KEY` and
 * `OC_SIGNING_SECRET` are set (see {@link OcSessionOptions.revocation}).
 *
 * Returns `null` for unauthenticated requests. Never throws.
 */
export async function getOcSession(
    headers: SessionRequestHeaders | Headers,
    options: OcSessionOptions = {}
): Promise<SessionPayload | null> {
    const checked = await checkOcSession(headers, options);
    return checked.status === 'signed_in' ? checked.session : null;
}

/** A request's session: signed in, signed out, or not checkable right now. */
export type OcSessionCheck =
    | { status: 'signed_in'; session: SessionPayload }
    | { status: 'signed_out' }
    | { status: 'unavailable' };

/**
 * `getOcSession`, telling "signed out" from "can't tell right now":
 * `unavailable` when the token verifies but me.ochk.io's list of ended
 * sessions can't vouch for this request (a write while the list can't be read).
 * A token the person ended is `signed_out`. The adapters answer `unavailable`
 * with 503 `revocations_unavailable`, so a client retries instead of signing
 * the person out.
 */
export async function checkOcSession(
    headers: SessionRequestHeaders | Headers,
    options: OcSessionOptions = {}
): Promise<OcSessionCheck> {
    const session = await getOcSessionCore(headers, options);
    if (!session) {
        if (options.audience === undefined) warnIfAudienceMissing(headers);
        return { status: 'signed_out' };
    }
    const check = revocationFor(options);
    if (check && (await check.refuses(session, options.method))) {
        return (await check.status(session)) === 'revoked'
            ? { status: 'signed_out' }
            : { status: 'unavailable' };
    }
    return { status: 'signed_in', session };
}

const UNAVAILABLE = { status: 503, body: { ok: false, reason: 'revocations_unavailable' } };

let warnedAudience = false;

/**
 * The popup issues a token bound to your site's origin. Verified with no
 * `audience`, it is refused — correctly, since a verifier with no audience
 * accepts only family sessions — and every popup sign-in would 401 with no
 * clue why. Say so, once, the first time it happens.
 */
function warnIfAudienceMissing(headers: SessionRequestHeaders | Headers): void {
    if (warnedAudience) return;
    const web = typeof Headers !== 'undefined' && headers instanceof Headers;
    const auth = web ? headers.get('authorization') : (headers as SessionRequestHeaders).authorization;
    const cookie = web ? headers.get('cookie') : (headers as SessionRequestHeaders).cookie;
    // The token arrives as a Bearer, or in the oc_session cookie your own route set.
    const bearer = typeof auth === 'string' ? /^Bearer\s+(\S+)$/i.exec(auth.trim())?.[1] : undefined;
    const fromCookie =
        typeof cookie === 'string' ? /(?:^|;\s*)oc_session=([^;]+)/.exec(cookie)?.[1] : undefined;
    const m = /^([^.]+)\.([^.]+)\./.exec(bearer ?? fromCookie ?? '');
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
    method?: string;
    headers: { cookie?: string; authorization?: string; [k: string]: unknown };
    ocSession?: SessionPayload | null;
}
interface NextApiResponseLike {
    status(code: number): NextApiResponseLike;
    json(body: unknown): unknown;
    setHeader(name: string, value: string | number | readonly string[]): unknown;
}
/** A request with the verified session attached: `WithOcSession<NextApiRequest>`. */
export type WithOcSession<Req> = Req & { ocSession?: SessionPayload | null };

export interface WithOcAuthOptions extends OcSessionOptions {
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
     * ("who can sign in") is read from me.ochk.io within a minute of a change
     * and holds every signed-in account like `requireBond`, so you change it
     * there, not in code. A request with no session is not held to it and never
     * waits on reading it: pass `required` to answer it 401. An explicit
     * `requireBond` wins over it. Default `OC_PROJECT_KEY` for the ended-session
     * check only.
     */
    projectKey?: string;
}

type BondNeed = NonNullable<WithOcAuthOptions['requireBond']>;
/** Where someone turned away for want of backing can back their account. */
export const BACK_ACCOUNT_URL = 'https://ochk.app/me/account#backing';
/** Keys me.ochk.io answered 404 for, and when; re-checked after a minute. */
const unknownKeys = new Map<string, number>();
const UNKNOWN_PROJECT = Symbol('unknown_project');
const POLICY_TTL_MS = 60_000;
/** After a failed read, how long before me.ochk.io is asked again. */
const POLICY_RETRY_MS = 10_000;
/** How long the last rule read stands while it can't be read again. */
const POLICY_MAX_STALE_MS = 600_000;
const policies = new Map<string, { at: number; need: BondNeed | null; failedAt?: number }>();

const isFloor = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;

/** The rule in me.ochk.io's answer, or undefined when the answer does not say one. */
function readRequirement(body: unknown): BondNeed | null | undefined {
    const b = body as { ok?: unknown; require_bond?: unknown } | null;
    if (!b || typeof b !== 'object' || b.ok !== true || !('require_bond' in b)) return undefined;
    if (b.require_bond === null) return null;
    const r = b.require_bond as { min_sats?: unknown; min_days?: unknown } | undefined;
    if (!r || typeof r !== 'object' || !isFloor(r.min_sats) || !isFloor(r.min_days)) return undefined;
    return { minSats: r.min_sats, minDays: r.min_days };
}

/**
 * The project's requirement, from its uncached sign-in endpoint, held a
 * minute here. (The price config is edge-cached for ten minutes: reading the
 * requirement there let a just-tightened app keep admitting unbacked accounts.)
 * When it can't be read, or the answer does not say it, the last one read
 * stands for ten minutes, and the next try waits ten seconds so an outage
 * doesn't hold every request; with none read in that time it is `undefined`,
 * and the request is refused rather than let through unchecked.
 */
async function projectRequirement(
    options: WithOcAuthOptions
): Promise<BondNeed | null | undefined | typeof UNKNOWN_PROJECT> {
    const base = (options.meOrigin ?? 'https://me.ochk.io').replace(/\/$/, '');
    const key = options.projectKey!;
    const slot = `${base} ${key}`;
    const hit = policies.get(slot);
    const now = Date.now();
    const standing = () => (hit?.at && now - hit.at < POLICY_MAX_STALE_MS ? hit.need : undefined);
    if (unknownKeys.has(slot) && now - unknownKeys.get(slot)! < POLICY_TTL_MS) return UNKNOWN_PROJECT;
    if (hit && now - hit.at < POLICY_TTL_MS) return hit.need;
    if (hit?.failedAt && now - hit.failedAt < POLICY_RETRY_MS) return standing();
    try {
        const r = await fetch(`${base}/api/integrator/${encodeURIComponent(key)}/sign-in`, {
            signal: AbortSignal.timeout(4000),
        });
        // A key that names no project is a setup mistake, not an outage: say so once.
        if (r.status === 404) {
            if (!unknownKeys.has(slot)) {
                console.error(
                    `[@orangecheck/me-client] projectKey "${key}" is not a project. Copy yours from https://ochk.app/me/projects.`
                );
            }
            unknownKeys.set(slot, Date.now());
            return UNKNOWN_PROJECT;
        }
        unknownKeys.delete(slot);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const need = readRequirement(await r.json());
        if (need === undefined) throw new Error('unexpected body');
        policies.set(slot, { at: Date.now(), need });
        return need;
    } catch {
        policies.set(slot, { at: hit?.at ?? 0, need: hit?.need ?? null, failedAt: Date.now() });
        return standing();
    }
}

/** The requirement in force: explicit, else the project's, else none. */
async function bondNeed(
    options: WithOcAuthOptions
): Promise<BondNeed | null | undefined | typeof UNKNOWN_PROJECT> {
    if (options.requireBond) return options.requireBond;
    if (options.projectKey) return projectRequirement(options);
    return null;
}

/** Why a session can't pass, as a status and body, or null when it can. */
async function refusal(
    session: SessionPayload | null,
    options: WithOcAuthOptions
): Promise<{ status: number; body: Record<string, unknown> } | null> {
    if (!session && options.required) {
        return { status: 401, body: { ok: false, reason: 'unauthenticated' } };
    }
    // The project's rule is about who signs in: a request with no session is not
    // held to it, so it never waits on reading it.
    if (!session && !options.requireBond) return null;
    const need = await bondNeed(options);
    if (need === UNKNOWN_PROJECT) {
        return { status: 500, body: { ok: false, reason: 'unknown_project_key' } };
    }
    if (need === undefined) {
        return { status: 503, body: { ok: false, reason: 'bond_policy_unavailable' } };
    }
    if (!session) {
        return need ? { status: 401, body: { ok: false, reason: 'unauthenticated' } } : null;
    }
    if (need && !bondMeets(session, need)) {
        const have = readBondClaim(session);
        return {
            status: 403,
            body: {
                ok: false,
                reason: 'bond_required',
                need: {
                    min_sats: need.minSats ?? 0,
                    min_days: need.minDays ?? 0,
                    ...(need.maxAgeSecs !== undefined ? { max_age_secs: need.maxAgeSecs } : {}),
                },
                have: have ? { sats_floor: have.sats_floor, days_floor: have.days_floor } : null,
                back_url: BACK_ACCOUNT_URL,
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
export function withOcAuth<
    Req extends NextApiRequestLike = NextApiRequestLike,
    Res extends NextApiResponseLike = NextApiResponseLike,
>(
    handler: (req: WithOcSession<Req>, res: Res) => unknown,
    options: WithOcAuthOptions = {}
): (req: Req, res: Res) => Promise<unknown> {
    return async (req: Req, res: Res) => {
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Vary', 'Cookie, Authorization');
        const checked = await checkOcSession(
            {
                cookie: typeof req.headers.cookie === 'string' ? req.headers.cookie : null,
                authorization:
                    typeof req.headers.authorization === 'string'
                        ? req.headers.authorization
                        : null,
            },
            { ...options, method: req.method }
        );
        const session = checked.status === 'signed_in' ? checked.session : null;
        const withSession = req as WithOcSession<Req>;
        withSession.ocSession = session;
        const refused = checked.status === 'unavailable' ? UNAVAILABLE : await refusal(session, options);
        if (refused) return res.status(refused.status).json(refused.body);
        return handler(withSession, res);
    };
}

// ─── Express / Connect middleware ────────────────────────────────────────

// `req.ocSession` on Express's own Request type, so `ocAuthExpress()` routes
// type-check without a cast. Inert when @types/express is absent.
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            ocSession?: SessionPayload | null;
        }
    }
}

/** Hono env for `ocAuthHono()`: `new Hono<OcHonoEnv>()` types `c.get('ocSession')`. */
export type OcHonoEnv = { Variables: { ocSession: SessionPayload | null } };

interface ExpressRequestLike {
    method?: string;
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
            const checked = await checkOcSession(
                {
                    cookie: typeof req.headers.cookie === 'string' ? req.headers.cookie : null,
                    authorization:
                        typeof req.headers.authorization === 'string'
                            ? req.headers.authorization
                            : null,
                },
                { ...options, method: req.method }
            );
            const session = checked.status === 'signed_in' ? checked.session : null;
            req.ocSession = session;
            const refused =
                checked.status === 'unavailable' ? UNAVAILABLE : await refusal(session, options);
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
    req: { raw: { headers: Headers; method?: string } };
    set(key: string, value: unknown): void;
    json(body: unknown, status?: number): unknown;
    header(name: string, value: string): void;
}
type HonoNextLike = () => Promise<void>;

/**
 * Hono middleware. Attaches the verified session at `c.get('ocSession')`.
 *
 *   import { Hono } from 'hono';
 *   import { ocAuthHono, type OcHonoEnv } from '@orangecheck/me-client/server';
 *
 *   const app = new Hono<OcHonoEnv>();
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
        const checked = await checkOcSession(c.req.raw.headers, {
            ...options,
            method: c.req.raw.method,
        });
        const session = checked.status === 'signed_in' ? checked.session : null;
        c.set('ocSession', session);
        const refused =
            checked.status === 'unavailable' ? UNAVAILABLE : await refusal(session, options);
        if (refused) return c.json(refused.body, refused.status);
        await next();
    };
}
