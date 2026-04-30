/**
 * Canonical billable-event taxonomy for me.ochk.io.
 *
 * Mirrors the source of truth at oc-me-web/src/lib/events/types.ts. Per
 * Addendum 01: every chargeable event is in exactly one of three classes.
 * Sites pay for sessions and actions, not for clicks. Free events
 * (intra-session signin, refresh, failed/cancelled, navigation, passive
 * verify) never instantiate a BillableEvent — they hit the developer
 * telemetry stream but not the billing system.
 */

export type EventClass = 'A' | 'B' | 'C';

export type ClassASubtype =
    | 'account_creation'
    | 'account_recovery'
    | 'kyc_tier_upgrade'
    | 'payment_method_connected'
    | 'agent_delegation_issued'
    | 'recovery_method_updated';

export type ClassBSubtype =
    | 'payment_authorization'
    | 'scoped_action_authorization'
    | 'attest_verification_at_gate'
    | 'stamp_signing'
    | 'pledge_resolution';

export type ClassCSubtype = 'session_creation';

export type EventSubtype = ClassASubtype | ClassBSubtype | ClassCSubtype;

export type AttestTier = 'anonymous' | 'bonded' | 'kyc_light' | 'kyc_strong';

export interface BillableEvent {
    id: string;
    occurred_at: string;
    class: EventClass;
    subtype: EventSubtype;
    site: { domain: string; display_name: string };
    gross_fee_sats: number;
    platform_fee_sats: number;
    user_earned_sats: number;
    verify_url: string;
}

export interface SessionPolicy {
    /** Duration of a single session window in seconds. Site declares this at
     *  integration time; the OC verifier enforces it. */
    duration_seconds: number;
    /** How tokens refresh inside the window. `sliding` extends on activity,
     *  `rolling` rotates on a fixed cadence, `none` is fixed-window. */
    refresh: 'sliding' | 'rolling' | 'none';
    /** What the site requires for high-stakes intra-session actions.
     *  `re-auth` re-opens the OC consent flow (a fresh Class C billable
     *  event); `none` accepts the session as-is. */
    sensitive_actions?: 're-auth' | 'none';
}

export interface Session {
    id: string;
    /** The OC identity (Bitcoin address) the session is bound to. */
    identity: string;
    opens_at: string;
    expires_at: string;
    policy: SessionPolicy;
    scope: string[];
}

export interface SignInOptions {
    scope: string[];
    sessionPolicy?: Partial<SessionPolicy>;
    /** Where to return after the OC consent flow. Defaults to the current
     *  page's origin + path. */
    returnTo?: string;
}

export interface PaymentAuthorizeOptions {
    /** OC identity (Bitcoin address) of the signed-in user. */
    identity: string;
    /** Amount in sats. Use this OR usd_cents, not both. */
    amount_sats?: number;
    /** Amount in USD cents. Use this OR amount_sats, not both. */
    usd_cents?: number;
    /** Free-text description shown to the user during consent. */
    description: string;
    /** Optional integrator-side reference id propagated into the envelope. */
    external_ref?: string;
}

export interface PaymentResult {
    id: string;
    status: 'authorized' | 'failed' | 'cancelled';
    sats_charged?: number;
    user_envelope_id?: string;
    /** URL that the user can visit to see this event on their /me/earn. */
    verify_url?: string;
}

export interface TelemetryEvent {
    /** Non-billable telemetry codes per oc-me-web's NON_BILLABLE_EVENTS. */
    code:
        | 'session.intra_signin'
        | 'session.token_refresh'
        | 'session.navigation'
        | 'auth.signin_failed'
        | 'auth.signin_cancelled'
        | 'auth.signin_rejected'
        | 'verify.passive_check';
    timestamp: string;
    session_id?: string;
}
