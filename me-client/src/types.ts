/**
 * Canonical types for me.ochk.io integrators.
 *
 * Mirrors the source of truth at oc-me-web/src/lib/events/types.ts. Two
 * layers:
 *   - Platform-level (PLATFORM_FEE_POLICY, MIN_INTEGRATOR_PRICE_SATS) —
 *     fixed by OC, surfaced as constants here so integrators can validate
 *     their config client-side before posting it.
 *   - Integrator-level (IntegratorPriceConfig) — every integrator declares
 *     their own per-event prices and user-share splits.
 *
 * Per Addendum 01: every chargeable event is in exactly one of three
 * classes. Sites pay for sessions and actions, not for clicks. Free
 * events never instantiate a BillableEvent.
 */

// ── platform constants (fixed by OC) ──────────────────────────────────────

export const PLATFORM_FEE_POLICY = {
    /** Fraction of every gross_fee that OC retains. */
    pct: 0.2,
    /** Absolute minimum platform fee, in sats. */
    min_floor_sats: 1,
    /** Date this policy was last ratified. Changes require a versioned
     *  @orangecheck/me-client release. */
    ratified: '2026-04-30',
} as const;

/** Anti-spam price floor. No integrator can configure a per-event price
 *  below this. */
export const MIN_INTEGRATOR_PRICE_SATS = 5;

// ── event taxonomy ────────────────────────────────────────────────────────

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

/** The shape of a per-event fee — either a fixed sats amount or a percent
 *  of the underlying transaction amount (used for payments + pledges). */
export type SiteFeeShape =
    | { kind: 'fixed_sats'; sats: number }
    | { kind: 'percent_of_amount'; pct: number };

/** What an integrator declares for a single event subtype. */
export interface IntegratorEventConfig {
    /** Whether this site bills this event subtype at all. */
    enabled: boolean;
    /** The per-event fee the site pays. */
    site_pays: SiteFeeShape;
    /** Fraction of post-platform-fee that flows to the user (0–0.8 since
     *  platform_fee is 20%). The remainder is a rebate to the site's OC
     *  project balance. */
    user_share_pct: number;
}

/** A complete integrator pricing config. Posted to me.ochk.io once at
 *  integration time, mutable via the configurator UI or this SDK any time
 *  after. */
export interface IntegratorPriceConfig {
    project_key: string;
    display_name: string;
    domain: string;
    /** ISO-8601 timestamp the config was last updated. */
    updated_at: string;
    /** Per-subtype configs. Subtypes not listed are disabled by default. */
    events: Partial<Record<EventSubtype, IntegratorEventConfig>>;
}

/** A computed fee breakdown for a single event. site_rebate_sats is what
 *  flows back to the integrator's OC balance after OC's platform fee and
 *  the user's cashback. */
export interface ComputedFees {
    gross_fee_sats: number;
    platform_fee_sats: number;
    user_earned_sats: number;
    site_rebate_sats: number;
}

/** Compute the four-way fee split for an event given an integrator's
 *  config and (for percent_of_amount events) the underlying payment
 *  amount.
 *
 *  Invariants (verified by tests in oc-me-web/src/lib/events/types.test.ts):
 *    1. gross_fee_sats >= MIN_INTEGRATOR_PRICE_SATS
 *    2. platform_fee_sats >= PLATFORM_FEE_POLICY.min_floor_sats
 *    3. user_share_pct is clamped to [0, 0.8]
 *    4. site_rebate_sats >= 0
 *    5. gross == platform + user + rebate (exact, modulo rounding into rebate)
 */
export function computeFees(
    cfg: IntegratorEventConfig,
    payment_amount_sats?: number
): ComputedFees {
    let gross = 0;
    if (cfg.site_pays.kind === 'fixed_sats') {
        gross = Math.max(MIN_INTEGRATOR_PRICE_SATS, Math.round(cfg.site_pays.sats));
    } else {
        if (payment_amount_sats == null) {
            throw new Error('percent_of_amount config requires payment_amount_sats');
        }
        gross = Math.max(
            MIN_INTEGRATOR_PRICE_SATS,
            Math.round(payment_amount_sats * cfg.site_pays.pct)
        );
    }
    const platform_fee_sats = Math.max(
        PLATFORM_FEE_POLICY.min_floor_sats,
        Math.round(gross * PLATFORM_FEE_POLICY.pct)
    );
    const user_share = Math.min(0.8, Math.max(0, cfg.user_share_pct));
    const user_earned_sats = Math.round(gross * user_share);
    const site_rebate_sats = Math.max(0, gross - platform_fee_sats - user_earned_sats);
    return { gross_fee_sats: gross, platform_fee_sats, user_earned_sats, site_rebate_sats };
}

/** Result of validating an IntegratorPriceConfig. */
export interface ValidationResult {
    ok: boolean;
    errors: { subtype?: EventSubtype; message: string }[];
}

/**
 * Validate an integrator's pricing config against the platform's
 * non-negotiable rules. Run client-side before posting; the server runs
 * the same checks and rejects anything that fails.
 */
export function validateIntegratorConfig(cfg: IntegratorPriceConfig): ValidationResult {
    const errors: ValidationResult['errors'] = [];

    if (!cfg.project_key) errors.push({ message: 'project_key is required' });
    if (!cfg.display_name) errors.push({ message: 'display_name is required' });
    if (!cfg.domain) errors.push({ message: 'domain is required' });

    for (const [key, eventCfg] of Object.entries(cfg.events)) {
        if (!eventCfg) continue;
        const subtype = key as EventSubtype;
        if (!eventCfg.enabled) continue;

        if (eventCfg.site_pays.kind === 'fixed_sats') {
            if (eventCfg.site_pays.sats < MIN_INTEGRATOR_PRICE_SATS) {
                errors.push({
                    subtype,
                    message: `site_pays.sats (${eventCfg.site_pays.sats}) is below MIN_INTEGRATOR_PRICE_SATS (${MIN_INTEGRATOR_PRICE_SATS})`,
                });
            }
        } else {
            const pct = eventCfg.site_pays.pct;
            if (!(pct > 0 && pct <= 1)) {
                errors.push({
                    subtype,
                    message: `site_pays.pct (${pct}) must be in (0, 1]`,
                });
            }
        }

        const u = eventCfg.user_share_pct;
        if (u < 0 || u > 0.8) {
            errors.push({
                subtype,
                message: `user_share_pct (${u}) must be in [0, 0.8]; max is 0.8 because platform_fee is ${PLATFORM_FEE_POLICY.pct}`,
            });
        }
    }

    return { ok: errors.length === 0, errors };
}

// ── canonical envelope ────────────────────────────────────────────────────

export interface BillableEvent {
    id: string;
    occurred_at: string;
    class: EventClass;
    subtype: EventSubtype;
    site: { domain: string; display_name: string };
    gross_fee_sats: number;
    platform_fee_sats: number;
    user_earned_sats: number;
    site_rebate_sats: number;
    verify_url: string;
}

// ── session lifecycle ────────────────────────────────────────────────────

export interface SessionPolicy {
    duration_seconds: number;
    refresh: 'sliding' | 'rolling' | 'none';
    sensitive_actions?: 're-auth' | 'none';
}

export interface Session {
    id: string;
    identity: string;
    opens_at: string;
    expires_at: string;
    policy: SessionPolicy;
    scope: string[];
}

export interface SignInOptions {
    scope: string[];
    sessionPolicy?: Partial<SessionPolicy>;
    returnTo?: string;
}

export interface PaymentAuthorizeOptions {
    identity: string;
    amount_sats?: number;
    usd_cents?: number;
    description: string;
    external_ref?: string;
}

export interface PaymentResult {
    id: string;
    status: 'authorized' | 'failed' | 'cancelled';
    sats_charged?: number;
    user_envelope_id?: string;
    verify_url?: string;
}

export interface TelemetryEvent {
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
