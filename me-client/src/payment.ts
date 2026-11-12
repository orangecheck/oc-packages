import type { PaymentAuthorizeOptions, PaymentResult } from './types';

import { api } from './transport';

/**
 * Record a payment intent in the signed-in person's name. It settles nothing
 * yet: me.ochk.io records the intent and answers `mode: 'stub'`,
 * `settles: false`, `is_stub: true`. No sats move, your balance is not
 * charged, and the person earns nothing from it.
 *
 * The person is whoever is signed in: the oc_session cookie, or the sign-in
 * token passed as `bearerToken`, made on orangecheck's own sites or on a live
 * project's verified domain. There is no prompt. `description` (at most 280
 * characters) stays private; the rest of the record is signed and anyone with
 * `verify_url` can read it. An account records at most 20 a UTC day on each
 * site. A refusal throws `MeClientError`.
 */
async function authorize(opts: PaymentAuthorizeOptions): Promise<PaymentResult> {
    if (opts.amount_sats == null && opts.usd_cents == null) {
        throw new Error('payment.authorize requires amount_sats or usd_cents');
    }
    const { bearerToken, ...body } = opts;
    return api<PaymentResult>('/api/payment/authorize', {
        method: 'POST',
        body,
        bearerToken,
    });
}

export const payment = { authorize };
