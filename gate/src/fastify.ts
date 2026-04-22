import type { GateOptions, MinimalReq } from './types';

import { assertOc, sendBlockedDefault } from './core';

/**
 * Fastify plugin-friendly adapter. Usage:
 *
 *   import Fastify from 'fastify';
 *   import { ocGateFastify } from '@orangecheck/gate';
 *
 *   const app = Fastify();
 *
 *   app.post('/post', {
 *       preHandler: ocGateFastify({
 *           minSats: 100_000,
 *           minDays: 30,
 *           address: { from: 'header' },
 *       }),
 *   }, postHandler);
 *
 * Fastify's `req` shape differs slightly from Express (`req.query` is always
 * an object, `req.headers` keys are lowercased, `req.body` is parsed per the
 * declared schema). The adapter marshals it into the framework-agnostic
 * MinimalReq shape the gate core expects, then short-circuits with a 403 via
 * Fastify's `reply.code().send()` on block.
 */
// The Fastify type surface is deliberately not imported — we don't want a
// hard dependency on fastify just for a ~20-line wrapper. Use `unknown`-typed
// request/reply and duck-type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastifyReq = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastifyReply = any;

export function ocGateFastify(opts: GateOptions) {
    return async function ocPreHandler(
        req: AnyFastifyReq,
        reply: AnyFastifyReply
    ): Promise<void> {
        const minimal: MinimalReq = {
            headers: req.headers ?? {},
            query: (req.query ?? {}) as Record<string, string | string[] | undefined>,
            body: req.body,
            url: req.url,
            method: req.method,
            cookies: req.cookies,
        };
        const decision = await assertOc(minimal, opts);
        if (opts.onDecision) opts.onDecision(minimal, decision);
        if (decision.ok) return;

        if (opts.onBlocked) {
            // Best-effort: pass a shim Res compatible with MinimalRes.
            const shim = {
                status(code: number) {
                    reply.code(code);
                    return shim;
                },
                json(body: unknown) {
                    reply.send(body);
                    return shim;
                },
                setHeader(name: string, value: string | number | readonly string[]) {
                    reply.header(name, value);
                    return shim;
                },
            };
            opts.onBlocked(minimal, shim, decision);
            return;
        }

        reply.header('Cache-Control', 'no-store');
        const shim = {
            status(code: number) {
                reply.code(code);
                return shim;
            },
            json(body: unknown) {
                reply.send(body);
                return shim;
            },
            setHeader(name: string, value: string | number | readonly string[]) {
                reply.header(name, value);
                return shim;
            },
        };
        sendBlockedDefault(shim, decision, opts);
    };
}
