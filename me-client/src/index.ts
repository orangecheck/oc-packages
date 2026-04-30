/**
 * @orangecheck/me-client
 *
 * Drop-in client for me.ochk.io. Exports the canonical billable-event
 * taxonomy as TypeScript types, session lifecycle hooks, payment
 * authorization, integrator-config CRUD, agent-delegation issue/revoke,
 * webhook signature verification, the developer telemetry stream, and
 * the React sign-in button + `useOcSession` hook.
 *
 * Sign-in-with-OC. You pay for sessions and actions, not for clicks.
 */

export { OcSignInButton } from './SignInButton';
export type { OcSignInButtonProps } from './SignInButton';

// Re-export the React session primitives so integrators can pull every
// auth surface from a single package.
export { OcSessionProvider, useOcSession, useOptionalOcSession } from '@orangecheck/auth-client';
export type {
    OcAccount,
    OcSessionState,
    OcSessionStatus,
    OcAuthConfig,
} from '@orangecheck/auth-client';

export { session, onTelemetry } from './session';
export { payment } from './payment';
export { config } from './config';
export { webhook } from './webhook';
export type { OcPublicJwk, VerifyResult } from './webhook';
export { delegation } from './delegation';
export type { DelegationScope, DelegationEnvelope, IssueDelegationOptions } from './delegation';
export { event } from './event';
export type { FireEventOptions } from './event';
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
import { config } from './config';
import { webhook } from './webhook';
import { delegation } from './delegation';
import { event } from './event';

/** Convenience namespace mirroring the public API surface in /integrate
 *  code samples — `oc.session.create()`, `oc.payment.authorize()`,
 *  `oc.config.update()`, `oc.webhook.verify()`, `oc.delegation.issue()`,
 *  `oc.event.fire()`. */
export const oc = { session, payment, config, webhook, delegation, event };
