import type { GateDecision, GateOptions, MinimalReq, MinimalRes } from './types';

import { assertOc, sendBlockedDefault } from './core';

/** Cap the amount of body we'll parse for a `body: ...` subject source.
 * Without this a 100 MB POST ties up the gate before any downstream limiter
 * runs. 64 KB is plenty for a subject field. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Next.js Pages Router API wrapper.
 *
 *   import { withOcGate } from '@orangecheck/gate';
 *
 *   async function handler(req, res) {
 *     // The decision is attached to req when the gate lets the call through.
 *     res.json({ hello: (req as any).orangecheck.sats });
 *   }
 *
 *   export default withOcGate(handler, {
 *     minSats: 100_000,
 *     minDays: 30,
 *     address: { from: 'query', name: 'addr' },
 *   });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOcGate<H extends (req: any, res: any) => any>(
    handler: H,
    opts: GateOptions
): H {
    const wrapped = async (req: MinimalReq, res: MinimalRes) => {
        const decision = await assertOc(req, opts);
        if (opts.onDecision) opts.onDecision(req, decision);

        if (decision.ok) {
            // Attach decision to the request for the downstream handler.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (req as any).orangecheck = decision.check;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (handler as any)(req, res);
        }

        if (opts.onBlocked) {
            opts.onBlocked(req, res, decision);
            return;
        }

        res.setHeader('Cache-Control', 'no-store');
        sendBlockedDefault(res, decision, opts);
    };
    return wrapped as unknown as H;
}

/**
 * Framework-agnostic Fetch-style guard — for Next App Router route handlers,
 * Cloudflare Workers, Hono, Bun, and friends.
 *
 *   export async function POST(req: Request) {
 *     const decision = await ocGateFetch(req, {
 *       minSats: 100_000,
 *       address: { from: 'header' },
 *     });
 *     if (!decision.ok) {
 *       return new Response(JSON.stringify({ error: decision.reason }), { status: 403 });
 *     }
 *     // ... proceed
 *   }
 */
export async function ocGateFetch(req: Request, opts: GateOptions): Promise<GateDecision> {
    const url = new URL(req.url);

    // Build a MinimalReq adapter over the Fetch Request.
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
    });

    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => {
        query[k] = v;
    });

    // Body is opaque at guard time — only parsed if the caller asks for body: *.
    // Caps at MAX_BODY_BYTES so a large POST can't stall the gate.
    let body: unknown = undefined;
    if (
        opts.address?.from === 'body' ||
        opts.attestationId?.from === 'body' ||
        opts.identity?.from === 'body'
    ) {
        try {
            const cloned = req.clone();
            const contentLen = Number(cloned.headers.get('content-length') ?? '0');
            if (contentLen > MAX_BODY_BYTES) {
                body = undefined;
            } else {
                const text = await cloned.text();
                if (text.length <= MAX_BODY_BYTES) {
                    body = text ? JSON.parse(text) : undefined;
                }
            }
        } catch {
            body = undefined;
        }
    }

    const minimal: MinimalReq = {
        headers,
        query,
        body,
        url: req.url,
        method: req.method,
    };
    return assertOc(minimal, opts);
}
