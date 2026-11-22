/** The one way this server reads the network: a timeout, a size cap and errors that say what failed. */

export const VERSION = '0.1.1';
export const USER_AGENT = `orangecheck-mcp/${VERSION} (+https://ochk.io/docs/integration/mcp)`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type UpstreamFailure = 'timeout' | 'network' | 'status' | 'too_large' | 'body';

/** A read that failed, with enough to tell the person what to do next. */
export class UpstreamError extends Error {
    readonly url: string;
    readonly failure: UpstreamFailure;
    readonly status?: number;
    /** The network error's own code (ENOTFOUND, CERT_HAS_EXPIRED, ...), when there is one. */
    readonly code?: string;
    /** The response body, when the failure is a status and the body was small enough to keep. */
    readonly body?: string;

    constructor(
        url: string,
        failure: UpstreamFailure,
        message: string,
        extra: { status?: number; code?: string; body?: string } = {}
    ) {
        super(message);
        this.name = 'UpstreamError';
        this.url = url;
        this.failure = failure;
        this.status = extra.status;
        this.code = extra.code;
        this.body = extra.body;
    }
}

export interface ReadOptions {
    timeoutMs?: number;
    maxBytes?: number;
    accept?: string;
    redirect?: RequestRedirect;
}

export interface ReadResult {
    url: string;
    status: number;
    headers: Headers;
    /** The body, cut at maxBytes. */
    text: string;
    /** True when the body was longer than maxBytes. */
    truncated: boolean;
}

/** The code a fetch failure carries in its cause chain, e.g. ENOTFOUND or CERT_HAS_EXPIRED. */
export function errorCode(err: unknown): string | undefined {
    let e: unknown = err;
    for (let i = 0; i < 4 && e && typeof e === 'object'; i++) {
        const code = (e as { code?: unknown }).code;
        if (typeof code === 'string') return code;
        e = (e as { cause?: unknown }).cause;
    }
    return undefined;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    if (!res.body) return { bytes: new Uint8Array(), truncated: false };
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (total + value.byteLength > maxBytes) {
            chunks.push(value.subarray(0, maxBytes - total));
            total = maxBytes;
            truncated = true;
            await reader.cancel().catch(() => undefined);
            break;
        }
        chunks.push(value);
        total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
        bytes.set(c, at);
        at += c.byteLength;
    }
    return { bytes, truncated };
}

/**
 * One request, any status. Throws UpstreamError only when no answer came back
 * (timeout, DNS, TLS, refused connection).
 */
export async function request(fetchImpl: FetchLike, url: string, opts: ReadOptions = {}): Promise<ReadResult> {
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const maxBytes = opts.maxBytes ?? 4 * 1024 * 1024;
    let res: Response;
    try {
        res = await fetchImpl(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: opts.accept ?? '*/*' },
            redirect: opts.redirect ?? 'follow',
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') {
            throw new UpstreamError(url, 'timeout', `${url} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
        }
        const code = errorCode(err);
        throw new UpstreamError(url, 'network', `${url} could not be reached${code ? ` (${code})` : ''}.`, { code });
    }
    let body: { bytes: Uint8Array; truncated: boolean };
    try {
        body = await readCapped(res, maxBytes);
    } catch (err) {
        const name = (err as { name?: string } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') {
            throw new UpstreamError(url, 'timeout', `${url} did not finish answering within ${Math.round(timeoutMs / 1000)} seconds.`);
        }
        throw new UpstreamError(url, 'body', `${url} answered, but its body could not be read.`, { code: errorCode(err) });
    }
    return {
        url,
        status: res.status,
        headers: res.headers,
        text: new TextDecoder('utf-8', { fatal: false }).decode(body.bytes),
        truncated: body.truncated,
    };
}

/** A 2xx body as text, whole. Anything else is an UpstreamError. */
export async function getText(fetchImpl: FetchLike, url: string, opts: ReadOptions = {}): Promise<string> {
    const res = await request(fetchImpl, url, opts);
    if (res.status < 200 || res.status >= 300) {
        throw new UpstreamError(url, 'status', `${url} answered ${res.status}.`, {
            status: res.status,
            body: res.text.slice(0, 2000),
        });
    }
    if (res.truncated) {
        throw new UpstreamError(url, 'too_large', `${url} is larger than ${opts.maxBytes ?? 4 * 1024 * 1024} bytes.`);
    }
    return res.text;
}

/** A JSON body with its status: me.ochk.io answers its refusals as JSON too. */
export async function getJson(
    fetchImpl: FetchLike,
    url: string,
    opts: ReadOptions = {}
): Promise<{ status: number; body: unknown; headers: Headers }> {
    const res = await request(fetchImpl, url, { accept: 'application/json', maxBytes: 1024 * 1024, ...opts });
    let body: unknown;
    try {
        body = JSON.parse(res.text);
    } catch {
        throw new UpstreamError(url, 'body', `${url} answered ${res.status} with a body that is not JSON.`, {
            status: res.status,
            body: res.text.slice(0, 500),
        });
    }
    return { status: res.status, body, headers: res.headers };
}
