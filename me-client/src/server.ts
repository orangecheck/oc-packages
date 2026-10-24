/**
 * Server-side helpers: verify a sign-in token (`checkOcToken`,
 * `verifyOcToken`), check a request's session (`checkOcSession`, `withOcAuth`,
 * `ocAuthExpress`, `ocAuthHono`), end a token (`revokeToken`), spend one once
 * (`spendOnce`), and the Connect calls. The rest of the client is in
 * [`@orangecheck/me-client`](/sdk/me-client/README), and the popup in
 * [`@orangecheck/me-client/popup`](/sdk/me-client/popup/README).
 *
 * @packageDocumentation
 */

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
 * OC Connect, for a site that keeps its own login (ochk.io/docs/connect):
 *
 *   connectProvision({ apiKey, userId, consent? }) → { ok, did_oc, is_new }
 *   connectClaimLink({ apiKey, userId })           → { ok, url, expires_at }
 *   connectDelete({ apiKey, userId })              → { ok, result }
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
    checkOcToken as checkOcTokenCore,
    familyRevocationCheck,
    integratorRevocationCheck,
    readBondClaim,
    readOcSessionToken,
    SAFE_METHODS,
    verifyOcToken as verifyOcTokenCore,
    type BondClaim,
    type RevocationCheck,
    type SessionPayload,
    type VerifyOcOptions,
    type SessionRequestHeaders,
} from '@orangecheck/auth-core';

export { bondMeets, readBondClaim };
export type { BondClaim, SessionPayload, VerifyOcOptions };

/** Why a token that verified is still not a session here. */
export type OcSessionRefusal = 'no_session_handle';

export interface VerifyOcTokenOptions extends VerifyOcOptions {
    /**
     * Refuse a token bound to your site (one with `aud`) that carries no `rh`,
     * its handle on your project's list of ended sessions. Without it "sign out
     * everywhere" can't reach the session, so it is refused by default.
     * Every token ochk.app's sign-in popup issues carries one; `false` accepts
     * one minted some other way, and then sign out everywhere does not end it.
     * A family session (no `aud`, on *.ochk.io) is not held to this: the
     * family's own feed ends it. `audience: '*'` admits family sessions too,
     * so keep it for routes that receive tokens forwarded from *.ochk.io.
     * Default: true.
     */
    requireHandle?: boolean;
}

/** A bound token with no handle, unless the site opted out. */
// Each session this module verified, so checkSignInRule takes nothing else: a
// claims-shaped object anyone built could carry any did and any backing.
const VERIFIED = new WeakSet<SessionPayload>();
function vouch(session: SessionPayload): SessionPayload {
    VERIFIED.add(session);
    return session;
}

function lacksHandle(session: SessionPayload, requireHandle: boolean | undefined): boolean {
    if (requireHandle === false) return false;
    const { aud, rh } = session as { aud?: unknown; rh?: unknown };
    if (aud === undefined) return false;
    return typeof rh !== 'string' || rh.length === 0;
}

function checkRequireHandle(requireHandle: unknown): void {
    if (requireHandle !== undefined && typeof requireHandle !== 'boolean') {
        throw new TypeError('@orangecheck/me-client: requireHandle must be true or false');
    }
}

let warnedHandle = false;

/** Say once why a signed-in person is turned away for want of a handle. */
function warnNoHandle(session: SessionPayload): void {
    if (warnedHandle) return;
    warnedHandle = true;
    console.warn(
        `[@orangecheck/me-client] a sign-in token bound to ${JSON.stringify((session as { aud?: unknown }).aud)} ` +
            'carries no revocation handle (rh), so sign out everywhere could not end it, and it was refused ' +
            '(no_session_handle). Tokens from the ochk.app sign-in popup carry one. Pass requireHandle: false ' +
            'only to accept tokens minted some other way.'
    );
}

/**
 * Verify a sign-in token: the signature, the issuer, expiry and, with
 * `audience`, that it was issued to your site. A token bound to your site with
 * no revocation handle is refused (see {@link VerifyOcTokenOptions.requireHandle}).
 * Null for any token that fails. It does not read the list of ended sessions:
 * `getOcSession` and the adapters do.
 */
export async function verifyOcToken(
    token: string,
    options: VerifyOcTokenOptions = {}
): Promise<SessionPayload | null> {
    if (options === null || typeof options !== 'object') {
        throw new TypeError('@orangecheck/me-client: options must be an object');
    }
    const { requireHandle, ...core } = options;
    checkRequireHandle(requireHandle);
    const session = await verifyOcTokenCore(token, core);
    if (!session) return null;
    if (lacksHandle(session, requireHandle)) {
        warnNoHandle(session);
        return null;
    }
    return vouch(session);
}

/**
 * A sign-in token's check, telling one that fails from a key set that can't be
 * read. `unavailable` is an outage: answer it 503 so the client tries again,
 * never as a failed sign-in.
 */
export type OcTokenCheck =
    | { status: 'valid'; session: SessionPayload }
    | { status: 'invalid'; reason?: OcSessionRefusal }
    | { status: 'unavailable'; reason: 'key_set_unavailable' };

/**
 * {@link verifyOcToken}, telling a token that fails from a key set that can't
 * be read (see {@link OcTokenCheck}). For the route that receives the token
 * from the sign-in popup. Throws on an option it does not read, or an issuer it
 * may not fetch from.
 */
export async function checkOcToken(token: string, options: VerifyOcTokenOptions = {}): Promise<OcTokenCheck> {
    if (options === null || typeof options !== 'object') {
        throw new TypeError('@orangecheck/me-client: options must be an object');
    }
    const { requireHandle, ...core } = options;
    checkRequireHandle(requireHandle);
    const checked = await checkOcTokenCore(token, core);
    if (checked.status === 'unavailable') return { status: 'unavailable', reason: 'key_set_unavailable' };
    if (checked.status === 'invalid') return { status: 'invalid' };
    if (lacksHandle(checked.session, requireHandle)) {
        warnNoHandle(checked.session);
        return { status: 'invalid', reason: 'no_session_handle' };
    }
    return { status: 'valid', session: vouch(checked.session) };
}

// Activity-attestation verifier · re-export from the identity module so
// server-side integrators get the gating helper alongside session
// verification without a second import path.
export {
    identity,
    verifyActivityAttestation,
    refreshEnvelopeJwks,
} from './identity';
// OC Connect: a site that keeps its own login makes an orangecheck account
// for its user from its own backend.
export { connectProvision, connectClaimLink, connectDelete } from './connect';
export type {
    ConnectOptions,
    ConnectProvisionOptions,
    ConnectProvisionResult,
    ConnectProvisionRefusal,
    ConnectClaimLinkResult,
    ConnectClaimLinkRefusal,
    ConnectDeleteResult,
    ConnectDeleteRefusal,
    ConnectRefused,
} from './connect';
export { CONNECT_CONSENT_LABEL, CONNECT_CONSENT_BLURB } from './connect-consent';
// After a sign-in: start one session per token, then end the token at ochk.io.
export { spendOnce, MemoryJtiStore, revokeToken } from './tokens';
export type { JtiStore, RevokeTokenOptions, RevokeTokenResult, RevokeTokenRefusal } from './tokens';
export type {
    ActivityAttestation,
    ActivityAttestationBundle,
    ActivityVerifyCheck,
    ActivityVerifyResult,
    VerifyActivityOptions,
} from './identity';

export interface OcSessionOptions extends VerifyOcTokenOptions {
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
     * everywhere, a passkey removed, the account deleted). Default, for a
     * token bound to your site: auth-core's `integratorRevocationCheck`, from
     * `OC_PROJECT_KEY` and `OC_SIGNING_SECRET`; none when they are unset. For a
     * family session (no `aud`, the ochk.io cookie a *.ochk.io site reads):
     * auth-core's `familyRevocationCheck`, from `OC_REVOCATION_FEED_TOKEN`, and
     * with that unset the call throws rather than read the session by its
     * signature alone (0.44.0). `false` turns the check off for both.
     */
    revocation?: RevocationCheck | false;
}

/** One check per me.ochk.io and project key, shared by every request in this process. */
const sessionChecks = new Map<string, RevocationCheck | null>();
let warnedUnchecked = false;

function revocationFor(options: OcSessionOptions, session: SessionPayload): RevocationCheck | null {
    if (options.revocation === false) return null;
    if (options.revocation) return options.revocation;
    // A family session is ended on ochk.io's own feed, never on a project's list.
    if (session.aud === undefined) {
        const token = typeof process !== 'undefined' ? process.env?.OC_REVOCATION_FEED_TOKEN?.trim() : undefined;
        if (!token) {
            throw new Error(
                '@orangecheck/me-client: a family session (no aud) is checked against ochk.io\'s ' +
                    'revocation feed, and OC_REVOCATION_FEED_TOKEN is not set. Set it, or pass ' +
                    '`revocation: false` to read family sessions by signature alone.'
            );
        }
        return familyRevocationCheck();
    }
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

/** Tests only: forget the per-project checks and the one-time warnings. */
export function _resetSessionChecksForTests(): void {
    sessionChecks.clear();
    warnedUnchecked = false;
    warnedHandle = false;
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
 * Returns `null` for unauthenticated requests. Throws only on an option it
 * does not read.
 */
export async function getOcSession(
    headers: SessionRequestHeaders | Headers,
    options: OcSessionOptions = {}
): Promise<SessionPayload | null> {
    const checked = await checkOcSession(headers, options);
    return checked.status === 'signed_in' ? checked.session : null;
}

/** Why a session can't be told right now: the key set, or the list of ended sessions. */
export type OcSessionUnavailable = 'key_set_unavailable' | 'revocations_unavailable';

/**
 * A request's session: signed in, signed out, or not checkable right now.
 * `reason` says why a token that verified is still signed out, or what can't
 * be read.
 */
export type OcSessionCheck =
    | { status: 'signed_in'; session: SessionPayload }
    | { status: 'signed_out'; reason?: OcSessionRefusal }
    | { status: 'unavailable'; reason?: OcSessionUnavailable };

/**
 * `getOcSession`, telling "signed out" from "can't tell right now".
 * `unavailable` with `reason: 'key_set_unavailable'` when the request carries a
 * token and ochk.io's key set can't be read (with auth-core 2.16.0 or later),
 * and `'revocations_unavailable'` when the token verifies but me.ochk.io's list
 * of ended sessions can't vouch for this request (a write while the list can't
 * be read). A token the person ended is `signed_out`, and so is one bound to
 * your site with no revocation handle (`reason: 'no_session_handle'`, unless
 * `requireHandle: false`). The adapters answer `unavailable` with 503 and that
 * reason, so a client retries instead of signing the person out.
 */
export async function checkOcSession(
    headers: SessionRequestHeaders | Headers,
    options: OcSessionOptions = {}
): Promise<OcSessionCheck> {
    checkOptions(options);
    const { issuer, jwksCacheTtlMs, jwksMaxStaleMs, audience } = options;
    const token = readOcSessionToken(headers);
    if (!token) return { status: 'signed_out' };
    const verified = await checkOcTokenCore(token, { issuer, jwksCacheTtlMs, jwksMaxStaleMs, audience });
    // An outage is never "signed out": the client retries.
    if (verified.status === 'unavailable') return { status: 'unavailable', reason: 'key_set_unavailable' };
    if (verified.status === 'invalid') {
        if (options.audience === undefined) warnIfAudienceMissing(headers);
        return { status: 'signed_out' };
    }
    const session = verified.session;
    if (lacksHandle(session, options.requireHandle)) {
        warnNoHandle(session);
        return { status: 'signed_out', reason: 'no_session_handle' };
    }
    const check = revocationFor(options, session);
    if (check) {
        // One read of the list, so the answer can't change between two.
        const state = await check.status(session);
        if (state === 'revoked') return { status: 'signed_out' };
        if (state === 'unverified' && !SAFE_METHODS.has((options.method ?? '').toUpperCase())) {
            return { status: 'unavailable', reason: 'revocations_unavailable' };
        }
    }
    return { status: 'signed_in', session: vouch(session) };
}

const unavailable = (checked: { reason?: OcSessionUnavailable }) => ({
    status: 503,
    body: { ok: false, reason: checked.reason ?? 'revocations_unavailable' },
});

const refusedFor = (checked: OcSessionCheck): OcSessionRefusal | undefined =>
    checked.status === 'signed_out' ? checked.reason : undefined;

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

/** The options the session check and the adapters read. */
const KNOWN_OPTIONS: ReadonlySet<string> = new Set<keyof WithOcAuthOptions>([
    'issuer',
    'jwksCacheTtlMs',
    'jwksMaxStaleMs',
    'audience',
    'method',
    'projectKey',
    'meOrigin',
    'revocation',
    'requireHandle',
    'required',
    'requireBond',
]);
const BOND_OPTIONS: ReadonlySet<string> = new Set<keyof BondNeed>(['minSats', 'minDays', 'maxAgeSecs']);

/**
 * Throw on a key me-client does not read. Ignored, a misspelt `projectKey`
 * would skip the project's sign-in rule, a misspelt `audience` would accept
 * family sessions, and a misspelt `requireBond.minSats` would read as 0.
 */
function checkOptions(options: WithOcAuthOptions): void {
    if (options === null || typeof options !== 'object') {
        throw new TypeError('@orangecheck/me-client: options must be an object');
    }
    const unknown = Object.keys(options).filter((k) => !KNOWN_OPTIONS.has(k));
    if (unknown.length > 0) {
        throw new TypeError(
            `@orangecheck/me-client: unknown option ${unknown.join(', ')}. ` +
                `It reads only ${[...KNOWN_OPTIONS].join(', ')}.`
        );
    }
    checkRequireHandle(options.requireHandle);
    const bond = options.requireBond;
    if (bond === undefined) return;
    if (bond === null || typeof bond !== 'object') {
        throw new TypeError('@orangecheck/me-client: requireBond must be an object');
    }
    const extra = Object.keys(bond).filter((k) => !BOND_OPTIONS.has(k));
    if (extra.length > 0) {
        throw new TypeError(
            `@orangecheck/me-client: requireBond: unknown option ${extra.join(', ')}. ` +
                `It reads only ${[...BOND_OPTIONS].join(', ')}.`
        );
    }
}
/** Where someone turned away for want of backing can back their account. */
export const BACK_ACCOUNT_URL = 'https://ochk.app/me/account#backing';
/** A moment on both clocks: performance.now() and the wall clock. */
type Stamp = { mono: number; wall: number };
const stamp = (): Stamp => ({ mono: performance.now(), wall: Date.now() });
/**
 * Time since a stamp: the longer of the two readings, so neither a wall clock
 * set back nor a pause performance.now() slept through (a suspended host) can
 * stretch a minute, a ten-second wait or the ten-minute standing.
 */
const since = (s: Stamp) => Math.max(performance.now() - s.mono, Date.now() - s.wall);
/** Keys me.ochk.io answered 404 for, and when; re-checked after a minute. */
const unknownKeys = new Map<string, Stamp>();
const UNKNOWN_PROJECT = Symbol('unknown_project');
const POLICY_TTL_MS = 60_000;
/** After a failed read, how long before me.ochk.io is asked again. */
const POLICY_RETRY_MS = 10_000;
/** How long the last rule read stands while it can't be read again. */
const POLICY_MAX_STALE_MS = 600_000;
type ProjectRule = BondNeed | null | undefined | typeof UNKNOWN_PROJECT;
const policies = new Map<string, { at: Stamp | null; need: BondNeed | null; failedAt?: Stamp }>();
/** The read in flight for each project: requests that arrive together share it. */
const policyReads = new Map<string, Promise<ProjectRule>>();

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

/** The last rule read, while it is younger than ten minutes; undefined after. */
function standing(slot: string): BondNeed | null | undefined {
    const hit = policies.get(slot);
    return hit?.at && since(hit.at) < POLICY_MAX_STALE_MS ? hit.need : undefined;
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
async function projectRequirement(options: WithOcAuthOptions): Promise<ProjectRule> {
    const base = (options.meOrigin ?? 'https://me.ochk.io').replace(/\/$/, '');
    const key = options.projectKey!;
    const slot = `${base} ${key}`;
    const unknownAt = unknownKeys.get(slot);
    if (unknownAt && since(unknownAt) < POLICY_TTL_MS) return UNKNOWN_PROJECT;
    const hit = policies.get(slot);
    if (hit?.at && since(hit.at) < POLICY_TTL_MS) return hit.need;
    if (hit?.failedAt && since(hit.failedAt) < POLICY_RETRY_MS) return standing(slot);
    let read = policyReads.get(slot);
    if (!read) {
        read = readProjectRule(base, key, slot).finally(() => policyReads.delete(slot));
        policyReads.set(slot, read);
    }
    return read;
}

async function readProjectRule(base: string, key: string, slot: string): Promise<ProjectRule> {
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
            unknownKeys.set(slot, stamp());
            return UNKNOWN_PROJECT;
        }
        unknownKeys.delete(slot);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const need = readRequirement(await r.json());
        if (need === undefined) throw new Error('unexpected body');
        policies.set(slot, { at: stamp(), need });
        return need;
    } catch {
        // The wait counts from the failure, not from when the read began.
        const hit = policies.get(slot);
        policies.set(slot, { at: hit?.at ?? null, need: hit?.need ?? null, failedAt: stamp() });
        return standing(slot);
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

/**
 * Why a session can't pass, as a status and body, or null when it can. `why`
 * names what turned a token away, so a 401 says it rather than "unauthenticated".
 */
async function refusal(
    session: SessionPayload | null,
    options: WithOcAuthOptions,
    why?: OcSessionRefusal
): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const unauthenticated = { status: 401, body: { ok: false, reason: why ?? 'unauthenticated' } };
    if (!session && options.required) return unauthenticated;
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
    if (!session) return need ? unauthenticated : null;
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

/** The options {@link checkSignInRule} reads. */
export interface SignInRuleOptions {
    /** Your project key: its "who can sign in" rule is read from me.ochk.io, as `withOcAuth` reads it. */
    projectKey?: string;
    /** Default `https://me.ochk.io`. */
    meOrigin?: string;
    /** An explicit floor, which wins over the project's rule. */
    requireBond?: WithOcAuthOptions['requireBond'];
}

/**
 * Whether a session meets the sign-in rule: `{ ok: true }`, or the status and
 * body the adapters answer with (403 `bond_required`, 503
 * `bond_policy_unavailable`, 500 `unknown_project_key`).
 */
export type SignInRuleCheck = { ok: true } | { ok: false; status: number; body: Record<string, unknown> };

const SIGN_IN_RULE_OPTIONS: ReadonlySet<string> = new Set<keyof SignInRuleOptions>([
    'projectKey',
    'meOrigin',
    'requireBond',
]);

/**
 * Apply your project's "who can sign in" rule to a session you have already
 * verified, for a site whose own session replaces the token: `checkOcToken`
 * and `verifyOcToken` check the token, not the rule. It reads the rule with the
 * same one-minute cache and ten-minute stand-in as `withOcAuth`, and refuses
 * rather than lets in when no rule could be read.
 *
 * `session` is the object `verifyOcToken`, `checkOcToken`, `getOcSession` or
 * an adapter (`req.ocSession`) returned, as is. Anything else throws, a copy or
 * claims read back from your own store included: apply the rule in the route
 * that starts your session, where you hold the verified one. It also throws
 * on a missing rule or an option it does not read.
 *
 *   const session = await verifyOcToken(token, { audience: 'https://your-site.example' });
 *   if (!session) return res.status(401).json({ ok: false });
 *   const checked = await checkSignInRule(session, { projectKey: process.env.OC_PROJECT_KEY! });
 *   if (!checked.ok) return res.status(checked.status).json(checked.body);
 */
export async function checkSignInRule(
    session: SessionPayload,
    options: SignInRuleOptions
): Promise<SignInRuleCheck> {
    if (options === null || typeof options !== 'object') {
        throw new TypeError('@orangecheck/me-client: options must be an object');
    }
    const unknown = Object.keys(options).filter((k) => !SIGN_IN_RULE_OPTIONS.has(k));
    if (unknown.length > 0) {
        throw new TypeError(
            `@orangecheck/me-client: unknown option ${unknown.join(', ')}. ` +
                `It reads only ${[...SIGN_IN_RULE_OPTIONS].join(', ')}.`
        );
    }
    checkOptions(options);
    if (!options.projectKey && !options.requireBond) {
        throw new TypeError('@orangecheck/me-client: checkSignInRule needs projectKey or requireBond');
    }
    if (session === null || typeof session !== 'object' || !VERIFIED.has(session)) {
        throw new TypeError(
            '@orangecheck/me-client: checkSignInRule takes the session verifyOcToken, checkOcToken or ' +
                'getOcSession returned, as is, not claims read some other way'
        );
    }
    const refused = await refusal(session, options);
    return refused ? { ok: false, status: refused.status, body: refused.body } : { ok: true };
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
    checkOptions(options);
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
        const refused =
            checked.status === 'unavailable'
                ? unavailable(checked)
                : await refusal(session, options, refusedFor(checked));
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
    checkOptions(options);
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
                checked.status === 'unavailable'
                    ? unavailable(checked)
                    : await refusal(session, options, refusedFor(checked));
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
    checkOptions(options);
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
            checked.status === 'unavailable'
                ? unavailable(checked)
                : await refusal(session, options, refusedFor(checked));
        if (refused) return c.json(refused.body, refused.status);
        await next();
    };
}
