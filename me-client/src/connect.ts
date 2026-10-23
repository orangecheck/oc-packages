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
 * a missing key or user id, `consent: false`, or a call from a browser, where
 * the API key would be exposed.
 */

const DEFAULT_ORIGIN = 'https://ochk.io';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30_000;
const DID_OC = /^did:oc:[0-9a-f]{32}$/;

export interface ConnectOptions {
    /** Your Connect API key (ochk.app → your project → Sign-in → Your own login). Server only. */
    apiKey: string;
    /** Your own stable id for this user, 1 to 256 characters. */
    userId: string;
    /** Where ochk.io is. Default https://ochk.io. */
    origin?: string;
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

const BASE_KEYS = ['apiKey', 'userId', 'origin', 'timeoutMs'];
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

/** Check the call itself; throws on a mistake in it. Returns the origin to call. */
function checkCall(name: string, options: ConnectOptions, known: ReadonlySet<string>): string {
    if (typeof document !== 'undefined') {
        fail(`${name} runs on your server only: in a browser your API key would be exposed`);
    }
    if (options === null || typeof options !== 'object') fail(`${name}: options must be an object`);
    const unknown = Object.keys(options).filter((k) => !known.has(k));
    if (unknown.length > 0) {
        const only = [...known].join(', ');
        fail(`${name}: unknown option ${unknown.join(', ')}. It reads only ${only}.`);
    }
    if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
        fail(`${name}: apiKey is required (your Connect API key)`);
    }
    const id = options.userId;
    if (typeof id !== 'string' || id.length < 1 || id.length > 256) {
        fail(`${name}: userId must be your user's id, 1 to 256 characters`);
    }
    const t = options.timeoutMs;
    if (t !== undefined && !(typeof t === 'number' && t > 0 && t <= MAX_TIMEOUT_MS)) {
        fail(`${name}: timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`);
    }
    const origin = options.origin ?? DEFAULT_ORIGIN;
    let url: URL;
    try {
        url = new URL(origin);
    } catch {
        return fail(`${name}: origin must be an https URL`);
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
        fail(`${name}: origin must be an https URL`);
    }
    return url.origin;
}

type Answer = { status: number; body: Record<string, unknown> | null };

async function post(
    origin: string,
    path: string,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs: number
): Promise<Answer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`${origin}${path}`, {
            method: 'POST',
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
    const origin = checkCall('connectProvision', options, PROVISION_KEYS);
    if (options.consent !== undefined && options.consent !== true) {
        fail(
            'connectProvision: consent must be true or left out. An unticked box means no ' +
                'call at all; a call without consent makes an account nobody asked for'
        );
    }
    const { email, emailVerified } = options;
    if (email !== undefined && (typeof email !== 'string' || email === '')) {
        fail('connectProvision: email must be a non-empty string');
    }
    if (emailVerified !== undefined && typeof emailVerified !== 'boolean') {
        fail('connectProvision: emailVerified must be a boolean');
    }
    if (emailVerified !== undefined && email === undefined) {
        fail('connectProvision: emailVerified describes email, so pass email too');
    }
    const body: Record<string, unknown> = { user_id: options.userId };
    if (options.consent === true) body.consent = true;
    if (email !== undefined) body.email = email;
    if (emailVerified !== undefined) body.email_verified = emailVerified;
    return call(origin, '/api/connect/provision', options, body).then(
        (answer): ConnectProvisionResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, PROVISION_REASONS);
            const good =
                b?.ok === true &&
                typeof b.did_oc === 'string' &&
                DID_OC.test(b.did_oc) &&
                typeof b.is_new === 'boolean';
            return good
                ? { ok: true, did_oc: b.did_oc as string, is_new: b.is_new as boolean }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
    );
}

/** A link for your signed-in user to claim their account at ochk.app. Good once, for fifteen minutes. */
export function connectClaimLink(options: ConnectOptions): Promise<ConnectClaimLinkResult> {
    const origin = checkCall('connectClaimLink', options, USER_KEYS);
    return call(origin, '/api/connect/claim-link', options, { user_id: options.userId }).then(
        (answer): ConnectClaimLinkResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, CLAIM_LINK_REASONS);
            const good =
                b?.ok === true &&
                isHttpsUrl(b.url) &&
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
    const origin = checkCall('connectDelete', options, USER_KEYS);
    return call(origin, '/api/connect/delete', options, { user_id: options.userId }).then(
        (answer): ConnectDeleteResult => {
            const b = answer.body;
            if (answer.status !== 200) return refused(answer, DELETE_REASONS);
            return b?.ok === true && typeof b.result === 'string' && DELETE_RESULTS.has(b.result)
                ? { ok: true, result: b.result as 'deleted' | 'detached' | 'already_deleted' }
                : { ok: false, reason: 'unavailable', status: 200 };
        }
    );
}

function call(
    origin: string,
    path: string,
    options: ConnectOptions,
    body: Record<string, unknown>
): Promise<Answer> {
    return post(origin, path, options.apiKey, body, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

function isHttpsUrl(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    try {
        return new URL(v).protocol === 'https:';
    } catch {
        return false;
    }
}
