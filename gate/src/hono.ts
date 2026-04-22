import type { GateOptions } from './types';

import { ocGateFetch } from './next';

/**
 * Hono / edge-runtime adapter. Returns a Hono-compatible middleware function
 * that runs the OrangeCheck gate before `c.next()`.
 *
 *   import { Hono } from 'hono';
 *   import { ocGateHono } from '@orangecheck/gate';
 *
 *   const app = new Hono();
 *
 *   app.post(
 *       '/post',
 *       ocGateHono({ minSats: 100_000, address: { from: 'header' } }),
 *       postHandler,
 *   );
 *
 * Under the hood this is just `ocGateFetch` adapted to Hono's
 * `(c, next) => Promise<Response | void>` contract. The response on block
 * is a JSON 403 (401 on no_subject).
 */
// Same rationale as the Fastify adapter: no hard dep on `hono`, just
// duck-type its Context.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHonoContext = any;
type AnyNext = () => Promise<void>;

export function ocGateHono(opts: GateOptions) {
    return async function ocHonoMiddleware(
        c: AnyHonoContext,
        next: AnyNext
    ): Promise<Response | void> {
        // Hono gives us `c.req.raw` (the underlying Fetch Request).
        const req: Request = c.req.raw ?? c.req;
        const decision = await ocGateFetch(req, opts);

        if (opts.onDecision) {
            // Synthesize a MinimalReq so the callback has something useful.
            const headers: Record<string, string> = {};
            req.headers.forEach((v, k) => {
                headers[k.toLowerCase()] = v;
            });
            opts.onDecision({ headers, url: req.url, method: req.method }, decision);
        }

        if (decision.ok) {
            await next();
            return;
        }

        const body: Record<string, unknown> = {
            error: 'orangecheck_gate_blocked',
            reason: decision.reason,
        };
        if (opts.exposeSubject && decision.subject) {
            body.subject = decision.subject;
            body.subjectKind = decision.subjectKind;
        }
        if (decision.check?.reasons) body.reasons = decision.check.reasons;

        return new Response(JSON.stringify(body), {
            status: decision.reason === 'no_subject' ? 401 : 403,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
            },
        });
    };
}
