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

/** Per-event price floor. 1 sat — the natural atomic Bitcoin unit.
 *  Integrators choose their own per-event prices above this; OC does
 *  not impose sybil-resistance opinions on integrators (that's their
 *  call, from their own threat model). The 1-sat floor is purely
 *  mechanical — fees can't be fractional sats. Mirrors the canonical
 *  value at oc-me-web/src/lib/events/types.ts (a previous SDK release
 *  drifted to 5 while the platform ratified 1). */
export const MIN_INTEGRATOR_PRICE_SATS = 1;

/** Platform ceiling on drop-period windows: no integrator schedule may
 *  hold a user's earned share open longer than this, regardless of
 *  cadence. Published in ABUSE_LIMITS on me.ochk.io /trust + /security. */
export const MAX_DROP_WINDOW_DAYS = 92;

// ── event taxonomy ────────────────────────────────────────────────────────

export type EventClass = 'A' | 'B' | 'C';

export type ClassASubtype =
    | 'account_creation'
    | 'account_recovery'
    | 'attest_bond_increased'
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

/** AttestTier · what an integrator's gate can read about an oc identity.
 *
 *  me.ochk does NOT do KYC. Sybil resistance is bounded by three
 *  composable mechanisms, none of which involve OC handling PII:
 *    1. paid-action history · billable events cost real sats
 *    2. BIP-322 sat-bonding · bond size + age via signed attestation
 *    3. integrator-defined gates · per-site threat-model overlays
 *
 *  Tier itself is intentionally simple — anonymous | bonded.
 *  Granularity (bond_sats, bond_locked_at, etc) carried separately. */
export type AttestTier = 'anonymous' | 'bonded';

/** The shape of a per-event fee — either a fixed sats amount or a percent
 *  of the underlying transaction amount (used for payments + pledges). */
export type SiteFeeShape =
    | { kind: 'fixed_sats'; sats: number }
    | { kind: 'percent_of_amount'; pct: number };

/** Optional per-class pricing overrides · per OCHK-V3-PLAN §7 phase-1.
 *  Agents acting under a scoped oc-agent delegation may bill
 *  differently than humans firing the same subtype. When `agent` is
 *  unset on a subtype, agent traffic bills at the human rate. `refuse:
 *  true` makes the subtype human-only — the endpoint returns 422
 *  agent_refused for is_agent=true requests. */
export interface AgentClassOverride {
    /** Override site_pays for agent-fired events. */
    site_pays?: SiteFeeShape;
    /** Override user_share_pct. Same default-fallback as site_pays. */
    user_share_pct?: number;
    /** When true, agent traffic is refused for this subtype. */
    refuse?: boolean;
}

/** What an integrator declares for a single event subtype. */
export interface IntegratorEventConfig {
    /** Whether this site bills this event subtype at all. */
    enabled: boolean;
    /** The per-event fee the site pays. */
    site_pays: SiteFeeShape;
    /** Fraction of GROSS that flows to the user (0–0.8 since the
     *  platform fee is 20%). The remainder is a rebate to the site's
     *  OC project balance. */
    user_share_pct: number;
    /** Optional per-agent-class pricing override applied when an event
     *  fires with is_agent=true. */
    agent?: AgentClassOverride;
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
 *  amount. MIRRORS oc-me-web/src/lib/events/types.ts computeFees()
 *  EXACTLY — the SDK-side replay (oc.event.verify) re-runs this against
 *  envelopes the server billed, so any drift is a false "divergence".
 *
 *  Invariants:
 *    1. gross_fee_sats >= MIN_INTEGRATOR_PRICE_SATS (1-sat atomic floor)
 *    2. platform_fee_sats = min(gross, max(min_floor, round(gross × pct)))
 *       — bounded above by gross so a 1-sat event can't owe more
 *       platform fee than it grossed
 *    3. user_earned_sats = min(gross − platform, round(gross × share)),
 *       share clamped to [0, 0.8]
 *    4. site_rebate_sats = gross − platform − user (exact remainder)
 *    5. gross == platform + user + rebate exactly
 *
 *  When `opts.is_agent` is true AND the config has an `agent` override,
 *  the agent's site_pays / user_share_pct apply. `agent.refuse: true`
 *  throws 'agent_refused' (the server maps it to 422). */
export function computeFees(
    cfg: IntegratorEventConfig,
    payment_amount_sats?: number,
    opts?: { is_agent?: boolean }
): ComputedFees {
    const is_agent = opts?.is_agent === true;
    if (is_agent && cfg.agent?.refuse) {
        throw new Error('agent_refused');
    }
    const effective_site_pays =
        is_agent && cfg.agent?.site_pays ? cfg.agent.site_pays : cfg.site_pays;
    const effective_user_share_pct =
        is_agent && typeof cfg.agent?.user_share_pct === 'number'
            ? cfg.agent.user_share_pct
            : cfg.user_share_pct;

    let gross = 0;
    if (effective_site_pays.kind === 'fixed_sats') {
        gross = Math.max(MIN_INTEGRATOR_PRICE_SATS, Math.round(effective_site_pays.sats));
    } else {
        if (payment_amount_sats == null) {
            throw new Error('percent_of_amount config requires payment_amount_sats');
        }
        gross = Math.max(
            MIN_INTEGRATOR_PRICE_SATS,
            Math.round(payment_amount_sats * effective_site_pays.pct)
        );
    }
    const platform_fee_sats = Math.min(
        gross,
        Math.max(PLATFORM_FEE_POLICY.min_floor_sats, Math.round(gross * PLATFORM_FEE_POLICY.pct))
    );
    const user_share = Math.min(0.8, Math.max(0, effective_user_share_pct));
    const user_earned_sats = Math.min(gross - platform_fee_sats, Math.round(gross * user_share));
    const site_rebate_sats = gross - platform_fee_sats - user_earned_sats;
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
    /** Per OCHK-V3-PLAN §7 phase-1 · true when the event was fired by
     *  an oc-agent delegation rather than a human session. The
     *  integrator's IntegratorEventConfig.agent block may price
     *  these differently or refuse them. Optional · canonical encoder
     *  branches to v=3 only when present, so legacy human-fired
     *  events keep their v=2 hash + signature. */
    is_agent?: boolean;
    /** Drop-period stamp · present when the project covers this
     *  subtype with a drop schedule. The user-share of a stamped event
     *  MATURES until the window's boundary, then vests as one batch
     *  (the drop). Billing is untouched. Part of the SIGNED canonical
     *  bytes (encoder branches to v=4 when present). No clawback
     *  exists — vesting is unconditional, and an open window's
     *  boundary can only ever move earlier. */
    drop?: {
        /** Deterministic window id · the window's signed manifest is
         *  verifiable at me.ochk.io/verify/<manifest_id> after close. */
        window_id: string;
        /** Block-denominated vesting boundary; null when no chain tip
         *  was observable at window open (wallclock + the published
         *  24h safety valve then govern). */
        close_height_target: number | null;
    } | null;
}

// ── drop periods · integrator-scheduled payout windows ───────────────────

/** A drop schedule's cadence. Weekly/monthly close at a fixed UTC
 *  boundary; manual closes when the integrator says (Drop now), with a
 *  hard auto-close at max_open_days (≤ MAX_DROP_WINDOW_DAYS). */
export type DropCadence =
    | { kind: 'weekly'; day: number; hour: number }
    | { kind: 'monthly'; day: number; hour: number }
    | { kind: 'manual'; max_open_days: number };

/** Public shape of an enabled drop schedule, as returned in the
 *  `drops` array of GET /api/integrator/config — part of the project's
 *  public payout contract (earners can see when covered subtypes pay
 *  out before earning under them). */
export interface DropScheduleSummary {
    schedule_id: string;
    label: string;
    subtypes: EventSubtype[];
    cadence: DropCadence;
}

/** Drop-period context on event-ingest responses (single route:
 *  top-level `drop`; batch route: per-result `drop`). `state` flips
 *  from 'open' to 'closing' once the scheduled boundary passes and the
 *  window awaits its sweep (~15 min) — render "processing", never a
 *  negative countdown. */
export interface DropResponseBlock {
    window_id: string;
    label: string;
    state: 'open' | 'closing';
    closes_at_target: string;
    close_height_target: number | null;
}

// ── webhook payload ───────────────────────────────────────────────────────

/**
 * The exact JSON body delivered to a registered webhook endpoint when
 * a billable event fires. Imported by integrator backends so the
 * receive handler is type-checked end-to-end without re-declaring the
 * shape.
 *
 *   import type { WebhookPayload } from '@orangecheck/me-client';
 *
 *   export async function POST(req: Request) {
 *     const payload = (await req.json()) as WebhookPayload;
 *     if (payload.subtype === 'payment_authorization') {
 *       creditUser(payload.sub, payload.user_earned_sats);
 *     }
 *   }
 *
 * Headers carry the signature and metadata (see WebhookHeaders below).
 * Verify the signature with `oc.webhook.verify({ body, headers, jwks })`.
 *
 * Privacy contract · the master oc identity is NEVER in the payload.
 * Integrators see `sub` (per-integrator anonymous id) plus any
 * `scopes` the user explicitly granted. See PRIVACY-ARCHITECTURE.md.
 */
export interface WebhookPayload extends BillableEvent {
    /** Discriminator · identifies the payload kind for routing on
     *  the integrator's side. Always 'oc-billable-event' today; future
     *  webhook payload kinds (refunds, charters, etc) will use
     *  distinct discriminator values. */
    kind: 'oc-billable-event';
    /** Per-integrator anonymous subject id · stable across events for
     *  the same (oc_identity, project_key) pair. Key your user records
     *  on this; OC will never give you the master address unless the
     *  user explicitly grants `bitcoin_address` or `email` scope. */
    sub: string;
    /** Resolved scoped fields · only present for scopes the user has
     *  granted to this project. Wire format is string-keyed (every
     *  value is stringified · ints stringified, addresses as-is). */
    scopes?: Partial<
        Record<
            | 'bitcoin_address'
            | 'email'
            | 'attest_tier'
            | 'display_name'
            | 'cross_integrator_event_count'
            | 'cross_integrator_human_event_count'
            | 'trust_attestation_count'
            | 'trust_attestations_bundle',
            string
        >
    >;
}

/**
 * Non-billable SYSTEM webhook deliveries — project-level operational
 * signals (escrow.low, escrow.depleted, escrow.recovered, drop.closed).
 * Same signing + headers as billable deliveries; receivers subscribe
 * via the same `subscribed` list ('*' or the explicit subtype string).
 * Carries no user identity. Discriminate on `kind` first, then
 * `subtype`:
 *
 *   const payload = JSON.parse(body) as WebhookPayload | SystemWebhookPayload;
 *   if (payload.kind === 'oc-system-event' && payload.subtype === 'drop.closed') { … }
 */
export interface SystemWebhookPayload {
    kind: 'oc-system-event';
    subtype: string;
    project_key: string;
    [extra: string]: unknown;
}

/** The `drop.closed` system event — one per closed drop window. The
 *  manifest is the signed, content-addressed record (Merkle commitments
 *  over member events + recipients); verify_url renders + live-verifies
 *  it, and /api/envelope/<manifest_id> serves the raw canonical bytes. */
export interface DropClosedWebhookPayload extends SystemWebhookPayload {
    subtype: 'drop.closed';
    window_id: string;
    schedule_id: string;
    label: string;
    manifest_id: string;
    verify_url: string;
    sealed_at: string;
    sealed_height: number | null;
    event_count: number;
    recipient_count: number;
    gross_fee_sats: number;
    user_share_sats: number;
}

/**
 * HTTP headers OC sends with every webhook delivery. Capture these in
 * the receive handler · `OC-Signature` is what verifies the body.
 */
export interface WebhookHeaders {
    /** Ed25519 signature over the raw response body, hex-encoded. */
    'OC-Signature': string;
    /** Stable kid of the signing key · resolves against
     *  ochk.io/.well-known/jwks.json. */
    'OC-Key-Id': string;
    /** Envelope id · matches payload.id; useful for idempotent
     *  receive handlers that dedupe on this header without parsing
     *  the body. */
    'OC-Envelope-Id': string;
    /** Subtype · matches payload.subtype; lets routers branch on the
     *  header before parsing. */
    'OC-Subtype': EventSubtype;
    /** Class · matches payload.class. */
    'OC-Class': EventClass;
    /** 1-indexed delivery attempt count. >1 means the prior attempt
     *  did not return a 2xx within the timeout · idempotency key on
     *  payload.id is critical. */
    'OC-Delivery-Attempt': string;
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

// ── federation directory ───────────────────────────────────────────────
//
// The SDK consumes the federation directory at runtime so multi-federation
// routing is a directory write, not a code change. v1 has one live
// federation; the directory is plural-shaped so federation #2 lights up
// without an SDK release.

export type FederationStatus = 'recruiting' | 'forming' | 'binding' | 'live';

/** Federation directory entry. Mirrors `oc-me-web/src/lib/federations/registry.ts`
 *  field-for-field; this package is the public consumption shape. */
export interface Federation {
    slug: string;
    name: string;
    status: FederationStatus;
    threshold: string;
    target_guardian_count: number;
    /** Fedimint invite code; null until status === 'live'. */
    invite: string | null;
    /** SHA-256 of the canonical federation charter, hex-encoded. */
    charter_hash: string | null;
    /** ISO-8601 of the most recent ongoing-attestation envelope. */
    last_attestation_at: string | null;
    geography_hint: string;
    // Operator-recruiting fields (present on slots in 'recruiting' /
    // 'forming' / 'binding' state). Nullable so one shape spans the
    // lifecycle.
    geography_requirements?: string;
    charter_status?: string;
    ceremony_window?: string;
    why_this_one?: string;
    apply_cta?: string;
    apply_href?: string;
}

/** SigningMethod discriminator on the user identity. Federation-agnostic
 *  by construction — the OC identity (did:email or BIP-322 address)
 *  remains stable across all three states. Transitions are recorded as
 *  anchored "rebind" envelopes on the canonical event log. Graduation
 *  is the product thesis; this discriminator is the structural primitive
 *  that records where a user is on the custody-state graph. */
export type SigningMethod = 'fedimint_threshold' | 'fedimint_client' | 'bip322';
