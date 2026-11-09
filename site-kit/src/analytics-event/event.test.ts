import type { NextApiRequest, NextApiResponse } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import analyticsEvent, { PLAUSIBLE_EVENT_URL } from './index';

const BODY = '{"n":"pageview","u":"https://vault.ochk.io/","d":"vault.ochk.io","r":null}';

function request(over: Partial<NextApiRequest> & { headers?: Record<string, string> } = {}): NextApiRequest {
    return {
        method: 'POST',
        body: BODY,
        socket: { remoteAddress: '10.0.0.9' },
        ...over,
        headers: {
            'content-type': 'text/plain',
            'user-agent': 'Mozilla/5.0 (probe)',
            cookie: 'oc_session=eyJ.session.sig; __Host-oc_session=eyJ.host.sig',
            authorization: 'Bearer eyJ.bearer.sig',
            'x-oc-tab-session': 'eyJ.tab.sig',
            'x-real-ip': '203.0.113.7',
            'x-forwarded-for': '203.0.113.7, 10.1.1.1',
            referer: 'https://vault.ochk.io/shares/abc',
            origin: 'https://vault.ochk.io',
            host: 'vault.ochk.io',
            ...over.headers,
        },
    } as unknown as NextApiRequest;
}

function response() {
    const out = { status: 0, headers: {} as Record<string, string>, body: undefined as string | undefined, ended: false };
    const res = {
        status(code: number) {
            out.status = code;
            return res;
        },
        setHeader(name: string, value: string) {
            out.headers[name.toLowerCase()] = value;
            return res;
        },
        send(body: string) {
            out.body = body;
            out.ended = true;
        },
        end() {
            out.ended = true;
        },
    };
    return { res: res as unknown as NextApiResponse, out };
}

function upstream(status = 202, text = 'ok') {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(text, { status, headers: { 'content-type': 'text/plain' } });
    }) as unknown as typeof fetch;
    return calls;
}

const sent = (init: RequestInit) => Object.fromEntries(new Headers(init.headers).entries());

const realFetch = globalThis.fetch;
afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('analyticsEvent: the page view goes on to Plausible with nothing of the visitor but what it counts', () => {
    it('sends exactly the body, Content-Type, User-Agent and the client IP: no cookie, bearer, tab pin, referer or origin', async () => {
        const calls = upstream();
        const { res } = response();
        await analyticsEvent(request(), res);
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(PLAUSIBLE_EVENT_URL);
        expect(calls[0]!.init.method).toBe('POST');
        expect(calls[0]!.init.body).toBe(BODY);
        expect(sent(calls[0]!.init)).toEqual({
            'content-type': 'text/plain',
            'user-agent': 'Mozilla/5.0 (probe)',
            'x-forwarded-for': '203.0.113.7',
        });
        expect(calls[0]!.init.credentials ?? 'omit').toBe('omit');
    });

    it('answers with what Plausible answered', async () => {
        upstream(202, 'ok');
        const { res, out } = response();
        await analyticsEvent(request(), res);
        expect(out.status).toBe(202);
        expect(out.body).toBe('ok');
        expect(out.headers['cache-control']).toBe('no-store');
    });

    it('takes the client IP from x-real-ip, else the first x-forwarded-for hop, else the socket', async () => {
        const calls = upstream();
        await analyticsEvent(request({ headers: { 'x-real-ip': '' } }), response().res);
        await analyticsEvent(request({ headers: { 'x-real-ip': '', 'x-forwarded-for': '' } }), response().res);
        await analyticsEvent(request({ headers: { 'x-real-ip': '2001:db8::7' } }), response().res);
        expect(calls.map((c) => sent(c.init)['x-forwarded-for'])).toEqual(['203.0.113.7', '10.0.0.9', '2001:db8::7']);
    });

    it('sends no IP that is not an address', async () => {
        const calls = upstream();
        await analyticsEvent(
            request({ headers: { 'x-real-ip': '203.0.113.7\r\nx-evil: 1', 'x-forwarded-for': 'not-an-ip' }, socket: {} as never }),
            response().res
        );
        expect(sent(calls[0]!.init)['x-forwarded-for']).toBeUndefined();
    });

    it('a parsed JSON body goes on as JSON text', async () => {
        const calls = upstream();
        const event = { n: 'pageview', u: 'https://vault.ochk.io/', d: 'vault.ochk.io' };
        await analyticsEvent(request({ body: event, headers: { 'content-type': 'application/json' } }), response().res);
        expect(calls[0]!.init.body).toBe(JSON.stringify(event));
        expect(sent(calls[0]!.init)['content-type']).toBe('application/json');
    });

    it('takes only POST', async () => {
        const calls = upstream();
        const { res, out } = response();
        await analyticsEvent(request({ method: 'GET' }), res);
        expect(out.status).toBe(405);
        expect(out.headers.allow).toBe('POST');
        expect(calls).toHaveLength(0);
    });

    it('a body over 8 KiB is refused before anything is sent', async () => {
        const calls = upstream();
        const { res, out } = response();
        await analyticsEvent(request({ body: 'x'.repeat(8 * 1024 + 1) }), res);
        expect(out.status).toBe(413);
        expect(calls).toHaveLength(0);
    });

    it('Plausible unreachable answers 502, without throwing', async () => {
        globalThis.fetch = vi.fn(async () => {
            throw new TypeError('fetch failed');
        }) as unknown as typeof fetch;
        const { res, out } = response();
        await analyticsEvent(request(), res);
        expect(out.status).toBe(502);
    });
});
