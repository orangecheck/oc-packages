/**
 * `oc.event.fire` — escape hatch for firing a billable envelope under
 * any subtype that isn't already covered by `oc.session.create` or
 * `oc.payment.authorize`. Useful for `stamp_signing`,
 * `attest_verification_at_gate`, `scoped_action_authorization`,
 * `kyc_tier_upgrade`, etc.
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const env = await oc.event.fire({
 *     project_key: 'pk_live_yourcompany',
 *     subtype: 'stamp_signing',
 *     action_label: 'review · march invoice',
 *   });
 *   // env.id, env.gross_fee_sats, env.user_earned_sats, env.verify_url
 *
 *   // For percent_of_amount-priced subtypes, include the underlying amount:
 *   const verify = await oc.event.fire({
 *     project_key: 'pk_live_yourcompany',
 *     subtype: 'attest_verification_at_gate',
 *     payment_amount_sats: 50_000,
 *   });
 *
 * The class is determined by SUBTYPE_CLASS server-side; cashback is
 * computed via computeFees(); the envelope is recorded under the
 * project_key and shows up in /developer/projects/[id]/events.
 */

import {
    computeFees,
    type BillableEvent,
    type EventSubtype,
    type IntegratorEventConfig,
    type IntegratorPriceConfig,
} from './types';
import { api } from './transport';

export interface FireEventOptions {
    /** Your project_key (e.g. `pk_live_yourcompany`). Required. */
    project_key: string;
    /** Canonical billable subtype. Class is inferred by the server. */
    subtype: EventSubtype;
    /** Human-readable action label that appears on the envelope.
     *  Optional but encouraged — it's what the user sees in their
     *  /me/earn ledger. */
    action_label?: string;
    /** For percent_of_amount-priced subtypes, the underlying amount
     *  the fee is computed against. Required for those subtypes. */
    payment_amount_sats?: number;
    /** Override the user identity the envelope is credited to. Default
     *  is the currently-authenticated user (cookie / Bearer). Pass
     *  this only when firing on a user's behalf in a server-to-server
     *  flow — the project must have an explicit allowlist. */
    user_address?: string;
    /** Free-form metadata stored on the envelope. Public — anyone who
     *  GETs /api/envelope/<id> sees it. Don't put secrets here. */
    metadata?: Record<string, unknown>;
}

async function fire(options: FireEventOptions): Promise<BillableEvent> {
    if (!options.project_key) {
        throw new Error('event.fire requires project_key');
    }
    if (!options.subtype) {
        throw new Error('event.fire requires subtype');
    }
    return api<BillableEvent>('/api/integrator/event', {
        method: 'POST',
        body: options,
    });
}

/** One event in a batch · same shape as the per-event request minus
 *  project_key (which is hoisted to the batch level). */
export interface BatchEventInput {
    /** Canonical billable subtype. */
    subtype: EventSubtype;
    /** For percent_of_amount-priced subtypes, the underlying amount. */
    payment_amount_sats?: number;
    /** Human-readable label that appears in /me/earn. */
    action_label?: string;
    /** Free-form note stored on the envelope. Public. */
    note?: string;
    /** Per-event idempotency key. Distinct from the batch-level retry —
     *  if the SDK retries the same batch, events that already landed
     *  collapse to a `duplicate` status with the prior payload. */
    idempotency_key?: string;
}

/** Per-event result inside the batch response. Status codes:
 *  - `recorded` · the event landed; `event` is the canonical billable
 *    payload exactly as a per-event POST would return.
 *  - `duplicate` · idempotency-key matched a prior event; `event` is
 *    the prior payload.
 *  - `rejected` · validation or site-cap failure; `reason` is human-
 *    readable. The other events in the batch are unaffected. */
export type BatchEventResult =
    | {
          index: number;
          status: 'recorded';
          event: BillableEvent;
      }
    | {
          index: number;
          status: 'duplicate';
          event: BillableEvent;
      }
    | {
          index: number;
          status: 'rejected';
          reason: string;
      };

export interface FireBatchOptions {
    /** Your project_key. Required. All events in the batch bill against
     *  this project_key + the authenticated session. */
    project_key: string;
    /** 1 to 100 events. Larger batches must be split client-side. */
    events: BatchEventInput[];
}

export interface FireBatchResponse {
    ok: boolean;
    results: BatchEventResult[];
    escrow_mode: 'simulation' | 'live';
    simulation_mode_note?: string;
}

/**
 * `oc.event.fireBatch` — bulk-ingest up to 100 billable envelopes
 * under one project_key in a single HTTP round-trip.
 *
 * Wins amortize across the batch: one auth roundtrip, one project
 * lookup, one scope-grants resolve, parallel KV writes via Promise.all.
 * For a 50-event batch the server-side processing time drops from
 * ~3-4.5 seconds (50 sequential per-event POSTs) to ~100-200ms.
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const res = await oc.event.fireBatch({
 *     project_key: 'pk_live_yourcompany',
 *     events: [
 *       { subtype: 'session_creation' },
 *       { subtype: 'page_view', action_label: 'home' },
 *       { subtype: 'page_view', action_label: 'pricing' },
 *     ],
 *   });
 *   for (const r of res.results) {
 *     if (r.status === 'recorded') console.log('+', r.event.id, r.event.gross_fee_sats);
 *     else if (r.status === 'duplicate') console.log('~ idempotent replay', r.event.id);
 *     else console.log('!', r.reason);
 *   }
 *
 * Failure modes:
 *   - 400 if events.length === 0 or > 100, or events[].subtype missing
 *   - 403 if the project is frozen or the domain is unverified
 *   - 429 if the project's rate limit (1000 events/sec sustained) is
 *     exceeded; Retry-After header indicates backoff.
 *
 * Per OCHK-V3-PLAN §12.2.
 */
async function fireBatch(options: FireBatchOptions): Promise<FireBatchResponse> {
    if (!options.project_key) {
        throw new Error('event.fireBatch requires project_key');
    }
    if (!Array.isArray(options.events) || options.events.length === 0) {
        throw new Error('event.fireBatch requires at least one event');
    }
    if (options.events.length > 100) {
        throw new Error(
            `event.fireBatch · max 100 events per call (got ${options.events.length}). Split client-side.`
        );
    }
    return api<FireBatchResponse>('/api/integrator/event/batch', {
        method: 'POST',
        body: options,
    });
}

/** Result of replay-verifying a billable envelope against the
 *  integrator's price config. Every field returned tells the caller
 *  WHY a divergence happened — they can render it directly. */
export interface VerifyEventResult {
    /** True iff every expected fee equals the recorded fee. */
    ok: boolean;
    /** Issues found during verification, with field-level granularity
     *  so callers can highlight exactly which line is off. */
    issues: Array<{
        field:
            | 'gross_fee_sats'
            | 'platform_fee_sats'
            | 'user_earned_sats'
            | 'site_rebate_sats'
            | 'subtype_disabled'
            | 'subtype_unconfigured'
            | 'percent_amount_missing';
        expected: number | null;
        actual: number | null;
        message: string;
    }>;
    /** What computeFees() returned for the envelope's subtype + amount,
     *  given the integrator's current price config. Useful for the
     *  /audit divergence tracker — render expected vs actual side by
     *  side. Null when the subtype isn't enabled for this integrator. */
    expected: {
        gross_fee_sats: number;
        platform_fee_sats: number;
        user_earned_sats: number;
        site_rebate_sats: number;
    } | null;
}

/**
 * Replay-verify a billable envelope against the integrator's current
 * price config. Re-runs computeFees() with the same inputs and
 * compares against the four-way split recorded on the envelope.
 *
 * Anyone — the integrator, a user, OC, an auditor — can run this
 * function and reach the same answer. The integrator-side replay is
 * what keeps OC honest: a divergence means OC's billing engine
 * computed differently than the published price config says it should
 * have, and the integrator can flag it on /audit.
 *
 * For percent_of_amount-priced subtypes, the underlying payment
 * amount must be passed explicitly (it isn't stored on the envelope
 * top-level — only inside the context payload — so callers should
 * pass `envelope.context.payment_amount_sats`).
 *
 *   import { oc } from '@orangecheck/me-client';
 *
 *   const env = await fetch(`https://me.ochk.io/api/envelope/${id}`).then(r => r.json());
 *   const cfg = await oc.config.fetch({ project_key: env.site.domain });
 *   const result = oc.event.verify(env, cfg);
 *   if (!result.ok) reportDivergence(result.issues);
 */
function verify(
    envelope: BillableEvent,
    config: IntegratorPriceConfig,
    payment_amount_sats?: number
): VerifyEventResult {
    const issues: VerifyEventResult['issues'] = [];

    const eventCfg: IntegratorEventConfig | undefined = config.events[envelope.subtype];
    if (!eventCfg) {
        return {
            ok: false,
            expected: null,
            issues: [
                {
                    field: 'subtype_unconfigured',
                    expected: null,
                    actual: null,
                    message: `subtype ${envelope.subtype} is not configured on integrator ${config.project_key}`,
                },
            ],
        };
    }
    if (!eventCfg.enabled) {
        return {
            ok: false,
            expected: null,
            issues: [
                {
                    field: 'subtype_disabled',
                    expected: null,
                    actual: null,
                    message: `subtype ${envelope.subtype} is disabled on integrator ${config.project_key} but the envelope was billed`,
                },
            ],
        };
    }
    if (eventCfg.site_pays.kind === 'percent_of_amount' && payment_amount_sats == null) {
        return {
            ok: false,
            expected: null,
            issues: [
                {
                    field: 'percent_amount_missing',
                    expected: null,
                    actual: null,
                    message: `subtype ${envelope.subtype} is percent_of_amount-priced; payment_amount_sats is required to verify`,
                },
            ],
        };
    }

    const expected = computeFees(eventCfg, payment_amount_sats);

    if (envelope.gross_fee_sats !== expected.gross_fee_sats) {
        issues.push({
            field: 'gross_fee_sats',
            expected: expected.gross_fee_sats,
            actual: envelope.gross_fee_sats,
            message: `gross_fee_sats mismatch · expected ${expected.gross_fee_sats}, recorded ${envelope.gross_fee_sats}`,
        });
    }
    if (envelope.platform_fee_sats !== expected.platform_fee_sats) {
        issues.push({
            field: 'platform_fee_sats',
            expected: expected.platform_fee_sats,
            actual: envelope.platform_fee_sats,
            message: `platform_fee_sats mismatch · expected ${expected.platform_fee_sats}, recorded ${envelope.platform_fee_sats}`,
        });
    }
    if (envelope.user_earned_sats !== expected.user_earned_sats) {
        issues.push({
            field: 'user_earned_sats',
            expected: expected.user_earned_sats,
            actual: envelope.user_earned_sats,
            message: `user_earned_sats mismatch · expected ${expected.user_earned_sats}, recorded ${envelope.user_earned_sats}`,
        });
    }
    if (envelope.site_rebate_sats !== expected.site_rebate_sats) {
        issues.push({
            field: 'site_rebate_sats',
            expected: expected.site_rebate_sats,
            actual: envelope.site_rebate_sats,
            message: `site_rebate_sats mismatch · expected ${expected.site_rebate_sats}, recorded ${envelope.site_rebate_sats}`,
        });
    }

    return {
        ok: issues.length === 0,
        expected,
        issues,
    };
}

export const event = { fire, fireBatch, verify };
