import type { GateOptions, MinimalReq, MinimalRes } from './types';

import { assertOc, sendBlockedDefault } from './core';

/**
 * Express / Connect / Next-pages-API middleware.
 *
 *   import { ocGate } from '@orangecheck/gate';
 *
 *   app.post(
 *     '/post',
 *     ocGate({
 *       minSats: 100_000,
 *       minDays: 30,
 *       address: { from: 'header' },   // reads X-OC-Address
 *     }),
 *     postHandler,
 *   );
 *
 * On block: sends `403 { error: '<reason>', orangecheck: <CheckResult|null> }`
 * unless `opts.onBlocked` is provided.
 */
export function ocGate(opts: GateOptions) {
    return async function gateMiddleware(
        req: MinimalReq,
        res: MinimalRes,
        next: (err?: unknown) => void
    ): Promise<void> {
        const decision = await assertOc(req, opts);

        if (opts.onDecision) opts.onDecision(req, decision);

        if (decision.ok) {
            next();
            return;
        }

        if (opts.onBlocked) {
            opts.onBlocked(req, res, decision);
            return;
        }

        res.setHeader('Cache-Control', 'no-store');
        sendBlockedDefault(res, decision, opts);
    };
}
