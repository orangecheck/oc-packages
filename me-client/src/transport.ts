/**
 * Tiny HTTP transport layer. The me.ochk.io origin is configurable so
 * staging deployments and self-hosted me-equivalents can swap it.
 *
 * Two auth paths, picked transparently:
 *   - Same-origin / family integrators (*.ochk.io): the browser ships
 *     the `oc_session` cookie automatically because we set
 *     `credentials: 'include'`. Nothing to configure.
 *   - Cross-domain integrators: after popup signin, call
 *     `setBearerToken(result.token)` once. Subsequent SDK calls add
 *     `Authorization: Bearer <token>`. Cookies still ride too — the
 *     server accepts whichever arrives.
 */

let origin = 'https://me.ochk.io';
let bearerToken: string | null = null;

export function setOrigin(url: string): void {
    origin = url.replace(/\/$/, '');
}

export function getOrigin(): string {
    return origin;
}

/** Cross-domain integrators: store the JWT returned by `signInWithOc()`
 *  here so subsequent SDK calls can authenticate via Authorization
 *  header. Same-origin integrators don't need this (the cookie rides). */
export function setBearerToken(token: string | null): void {
    bearerToken = token && token.length > 0 ? token : null;
}

export function getBearerToken(): string | null {
    return bearerToken;
}

export function clearBearerToken(): void {
    bearerToken = null;
}

export interface FetchOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
}

export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json',
    };
    if (bearerToken) headers['authorization'] = `Bearer ${bearerToken}`;
    const res = await fetch(`${origin}${path}`, {
        method: opts.method ?? 'GET',
        credentials: 'include',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts.signal,
    });
    if (!res.ok) {
        let message = `me.ochk.io ${res.status}`;
        let errorCode: string | undefined;
        let body: Record<string, unknown> | undefined;
        try {
            const data = (await res.json()) as {
                error?: string;
                reason?: string;
                [k: string]: unknown;
            };
            body = data;
            if (data?.error) {
                errorCode = data.error;
                message = data.reason ?? data.error;
            }
        } catch {
            /* response body wasn't JSON; carry the bare status */
        }
        // 429 → carry Retry-After so callers (or the small
        // withRateLimitRetry helper) can back off correctly. The header
        // is in seconds per RFC 7231; we surface it as a number on the
        // error rather than asking the caller to re-parse.
        let retryAfterSeconds: number | undefined;
        if (res.status === 429) {
            const headerValue = res.headers.get('retry-after');
            if (headerValue) {
                const parsed = Number.parseInt(headerValue, 10);
                if (Number.isFinite(parsed) && parsed >= 0) retryAfterSeconds = parsed;
            }
            // Server bodies on 429 often also carry the hint as
            // `retry_after_seconds` (see /api/integrator/event/batch's
            // applyProjectRateLimit response). Honor it as a fallback
            // when no header is present — some intermediaries strip
            // Retry-After from CORS responses.
            if (retryAfterSeconds == null && typeof body?.retry_after_seconds === 'number') {
                retryAfterSeconds = body.retry_after_seconds as number;
            }
        }
        throw new MeClientError(message, res.status, { errorCode, retryAfterSeconds });
    }
    return (await res.json()) as T;
}

export class MeClientError extends Error {
    public readonly status: number;
    /** Server-side error code (the `error` field on the JSON body, e.g.
     *  `project_rate_limit_exceeded`). Stable across versions; safe to
     *  match on. The human-readable `message` may change. */
    public readonly errorCode: string | undefined;
    /** Seconds to wait before retrying. Set when the server responded
     *  429 with a Retry-After header (or a `retry_after_seconds` body
     *  field). Undefined for any other status. Use with
     *  `withRateLimitRetry()` or your own backoff loop. */
    public readonly retryAfterSeconds: number | undefined;
    constructor(
        message: string,
        status: number,
        opts?: { errorCode?: string; retryAfterSeconds?: number }
    ) {
        super(message);
        this.name = 'MeClientError';
        this.status = status;
        this.errorCode = opts?.errorCode;
        this.retryAfterSeconds = opts?.retryAfterSeconds;
    }
    /** True for the 429 surface · convenience boolean so callers don't
     *  have to compare status === 429 every time. */
    get isRateLimited(): boolean {
        return this.status === 429;
    }
}

export interface WithRateLimitRetryOptions {
    /** Maximum retry attempts on 429. Default 2 (= up to 3 total
     *  invocations of the wrapped function). */
    maxRetries?: number;
    /** Cap on Retry-After we'll actually honor in seconds. Some server
     *  configs return very large values; the SDK refuses to sleep
     *  beyond this and re-throws the original error so the caller
     *  decides. Default 30. */
    maxRetryAfterSeconds?: number;
    /** Floor backoff in milliseconds when no Retry-After is present.
     *  Multiplied by 2^attempt for exponential growth. Default 250ms. */
    baseBackoffMs?: number;
}

/**
 * Wrap a transport call with automatic 429 retry, honoring Retry-After.
 *
 *   import { oc, withRateLimitRetry } from '@orangecheck/me-client';
 *
 *   const res = await withRateLimitRetry(() =>
 *     oc.event.fireBatch({ project_key, events })
 *   );
 *
 * Retries ONLY on 429 (rate-limit) responses. All other errors throw
 * immediately so the caller can handle them. Sleeps for `Retry-After`
 * seconds when present (capped at `maxRetryAfterSeconds`); otherwise
 * uses exponential backoff from `baseBackoffMs`.
 *
 * Per OCHK-V3-PLAN §12.6 — backpressure protocol. The server emits
 * 429 + Retry-After when a project crosses its 1000 events/sec sustained
 * cap; this helper honors it without integrators having to write the
 * sleep loop.
 *
 * Idempotency note: integrators using `event.fireBatch` should pass an
 * `idempotency_key` per event so a retry doesn't double-record. The
 * server collapses retried events to a `duplicate` status with the
 * prior payload.
 */
export async function withRateLimitRetry<T>(
    fn: () => Promise<T>,
    opts: WithRateLimitRetryOptions = {}
): Promise<T> {
    const maxRetries = opts.maxRetries ?? 2;
    const maxRetryAfter = opts.maxRetryAfterSeconds ?? 30;
    const baseBackoff = opts.baseBackoffMs ?? 250;
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err) {
            if (!(err instanceof MeClientError) || !err.isRateLimited) throw err;
            if (attempt >= maxRetries) throw err;
            let waitMs: number;
            if (err.retryAfterSeconds != null) {
                if (err.retryAfterSeconds > maxRetryAfter) throw err;
                waitMs = err.retryAfterSeconds * 1000;
            } else {
                waitMs = baseBackoff * 2 ** attempt;
            }
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            attempt++;
        }
    }
}
