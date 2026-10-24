/**
 * Native sign-in, the server's half (ochk.io/docs/integration/native-sign-in): an app on a
 * person's own device, a desktop build or a game, signs them in through the
 * system browser. It listens on 127.0.0.1, opens ochk.io's
 * /native/authorize with a PKCE challenge, and its listener receives a
 * one-time `code`. It hands the code and its verifier to your server, which
 * trades them here for the same token the sign-in popup gives, verified:
 *
 *   exchangeNativeCode({ code, codeVerifier, redirectUri, projectKey, audience })
 *     → { status: 'valid', token, session } | { status: 'invalid', reason }
 *       | { status: 'unavailable', reason }
 *
 * No secret is involved anywhere: the verifier proves the app that started
 * the sign-in is the one finishing it. Only a mistake in the call throws.
 */

import type { SessionPayload } from '@orangecheck/auth-core';

import { checkOcToken } from './server';
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
    /** Your project key, as the app sent it. */
    projectKey: string;
    /**
     * Your site's origin, which the token must be bound to: the project's
     * verified domain (`https://your-site.example`), or a test project's
     * development origin. Never taken from ochk.io's answer.
     */
    audience: string;
}

export interface ExchangeNativeCodeOptions {
    /** The auth host. Default https://ochk.io. */
    issuer?: string;
    /** Answer `unavailable` after this long. Default 5000, at most 30000. */
    timeoutMs?: number;
}

/**
 * Why there is no session. `invalid_grant`: the code is unknown, spent or
 * expired, was sent with another verifier, redirect or project, or your
 * project no longer allows native sign-in; start the sign-in again.
 * `not_offered`: this auth host does not offer native sign-in.
 * `bad_request`: a field ochk.io could not read. `invalid_token` and
 * `no_session_handle`: the token ochk.io returned did not verify for your
 * `audience`.
 */
export type ExchangeNativeCodeRefusal =
    | 'invalid_grant'
    | 'not_offered'
    | 'bad_request'
    | 'invalid_token'
    | 'no_session_handle';

export type ExchangeNativeCodeResult =
    | { status: 'valid'; token: string; session: SessionPayload }
    | { status: 'invalid'; reason: ExchangeNativeCodeRefusal }
    | { status: 'unavailable'; reason: 'auth_host_unavailable' | 'rate_limited' | 'key_set_unavailable' };

const OPTIONS: ReadonlySet<string> = new Set<keyof ExchangeNativeCodeOptions>(['issuer', 'timeoutMs']);
const FIELDS = ['code', 'codeVerifier', 'redirectUri', 'projectKey', 'audience'] as const;

function fail(message: string): never {
    throw new TypeError(`@orangecheck/me-client: exchangeNativeCode: ${message}`);
}

/**
 * Trade a native sign-in's code for its token (`POST <issuer>/api/auth/native/token`),
 * then verify the token against your `audience`. Each code works once,
 * whatever the answer. On `valid`, start your own session as you would for
 * the popup's token (`spendOnce(session.jti, session.exp, store)` first). An
 * outage is a result, never a throw.
 */
export async function exchangeNativeCode(
    input: ExchangeNativeCodeInput,
    options: ExchangeNativeCodeOptions = {}
): Promise<ExchangeNativeCodeResult> {
    if (input === null || typeof input !== 'object') fail('input must be an object');
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
    const issuer = issuerOrigin(options.issuer ?? DEFAULT_ISSUER, 'exchangeNativeCode');
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (typeof timeoutMs !== 'number' || !(timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS)) {
        fail(`timeoutMs must be above 0 and at most ${MAX_TIMEOUT_MS}`);
    }

    const answer = await post(`${issuer}/api/auth/native/token`, input, timeoutMs);
    if (answer.status !== 'token') return answer;
    const checked = await checkOcToken(answer.token, { audience: input.audience, issuer });
    if (checked.status === 'valid') return { status: 'valid', token: answer.token, session: checked.session };
    if (checked.status === 'unavailable') return { status: 'unavailable', reason: 'key_set_unavailable' };
    return { status: 'invalid', reason: checked.reason ?? 'invalid_token' };
}

type TokenAnswer = { ok?: unknown; token?: unknown; reason?: unknown };

async function post(
    url: string,
    input: ExchangeNativeCodeInput,
    timeoutMs: number
): Promise<{ status: 'token'; token: string } | Exclude<ExchangeNativeCodeResult, { status: 'valid' }>> {
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
                project: input.projectKey,
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
