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
export { event } from './event';
export type { FireEventOptions, VerifyEventResult } from './event';
export { config } from './config';
export { webhook } from './webhook';
export type { OcPublicJwk, VerifyOptions, VerifyResult } from './webhook';
export { federations } from './federations';
export { scope } from './scope';
export type { Scope, GrantedOptions, GrantedResult, RequestOptions } from './scope';
export { family } from './family';
export type { FamilyVerb, FamilyScopesOptions, FamilyScopesResult } from './family';
export {
    setOrigin,
    getOrigin,
    setBearerToken,
    getBearerToken,
    clearBearerToken,
    MeClientError,
    withRateLimitRetry,
} from './transport';
export type { WithRateLimitRetryOptions } from './transport';

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
    Federation,
    FederationStatus,
    SigningMethod,
} from './types';

import { session } from './session';
import { payment } from './payment';
import { event } from './event';
import { config } from './config';
import { webhook } from './webhook';
import { federations } from './federations';
import { scope } from './scope';
import { family } from './family';

/** Convenience namespace mirroring the public API surface in /integrate
 *  code samples — `oc.session.create()`, `oc.payment.authorize()`,
 *  `oc.event.fire()`, `oc.config.validate()`, `oc.webhook.verify()`,
 *  `oc.federations.live()`, `oc.scope.granted()` / `oc.scope.request()`,
 *  `oc.family.scopes()`. */
export const oc = { session, payment, event, config, webhook, federations, scope, family };
