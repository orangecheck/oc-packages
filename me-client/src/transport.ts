/**
 * Tiny HTTP transport layer. The me.ochk.io origin is configurable so
 * staging deployments and self-hosted me-equivalents can swap it.
 */

let origin = 'https://me.ochk.io';

export function setOrigin(url: string): void {
    origin = url.replace(/\/$/, '');
}

export function getOrigin(): string {
    return origin;
}

export interface FetchOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
}

export async function api<T>(path: string, opts: FetchOptions = {}): Promise<T> {
    const res = await fetch(`${origin}${path}`, {
        method: opts.method ?? 'GET',
        credentials: 'include',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
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
