/**
 * OC Connect from a site's own backend: the site keeps its own login and makes
 * an orangecheck account for its user with one call (ochk.io/docs/connect).
 *
 *   connectProvision({ apiKey, userId, consent? })  → { ok, did_oc, is_new }
 *   connectClaimLink({ apiKey, userId })            → { ok, url, expires_at }
 *   connectDelete({ apiKey, userId })               → { ok, result }
 *
 * A refusal or an outage is a result (`{ ok: false, reason, status }`), never a
 * throw, so a failed call can't block the site's own login. Only a mistake in
 * the call itself throws, before anything is sent: an option it does not read,
 * a missing key or user id, or `consent: false`.
 *
 * They refuse to run where there is a `document`, as a hint for the most common
 * mistake. That is not a guard: a browser Web Worker has no `document`. What
 * keeps the key safe is importing these only from `/server` code that never
 * reaches a client bundle.
 */

import { isDidOc } from '@orangecheck/auth-core/identifiers';

/** The only place a call goes: the key never travels anywhere else. */
const ORIGIN = 'https://ochk.io';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30_000;

export interface ConnectOptions {
    /** Your Connect API key (ochk.app → your project → Sign-in → Your own login). Server only. */
    apiKey: string;
    /** Your own stable id for this user, 1 to 256 characters. */
    userId: string;
    /** Answer `unavailable` after this long. Default 5000, at most 30000. */
    timeoutMs?: number;
}

export interface ConnectProvisionOptions extends ConnectOptions {
    /**
     * `true` only when the person ticked your "Also create my orangecheck
     * account" box just now. Recorded once. Leave it out when you show no box.
     * An unticked box means no call at all, so `false` is refused.
     */
    consent?: true;
    /** The user's email. ochk.io keeps it only as a keyed hash. */
    email?: string;
    /** `true` when you verified `email` yourself (a code or a link they answered). */
    emailVerified?: boolean;
}

/**
 * Why ochk.io did not answer with an account. `unavailable` covers an outage, a
 * timeout and any answer this SDK can't read: try again later.
 */
export type ConnectProvisionRefusal =
    | 'account_deleted'
    | 'daily_limit'
    | 'rate_limited'
    | 'invalid_api_key'
    | 'app_suspended'
    | 'bad_request'
    | 'unavailable';
export type ConnectDeleteRefusal =
    | 'unknown_user'
    | 'holds_earnings'
    | 'not_deletable'
    | 'rate_limited'
    | 'invalid_api_key'
    | 'bad_request'
    | 'unavailable';
export type ConnectClaimLinkRefusal =
    | 'unknown_user'
    | 'already_claimed'
    | 'rate_limited'
    | 'invalid_api_key'
    | 'app_suspended'
    | 'bad_request'
    | 'unavailable';

/** A refusal: `status` is ochk.io's HTTP status, 0 when nothing came back. */
export interface ConnectRefused<R extends string> {
    ok: false;
    reason: R;
    status: number;
}

export type ConnectProvisionResult =
    | { ok: true; did_oc: string; is_new: boolean }
    | ConnectRefused<ConnectProvisionRefusal>;
export type ConnectDeleteResult =
    | { ok: true; result: 'deleted' | 'detached' | 'already_deleted' }
    | ConnectRefused<ConnectDeleteRefusal>;
export type ConnectClaimLinkResult =
    | { ok: true; url: string; expires_at: string }
    | ConnectRefused<ConnectClaimLinkRefusal>;

const BASE_KEYS = ['apiKey', 'userId', 'timeoutMs'];
const PROVISION_KEYS = new Set([...BASE_KEYS, 'consent', 'email', 'emailVerified']);
const USER_KEYS = new Set(BASE_KEYS);
const PROVISION_REASONS = new Set<string>([
    'account_deleted',
    'daily_limit',
    'rate_limited',
    'invalid_api_key',
    'app_suspended',
    'bad_request',
]);
const DELETE_REASONS = new Set<string>([
    'unknown_user',
    'holds_earnings',
    'not_deletable',
    'rate_limited',
    'invalid_api_key',
    'bad_request',
]);
const CLAIM_LINK_REASONS = new Set<string>([
    'unknown_user',
    'already_claimed',
    'rate_limited',
    'invalid_api_key',
    'app_suspended',
    'bad_request',
]);
const DELETE_RESULTS = new Set(['deleted', 'detached', 'already_deleted']);

function fail(message: string): never {
    throw new TypeError(`@orangecheck/me-client: ${message}`);
}

/**
 * Check the call itself; throws on a mistake in it. Returns the options copied
 * once onto a bare object, and every later read is from that copy, so an
 * inherited `consent` (a polluted Object.prototype, or options made with
 * Object.create) is never read and a getter is read once.
 */
function checkCall<O extends ConnectOptions>(name: string, options: O, known: ReadonlySet<string>): O {
    if (typeof document !== 'undefined') {
        fail(`${name} runs on your server only: in a browser your API key would be exposed`);
    }
    if (options === null || typeof options !== 'object') fail(`${name}: options must be an object`);
    const unknown = Object.keys(options).filter((k) => !known.has(k));
    if (unknown.length > 0) {
        const only = [...known].join(', ');
        fail(`${name}: unknown option ${unknown.join(', ')}. It reads only ${only}.`);
    }
    const o = Object.assign(Object.create(null) as O, options);
    if (typeof o.apiKey !== 'string' || o.apiKey.trim() === '') {
        fail(`${name}: apiKey is required (your Connect API key)`);
    }
    // ochk.io counts a user id in UTF-16 code units, as JavaScript's length does.
    const id = o.userId;
    if (typeof id !== 'string' || id.length < 1 || id.length > 256) {
        fail(`${name}: userId must be your user's id, 1 to 256 characters`);
    }
    const t = o.timeoutMs;
    if (t !== undefined && !(typeof t === 'number' && t > 0 && t <= MAX_TIMEOUT_MS)) {
        fail(`${name}: timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`);
    }
    return o;
}

type Answer = { status: number; body: Record<string, unknown> | null };

async function post(
    path: string,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs: number
): Promise<Answer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${ORIGIN}${path}`, {
            method: 'POST',
            // These endpoints never redirect, so a redirect is an error: the key and
            // the body go to ochk.io and nowhere else.
            redirect: 'error',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        let parsed: unknown = null;
        try {
            parsed = await res.json();
        } catch {
            parsed = null;
        }
        const ok = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        return { status: res.status, body: ok ? (parsed as Record<string, unknown>) : null };
    } catch {
        return { status: 0, body: null };
    } finally {
        clearTimeout(timer);
    }
}

function refused<R extends string>(
    answer: Answer,
    known: ReadonlySet<string>
): ConnectRefused<R> {
    const raw = answer.body?.reason;
    const said = raw === 'missing_api_key' ? 'invalid_api_key' : raw;
    const reason = typeof said === 'string' && known.has(said) ? said : 'unavailable';
    return { ok: false, reason: reason as R, status: answer.status };
}

/**
 * Make (or find) the orangecheck account for one of your users. Idempotent:
 * the same user always gets the same `did_oc`. Call it once per user and keep
 * the `did_oc` on your user record.
 */
export function connectProvision(
    options: ConnectProvisionOptions
): Promise<ConnectProvisionResult> {
    const o = checkCall('connectProvision', options, PROVISION_KEYS);
    if (o.consent !== undefined && o.consent !== true) {
        fail(
            'connectProvision: consent must be true or left out. An unticked box means no ' +
                'call at all; a call without consent makes an account nobody asked for'
        );
    }
    const { email, emailVerified } = o;
    if (email !== undefined && (typeof email !== 'string' || email === '')) {
        fail('connectProvision: email must be a non-empty string');
    }
    if (emailVerified !== undefined && typeof emailVerified !== 'boolean') {
        fail('connectProvision: emailVerified must be a boolean');
    }
    if (emailVerified !== undefined && email === undefined) {
        fail('connectProvision: emailVerified describes email, so pass email too');
    }
    const body: Record<string, unknown> = { user_id: o.userId };
    if (o.consent === true) body.consent = true;
    if (email !== undefined) body.email = email;
    if (emailVerified !== undefined) body.email_verified = emailVerified;
    return call('/api/connect/provision', o, body).then(
        (answer): ConnectProvisionResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, PROVISION_REASONS);
            const good =
                b?.ok === true &&
                isDidOc(b.did_oc) &&
                typeof b.is_new === 'boolean';
            return good
                ? { ok: true, did_oc: b.did_oc as string, is_new: b.is_new as boolean }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
    );
}

/**
 * A link for your signed-in user to claim their account at ochk.app. Good once,
 * for fifteen minutes. A link anywhere but https://ochk.app is refused
 * (`unavailable`), so you never send your user somewhere else.
 */
export function connectClaimLink(options: ConnectOptions): Promise<ConnectClaimLinkResult> {
    const o = checkCall('connectClaimLink', options, USER_KEYS);
    return call('/api/connect/claim-link', o, { user_id: o.userId }).then(
        (answer): ConnectClaimLinkResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, CLAIM_LINK_REASONS);
            const good =
                b?.ok === true &&
                isClaimUrl(b.url) &&
                typeof b.expires_at === 'string' &&
                b.expires_at !== '';
            return good
                ? { ok: true, url: b.url as string, expires_at: b.expires_at as string }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
    );
}

/** Your user deleted their account with you: delete the one Connect made for them. */
export function connectDelete(options: ConnectOptions): Promise<ConnectDeleteResult> {
    const o = checkCall('connectDelete', options, USER_KEYS);
    return call('/api/connect/delete', o, { user_id: o.userId }).then(
        (answer): ConnectDeleteResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, DELETE_REASONS);
            return b?.ok === true && typeof b.result === 'string' && DELETE_RESULTS.has(b.result)
                ? { ok: true, result: b.result as 'deleted' | 'detached' | 'already_deleted' }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
    );
}

function call(path: string, o: ConnectOptions, body: Record<string, unknown>): Promise<Answer> {
    return post(path, o.apiKey, body, o.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

/** An https link on ochk.app, the only place a claim happens: no user name, password or port. */
function isClaimUrl(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    try {
        const url = new URL(v);
        return (
            url.protocol === 'https:' &&
            url.hostname === 'ochk.app' &&
            url.port === '' &&
            url.username === '' &&
            url.password === ''
        );
    } catch {
        return false;
    }
}
