/**
 * @orangecheck/gate
 *
 * Drop-in sybil-resistance middleware. Wraps the OrangeCheck SDK's `check()`
 * primitive and turns it into a 403-or-next decision for any HTTP framework.
 *
 * Three ways to use it, pick the one that fits your stack:
 *
 *   // Express / Connect / Next Pages API
 *   import { ocGate } from '@orangecheck/gate';
 *   app.post('/post', ocGate({ minSats: 100_000, address: { from: 'header' } }), handler);
 *
 *   // Next Pages API via wrapper
 *   import { withOcGate } from '@orangecheck/gate';
 *   export default withOcGate(handler, { minSats: 100_000, address: { from: 'query' } });
 *
 *   // Fetch-style (App Router, Hono, Workers, Bun)
 *   import { ocGateFetch } from '@orangecheck/gate';
 *   const decision = await ocGateFetch(req, { minSats: 100_000, address: { from: 'header' } });
 *
 *   // Imperative primitive — works anywhere
 *   import { assertOc } from '@orangecheck/gate';
 *   const decision = await assertOc(req, { minSats: 100_000, address: { from: 'header' } });
 */

export { assertOc } from './core';
export { ocGate } from './express';
export { ocGateFetch, withOcGate } from './next';
export type { GateDecision, GateOptions, MinimalReq, MinimalRes, SubjectSource } from './types';
