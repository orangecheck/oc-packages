/**
 * @orangecheck/me-client
 *
 * Drop-in client for me.ochk.io. Exports the canonical billable-event
 * taxonomy as TypeScript types, session lifecycle hooks, payment
 * authorization, the developer telemetry stream, and the React sign-in
 * button.
 *
 * Sign-in-with-OC. You pay for sessions and actions, not for clicks.
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
