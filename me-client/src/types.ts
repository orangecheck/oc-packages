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

import { EVENT_SUBTYPES } from './subtypes';

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

/**
 * Hard per-event ceiling, mirroring the server's own bound.
 *
 * The server clamps gross to this before splitting it; this package did not,
 * so `verify()` re-derived 99,000,000 for an envelope the server had recorded
 * at 10,000,000 and rejected a correct receipt. It also over-reported what a
 * misconfigured site would be charged, by the ratio of the two numbers.
 *
 * 10,000,000 sats = 0.1 BTC: orders of magnitude above any real per-event
 * price, low enough that a misconfiguration cannot mint an unbounded number
 * of sats in one event. Found by the cross-package vector test in oc-me-web
 * on its first run.
 */
export const MAX_INTEGRATOR_PRICE_SATS = 10_000_000;

/** Platform ceiling on a release window: no integrator schedule may
 *  hold a user's earned sats longer than this, whatever its cadence.
 *  Published as `max_drop_window_days` at https://me.ochk.io/api/abuse-limits. */
export const MAX_DROP_WINDOW_DAYS = 92;

// ── event taxonomy ────────────────────────────────────────────────────────

export type EventClass = 'A' | 'B' | 'C';

const EVENT_CLASSES: ReadonlySet<unknown> = new Set<EventClass>(['A', 'B', 'C']);

/** Whether a value is one of the three billing classes. */
export function isEventClass(value: unknown): value is EventClass {
    return EVENT_CLASSES.has(value);
}

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

/**
 * Any billable event key. A project's catalog is OPEN: alongside the built-in
 * subtypes above, an integrator can define their own event keys (with their own
 * label + class + price) on the project config. `EventKey` keeps autocomplete
 * for the built-ins while accepting any custom string — the `(string & {})`
 * arm preserves the literal union in editors instead of collapsing it to
 * `string`. The server resolves class/label off the project's catalog for
 * custom keys.
 */
export type EventKey = EventSubtype | (string & {});

/** Slug shape a custom event key must satisfy: 1 to 64 letters, digits or `_.:-`,
 *  starting and ending with a letter or digit. */
export const CUSTOM_EVENT_KEY_RE = /^[a-z0-9](?:[a-z0-9_.:-]{0,62}[a-z0-9])?$/i;

const INHERITED_NAMES: ReadonlySet<string> = new Set(
    [...Object.getOwnPropertyNames(Object.prototype), '__proto__'].map((n) => n.toLowerCase())
);

/** Whether a plain object answers this name without holding it ("constructor",
 *  "toString"), in any case. me.ochk.io refuses such a custom event key. */
export function isInheritedName(key: string): boolean {
    return INHERITED_NAMES.has(key.toLowerCase());
}

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
    /** Custom events only: a human-readable label. Built-ins ignore it. */
    label?: string;
    /** Custom events only: a description for the dashboard and docs. */
    description?: string;
    /** Custom events only: A, B or C. Built-ins take their class from the
     *  taxonomy; a custom event without one is billed as class B. */
    class?: EventClass;
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
    /** Per-event configs, keyed by event key. Open catalog: built-in subtypes
     *  AND your own custom keys. Keys not listed are disabled by default. */
    events: Partial<Record<EventKey, IntegratorEventConfig>>;
}

/** A computed fee breakdown for a single event. site_rebate_sats is what
 *  flows back to the developer's balance after the platform fee and what
 *  the user earns: zero at the full user share, 0.8. */
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
    // Hard ceiling · no single event mints more than MAX_INTEGRATOR_PRICE_SATS.
    // The server applies this before splitting; omitting it here made verify()
    // reject correct envelopes priced above the bound.
    gross = Math.min(gross, MAX_INTEGRATOR_PRICE_SATS);
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
    errors: { subtype?: EventKey; message: string }[];
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
        const subtype = key as EventKey;
        const builtin = Object.prototype.hasOwnProperty.call(EVENT_SUBTYPES, key);
        if (!builtin && !CUSTOM_EVENT_KEY_RE.test(key)) {
            errors.push({
                subtype,
                message: `custom event key "${key}" must match ${CUSTOM_EVENT_KEY_RE} (1–64 chars, letters/digits/_.:- )`,
            });
        } else if (!builtin && isInheritedName(key)) {
            errors.push({
                subtype,
                message: `custom event key "${key}" is a name every object already has; pick another`,
            });
        }
        if (eventCfg.class != null && !isEventClass(eventCfg.class)) {
            errors.push({
                subtype,
                message: `class must be A, B or C (got ${JSON.stringify(eventCfg.class)})`,
            });
        }
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
    subtype: EventKey;
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
         *  verifiable at ochk.app/verify/<manifest_id> after close. */
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
 * signals (escrow.low, escrow.depleted, escrow.recovered, drop.closed,
 * connect.claimed, federation.migrating, federation.migration_cancelled).
 * Same signing + headers as billable deliveries; receivers subscribe
 * via the same `subscribed` list ('*' or the explicit subtype string).
 * Carries no user identity, except connect.claimed. It has no `id`: the
 * `OC-Envelope-Id` header is its only id, so deduplicate on that.
 * Discriminate on `kind` first, then `subtype`:
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

/** The federation a project moves to, as `federation.migrating` names it. */
export interface FederationSuccessor {
    slug: string;
    name: string;
    /** `"3-of-4"`; null while the successor has none set. */
    threshold: string | null;
    /** `"bitcoin"`, `"signet"`, …; null while unset. */
    network: string | null;
    /** The successor's ratified charter, by hash; null before it has one. */
    charter_hash: string | null;
    /** Each guardian seat's operator key, hex. */
    guardians: string[];
}

/**
 * `federation.migrating`: your project's federation is being replaced. Top-ups
 * pause now; events and sign-in carry on. The project and its balance move no
 * sooner than `flip_not_before`.
 */
export interface FederationMigratingWebhookPayload extends SystemWebhookPayload {
    subtype: 'federation.migrating';
    migration_id: string;
    /** The federation the project is on now (its slug). */
    from: string;
    /** The federation it moves to (its slug). */
    to: string;
    /** ISO time: the earliest the move can happen. */
    flip_not_before: string;
    successor: FederationSuccessor;
}

/** `federation.migration_cancelled`: that move is off, and top-ups work again. */
export interface FederationMigrationCancelledWebhookPayload extends SystemWebhookPayload {
    subtype: 'federation.migration_cancelled';
    migration_id: string;
    from: string;
    to: string;
}

/**
 * HTTP headers OC sends with every webhook delivery. Capture these in
 * the receive handler · `OC-Signature` is what verifies the body.
 */
export interface WebhookHeaders {
    /** Ed25519 signature over the raw request body, hex-encoded. */
    'OC-Signature': string;
    /** kid of the key that signed it, published by me.ochk.io at
     *  https://me.ochk.io/api/dev-jwks (not ochk.io's sign-in keys). */
    'OC-Key-Id': string;
    /** For a billable event, its `id`, the same as `payload.id`. A system
     *  notice (`OC-Class: system`) has no `id` in its body: this header is
     *  its only id, the delivery's own. Not signed. Deduplicate on
     *  `payload.id` when there is one, else on this. */
    'OC-Envelope-Id': string;
    /** Subtype · matches payload.subtype (built-in or a custom event key,
     *  or a system notice's subtype); lets routers branch on the header
     *  before parsing. */
    'OC-Subtype': EventKey;
    /** Class · matches payload.class; `system` for a system notice. */
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
    /** @deprecated Ignored: the server takes the account from the session. */
    identity?: string;
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
        /** Emitted by `session.invalidate()`. Was `session.intra_signin`, which
         *  means the opposite thing — "user pressed sign-in while a valid
         *  session was already open" — so a subscriber saw a sign-in event
         *  every time the integrator tore a session down. Non-billable. */
        | 'session.teardown'
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
