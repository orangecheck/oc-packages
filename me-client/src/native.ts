/**
 * Native sign-in, the server's half (ochk.io/docs/integration/native-sign-in): an app on a
 * person's own device, a desktop build or a game, signs them in through the
 * system browser. It listens on 127.0.0.1, opens ochk.io's
 * /native/authorize with a PKCE challenge, and its listener receives a
 * one-time `code`. It hands the code and its verifier to your server, which
 * trades them here for the same token the sign-in popup gives, checked as
 * `withOcAuth` checks one:
 *
 *   exchangeNativeCode({ code, codeVerifier, redirectUri, audience }, { projectKey })
 *     → { status: 'valid', token, session } | { status: 'invalid', reason }
 *       | { status: 'unavailable', reason }
 *
 * `valid` means the token verifies for your audience, carries its handle,
 * was not ended everywhere, and the account meets your project's "who can
 * sign in" rule. No secret is involved in the app: the verifier proves the
 * app that started the sign-in is the one finishing it. Only a mistake in
 * the call throws.
 */

import type { RevocationCheck, SessionPayload } from '@orangecheck/auth-core';

import { checkOcSession, checkOcToken, checkSignInRule, type WithOcAuthOptions } from './server';
import { issuerOrigin } from './tokens';

const DEFAULT_ISSUER = 'https://ochk.io';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_FIELD_LENGTH = 512;

export interface ExchangeNativeCodeInput {
    /** The `code` your app's loopback listener received. */
    code: string;
    /** The PKCE verifier the app made its `code_challenge` from. */
    codeVerifier: string;
    /** The redirect the app sent, exactly: `http://127.0.0.1:<port>/<path>`. */
    redirectUri: string;
    /**
     * Your site's origin, which the token must be bound to: the project's
     * verified domain (`https://your-site.example`), or a test project's
     * development origin. Never taken from ochk.io's answer.
     */
    audience: string;
}

export interface ExchangeNativeCodeOptions {
    /**
     * Your project key, from your own config: default `OC_PROJECT_KEY`. Never
     * one the app sends, since the key decides whose "who can sign in" rule
     * and list of ended sessions apply.
     */
    projectKey?: string;
    /** The auth host. Default https://ochk.io. */
    issuer?: string;
    /** Where the rule and the list of ended sessions are read. Default https://me.ochk.io. */
    meOrigin?: string;
    /**
     * The check for sessions the person ended everywhere, as `checkOcSession`
     * takes it. Default: auth-core's `integratorRevocationCheck` with your
     * project key and `OC_SIGNING_SECRET`; none while the secret is unset.
     * The trade counts as a write: a list that can't be read answers
     * `unavailable`.
     */
    revocation?: RevocationCheck | false;
    /** An explicit floor, which wins over the project's rule, as `withOcAuth` takes it. */
    requireBond?: WithOcAuthOptions['requireBond'];
    /** Answer `unavailable` after this long. Default 5000, at most 30000. */
    timeoutMs?: number;
}

/**
 * Why there is no session.
 * - `invalid_grant`: the code is unknown, spent or expired, was sent with
 *   another verifier, redirect or project, or the project no longer allows
 *   native sign-in. Start the sign-in again.
 * - `not_offered`: this auth host does not offer native sign-in.
 * - `bad_request`: a field ochk.io could not read.
 * - `invalid_token`, `no_session_handle`: the token did not verify for your
 *   `audience`.
 * - `session_ended`: the person ended their sessions everywhere.
 * - `bond_required`: the account does not meet your project's rule; `need`,
 *   `have` and `back_url` say what it asks and where to back the account, as
 *   the adapters' 403 does.
 * - `unknown_project_key`: your project key names no project at `meOrigin`.
 */
export type ExchangeNativeCodeRefusal =
    | 'invalid_grant'
    | 'not_offered'
    | 'bad_request'
    | 'invalid_token'
    | 'no_session_handle'
    | 'session_ended'
    | 'unknown_project_key';

/** What an outage left unknown. Answer it 503, so the app tries again. */
export type ExchangeNativeCodeUnavailable =
    | 'auth_host_unavailable'
    | 'rate_limited'
    | 'key_set_unavailable'
    | 'revocations_unavailable'
    | 'bond_policy_unavailable';

export type ExchangeNativeCodeResult =
    | { status: 'valid'; token: string; session: SessionPayload }
    | { status: 'invalid'; reason: ExchangeNativeCodeRefusal }
    | {
          status: 'invalid';
          reason: 'bond_required';
          need: { min_sats: number; min_days: number; max_age_secs?: number };
          have: { sats_floor: number; days_floor: number } | null;
          back_url: string;
      }
    | { status: 'unavailable'; reason: ExchangeNativeCodeUnavailable };

const OPTIONS: ReadonlySet<string> = new Set<keyof ExchangeNativeCodeOptions>([
    'projectKey',
    'issuer',
    'meOrigin',
    'revocation',
    'requireBond',
    'timeoutMs',
]);
const FIELDS = ['code', 'codeVerifier', 'redirectUri', 'audience'] as const;

function fail(message: string): never {
    throw new TypeError(`@orangecheck/me-client: exchangeNativeCode: ${message}`);
}

/**
 * Trade a native sign-in's code for its token (`POST <issuer>/api/auth/native/token`),
 * then check it as `withOcAuth` does a request's: verified for your
 * `audience` with its handle, not ended everywhere (the trade counts as a
 * write), and meeting your project's rule. Each code works once, whatever
 * the answer. Start your own session only on `valid`, after
 * `spendOnce(session.jti, session.exp, store)`. An outage is a result, never
 * a throw.
 */
export async function exchangeNativeCode(
    input: ExchangeNativeCodeInput,
    options: ExchangeNativeCodeOptions = {}
): Promise<ExchangeNativeCodeResult> {
    if (input === null || typeof input !== 'object') fail('input must be an object');
    if ('projectKey' in input) {
        fail('projectKey is your own key: pass it in options, or set OC_PROJECT_KEY, never from the request');
    }
    const extra = Object.keys(input).filter((k) => !(FIELDS as readonly string[]).includes(k));
    if (extra.length > 0) fail(`unknown input ${extra.join(', ')}. It reads only ${FIELDS.join(', ')}.`);
    for (const f of FIELDS) {
        const v: unknown = input[f];
        if (typeof v !== 'string' || v.length === 0 || v.length > MAX_FIELD_LENGTH) {
            fail(`${f} must be a non-empty string of at most ${MAX_FIELD_LENGTH} characters`);
        }
    }
    if (input.audience === '*') fail("audience must be your site's origin, not '*'");
    if (options === null || typeof options !== 'object') fail('options must be an object');
    const unknown = Object.keys(options).filter((k) => !OPTIONS.has(k));
    if (unknown.length > 0) fail(`unknown option ${unknown.join(', ')}. It reads only ${[...OPTIONS].join(', ')}.`);
    const projectKey =
        options.projectKey ?? (typeof process !== 'undefined' ? process.env?.OC_PROJECT_KEY?.trim() : undefined);
    if (typeof projectKey !== 'string' || projectKey.length === 0 || projectKey.length > MAX_FIELD_LENGTH) {
        fail('needs your project key: options.projectKey, or OC_PROJECT_KEY');
    }
    const issuer = issuerOrigin(options.issuer ?? DEFAULT_ISSUER, 'exchangeNativeCode');
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof timeoutMs !== 'number' || !(timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS)) {
        fail(`timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`);
    }

    const answer = await post(`${issuer}/api/auth/native/token`, input, projectKey, timeoutMs);
    if (answer.status !== 'token') return answer;
    const token = answer.token;

    // The token itself: signature, issuer, expiry, audience and handle.
    const verified = await checkOcToken(token, { audience: input.audience, issuer });
    if (verified.status === 'unavailable') return { status: 'unavailable', reason: 'key_set_unavailable' };
    if (verified.status === 'invalid') return { status: 'invalid', reason: verified.reason ?? 'invalid_token' };

    // The list of ended sessions, as a write, exactly as the adapters read it.
    const where = options.meOrigin ? { meOrigin: options.meOrigin } : {};
    const checked = await checkOcSession(
        { authorization: `Bearer ${token}` },
        {
            audience: input.audience,
            issuer,
            projectKey,
            method: 'POST',
            ...where,
            ...(options.revocation !== undefined ? { revocation: options.revocation } : {}),
        }
    );
    if (checked.status === 'unavailable') {
        return { status: 'unavailable', reason: checked.reason ?? 'revocations_unavailable' };
    }
    if (checked.status === 'signed_out') return { status: 'invalid', reason: checked.reason ?? 'session_ended' };

    // The project's "who can sign in" rule, read and answered as checkSignInRule does.
    const rule = await checkSignInRule(checked.session, {
        projectKey,
        ...where,
        ...(options.requireBond ? { requireBond: options.requireBond } : {}),
    });
    if (!rule.ok) {
        const b = rule.body as {
            reason?: string;
            need?: { min_sats: number; min_days: number; max_age_secs?: number };
            have?: { sats_floor: number; days_floor: number } | null;
            back_url?: string;
        };
        if (b.reason === 'bond_required' && b.need && b.back_url) {
            return { status: 'invalid', reason: 'bond_required', need: b.need, have: b.have ?? null, back_url: b.back_url };
        }
        if (b.reason === 'unknown_project_key') return { status: 'invalid', reason: 'unknown_project_key' };
        return { status: 'unavailable', reason: 'bond_policy_unavailable' };
    }
    return { status: 'valid', token, session: checked.session };
}

type TokenAnswer = { ok?: unknown; token?: unknown; reason?: unknown };

async function post(
    url: string,
    input: ExchangeNativeCodeInput,
    projectKey: string,
    timeoutMs: number
): Promise<
    | { status: 'token'; token: string }
    | { status: 'invalid'; reason: ExchangeNativeCodeRefusal }
    | { status: 'unavailable'; reason: ExchangeNativeCodeUnavailable }
> {
    const unavailable = { status: 'unavailable', reason: 'auth_host_unavailable' } as const;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            // The endpoint never redirects: the code goes to the auth host and nowhere else.
            redirect: 'error',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                code: input.code,
                code_verifier: input.codeVerifier,
                redirect_uri: input.redirectUri,
                project: projectKey,
            }),
            signal: controller.signal,
        });
        let body: TokenAnswer | null = null;
        try {
            const json: unknown = await res.json();
            if (json !== null && typeof json === 'object') body = json as TokenAnswer;
        } catch {
            body = null;
        }
        if (res.status === 200) {
            return body?.ok === true && typeof body.token === 'string' && body.token.length > 0
                ? { status: 'token', token: body.token }
                : unavailable;
        }
        if (res.status === 400) {
            return { status: 'invalid', reason: body?.reason === 'invalid_grant' ? 'invalid_grant' : 'bad_request' };
        }
        if (res.status === 404) return { status: 'invalid', reason: 'not_offered' };
        if (res.status === 429) return { status: 'unavailable', reason: 'rate_limited' };
        return unavailable;
    } catch {
        return unavailable;
    } finally {
        clearTimeout(timer);
    }
}
