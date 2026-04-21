import type { GateDecision, GateOptions, MinimalReq, MinimalRes } from './types';

import { assertOc } from './core';

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
        res.status(403).json({
            error: decision.reason,
            subject: decision.subject,
            subjectKind: decision.subjectKind,
            ...(decision.check ? { orangecheck: decision.check } : {}),
        });
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
    let body: unknown = undefined;
    if (
        opts.address?.from === 'body' ||
        opts.attestationId?.from === 'body' ||
        opts.identity?.from === 'body'
    ) {
        try {
            const cloned = req.clone();
            const text = await cloned.text();
            body = text ? JSON.parse(text) : undefined;
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
