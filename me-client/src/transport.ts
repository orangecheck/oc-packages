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
        try {
            const data = (await res.json()) as { error?: string };
            if (data?.error) message = data.error;
        } catch {
            /* ignore */
        }
        throw new MeClientError(message, res.status);
    }
    return (await res.json()) as T;
}

export class MeClientError extends Error {
    public readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'MeClientError';
        this.status = status;
    }
}
