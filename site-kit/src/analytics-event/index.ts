import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * A site's first-party Plausible event path, as a pages API route. The browser posts its page view
 * here (same origin, so it carries the site's cookies); the route sends Plausible only what Plausible
 * counts: the event, its Content-Type, the User-Agent and the client IP. Cookies, a bearer, the tab's
 * session pin, the referer and every other header stay on the site. Server only.
 *
 *   // src/pages/api/oc-insights/event.ts
 *   export { default } from '@orangecheck/site-kit/analytics-event';
 *
 * and the site's rewrite sends `/oc-insights/event` to `/api/oc-insights/event`.
 */

export const PLAUSIBLE_EVENT_URL = 'https://plausible.io/api/event';

/** An event is a few hundred bytes; anything past this is not one. */
const MAX_BODY = 8 * 1024;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}(%[0-9a-z]+)?$/i;

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')).trim();

const asIp = (s: string): string | undefined => {
    const ip = s.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
    return IPV4.test(ip) || (ip.includes(':') && IPV6.test(ip)) ? ip : undefined;
};

/** The visitor's address: Vercel's x-real-ip, else the first x-forwarded-for hop, else the socket's. */
export function clientIp(req: Pick<NextApiRequest, 'headers' | 'socket'>): string | undefined {
    return (
        asIp(first(req.headers['x-real-ip'])) ??
        asIp(first(req.headers['x-forwarded-for']).split(',')[0]!.trim()) ??
        asIp(req.socket?.remoteAddress ?? '')
    );
}

async function bodyText(req: NextApiRequest): Promise<string> {
    if (typeof req.body === 'string') return req.body;
    if (req.body != null) return JSON.stringify(req.body);
    // A route with bodyParser off: read the stream, no further than the cap.
    let text = '';
    for await (const chunk of req as AsyncIterable<Buffer | string>) {
        text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        if (text.length > MAX_BODY) break;
    }
    return text;
}

/** The handler for an upstream other than Plausible's: a site's own fixture in a test, say. */
export function createAnalyticsEvent(upstream: string = PLAUSIBLE_EVENT_URL) {
    return async function analyticsEvent(req: NextApiRequest, res: NextApiResponse): Promise<void> {
        res.setHeader('cache-control', 'no-store');
        if (req.method !== 'POST') {
            res.setHeader('allow', 'POST');
            res.status(405).end();
            return;
        }
        const body = await bodyText(req);
        if (body.length > MAX_BODY) {
            res.status(413).end();
            return;
        }
        // The allowlist: nothing else of the request is copied.
        const headers: Record<string, string> = { 'content-type': first(req.headers['content-type']) || 'text/plain' };
        const ua = first(req.headers['user-agent']);
        if (ua) headers['user-agent'] = ua;
        const ip = clientIp(req);
        if (ip) headers['x-forwarded-for'] = ip;
        try {
            const answer = await fetch(upstream, {
                method: 'POST',
                headers,
                body,
                credentials: 'omit',
                redirect: 'error',
                signal: AbortSignal.timeout(5000),
            });
            res.setHeader('content-type', answer.headers.get('content-type') ?? 'text/plain');
            res.status(answer.status).send(await answer.text());
        } catch {
            res.status(502).end();
        }
    };
}

/** Plausible's event, as a site's `src/pages/api/oc-insights/event.ts` re-exports it. */
const analyticsEvent = createAnalyticsEvent();
export default analyticsEvent;
