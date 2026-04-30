import type { BillableEvent, EventSubtype } from './types';

import { api } from './transport';

export interface FireEventOptions {
    project_key: string;
    subtype: EventSubtype;
    /** Required for percent_of_amount-priced subtypes. */
    payment_amount_sats?: number;
    action_label?: string;
    note?: string;
}

/**
 * Fire any billable envelope under a project_key. Most integrations
 * use the higher-level helpers (oc.session.create, oc.payment.authorize),
 * but this lets you record any subtype your IntegratorPriceConfig
 * enables — stamp_signing, attest_verification_at_gate,
 * scoped_action_authorization, kyc_tier_upgrade, etc.
 *
 * Returns the canonical BillableEvent the server recorded.
 */
async function fire(opts: FireEventOptions): Promise<BillableEvent> {
    const result = await api<{ event: BillableEvent }>('/api/integrator/event', {
        method: 'POST',
        body: opts,
    });
    return result.event;
}

export const event = { fire };
