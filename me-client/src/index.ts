/**
 * @orangecheck/me-client
 *
 * Drop-in client for me.ochk.io. Sign-in-with-OC. You pay for sessions
 * and actions, not for clicks.
 *
 * Three entry points for three audiences:
 *
 *   import { ... } from '@orangecheck/me-client'         // React surface
 *   import { ... } from '@orangecheck/me-client/server'  // server-side
 *                                                          verification
 *                                                          (Next.js, Express,
 *                                                           Hono — all without
 *                                                           env vars or JWK
 *                                                           handling)
 *   import { signInWithOc } from '@orangecheck/me-client/popup'
 *                                                       // browser-only popup
 *                                                          orchestrator
 *
 * Server-side verification example:
 *
 *   // pages/api/me.ts
 *   import { withOcAuth } from '@orangecheck/me-client/server';
 *
 *   export default withOcAuth(async (req, res) => {
 *     if (!req.ocSession) return res.status(401).json({ ok: false });
 *     res.status(200).json({ address: req.ocSession.addr });
 *   });
 *
 * Popup signin example:
 *
 *   import { signInWithOc } from '@orangecheck/me-client/popup';
 *
 *   button.addEventListener('click', async () => {
 *     const result = await signInWithOc();
 *     if (!result) return; // user cancelled
 *     localStorage.setItem('oc-token', result.token);
 *     location.assign('/dashboard');
 *   });
 */

export { OcSignInButton } from './SignInButton';
export type { OcSignInButtonProps } from './SignInButton';

export { session, onTelemetry } from './session';
export { payment } from './payment';
export { setOrigin, getOrigin, MeClientError } from './transport';

export {
    PLATFORM_FEE_POLICY,
    MIN_INTEGRATOR_PRICE_SATS,
    computeFees,
    validateIntegratorConfig,
} from './types';

export type {
    EventClass,
    EventSubtype,
    ClassASubtype,
    ClassBSubtype,
    ClassCSubtype,
    AttestTier,
    SiteFeeShape,
    IntegratorEventConfig,
    IntegratorPriceConfig,
    ComputedFees,
    ValidationResult,
    BillableEvent,
    Session,
    SessionPolicy,
    SignInOptions,
    PaymentAuthorizeOptions,
    PaymentResult,
    TelemetryEvent,
} from './types';

import { session } from './session';
import { payment } from './payment';

/** Convenience namespace mirroring the public API surface in /integrate
 *  code samples — `oc.session.create()`, `oc.payment.authorize()`. */
export const oc = { session, payment };
