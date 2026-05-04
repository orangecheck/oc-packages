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

import type { BillableEvent, EventSubtype } from './types';
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

export const event = { fire };
