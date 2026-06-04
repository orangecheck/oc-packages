import { describe, expect, it, vi } from 'vitest';

import { createInsightsClient, type InsightsClientConfig } from './index';

function okFetch() {
    return vi.fn(async () => new Response('{}', { status: 202 }));
}

function client(over: Partial<InsightsClientConfig> = {}, fetchImpl = okFetch()) {
    const c = createInsightsClient({
        url: 'https://insights.test/api/insights/ingest',
        token: 'test-token',
        fetch: fetchImpl as unknown as typeof fetch,
        ...over,
    });
    return { c, fetchImpl };
}

describe('insights-client', () => {
    it('is enabled with a token + url + fetch, disabled without a token', () => {
        expect(client().c.enabled).toBe(true);
        const noTok = createInsightsClient({ url: 'https://x', fetch: okFetch() as unknown as typeof fetch });
        expect(noTok.enabled).toBe(false);
    });

    it('POSTs a well-formed event with bearer auth + text/plain', async () => {
        const { c, fetchImpl } = client();
        await c.emit('attest', 'bip322_success', { scheme: 'p2wpkh', n: 1, ok: true });
        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe('https://insights.test/api/insights/ingest');
        expect(init.method).toBe('POST');
        expect(init.headers.authorization).toBe('Bearer test-token');
        expect(init.headers['content-type']).toBe('text/plain');
        expect(init.keepalive).toBe(true);
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({ product: 'attest', name: 'bip322_success' });
        expect(body.props).toEqual({ scheme: 'p2wpkh', n: 1, ok: true });
    });

    it('is an inert no-op when no token is configured (never calls fetch)', async () => {
        const fetchImpl = okFetch();
        const c = createInsightsClient({ url: 'https://x', fetch: fetchImpl as unknown as typeof fetch });
        await expect(c.emit('me', 'settlement')).resolves.toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('never rejects when fetch throws, and reports via onError', async () => {
        const onError = vi.fn();
        const fetchImpl = vi.fn(async () => {
            throw new Error('network down');
        });
        const { c } = client({ onError }, fetchImpl as unknown as ReturnType<typeof okFetch>);
        await expect(c.emit('vault', 'unseal')).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledOnce();
    });

    it('never rejects on a non-2xx response, and reports the status via onError', async () => {
        const onError = vi.fn();
        const fetchImpl = vi.fn(async () => new Response('no', { status: 500 }));
        const { c } = client({ onError }, fetchImpl as unknown as ReturnType<typeof okFetch>);
        await expect(c.emit('vote', 'ballot')).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledOnce();
        expect(String(onError.mock.calls[0]![0])).toContain('500');
    });

    it('drops malformed events (empty product or name) without calling fetch', async () => {
        const { c, fetchImpl } = client();
        await c.emit('', 'pageview');
        await c.emit('me', '   ');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('passes actor + eventClass + subtype through to the collector', async () => {
        const { c, fetchImpl } = client();
        await c.emitEvent({
            product: 'me',
            name: 'settlement',
            actor: 'bc1qexampleaddr',
            eventClass: 'B',
            subtype: 'session_creation',
        });
        const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
        expect(body.actor).toBe('bc1qexampleaddr');
        expect(body.eventClass).toBe('B');
        expect(body.subtype).toBe('session_creation');
    });

    it('clamps props to 30 keys and drops non-primitive values', async () => {
        const { c, fetchImpl } = client();
        const props: Record<string, unknown> = { good: 'x', nested: { a: 1 }, arr: [1, 2] };
        for (let i = 0; i < 40; i++) props[`k${i}`] = i;
        await c.emitEvent({ product: 'stamp', name: 'sign', props: props as Record<string, never> });
        const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
        expect(Object.keys(body.props).length).toBeLessThanOrEqual(30);
        expect(body.props.nested).toBeUndefined();
        expect(body.props.arr).toBeUndefined();
    });

    it('aborts the request after the timeout', async () => {
        let seenSignal: AbortSignal | undefined;
        // Mirror real fetch: reject with AbortError when the signal fires.
        const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
            const signal = init.signal as AbortSignal;
            seenSignal = signal;
            return new Promise<Response>((_resolve, reject) => {
                signal.addEventListener('abort', () =>
                    reject(new DOMException('Aborted', 'AbortError'))
                );
            });
        });
        const { c } = client({ timeoutMs: 5 }, fetchImpl as unknown as ReturnType<typeof okFetch>);
        await c.emit('agent', 'delegation_issued');
        expect(seenSignal?.aborted).toBe(true);
    });
});
