import type { PaymentAuthorizeOptions, PaymentResult } from './types';

import { api } from './transport';

/**
 * Authorize a payment through the user's OC identity. Class B billable
 * event for the integrating site (sub-Stripe rate, percentage-based);
 * cashback flows to the user as Lightning credit on /me/earn.
 *
 * The user is prompted by me.ochk.io to consent to the specific payment
 * before this resolves. If the user declines or cancels, the result has
 * status `'cancelled'`, a non-billable telemetry record is emitted, and
 * NO billable event is created.
 */
async function authorize(opts: PaymentAuthorizeOptions): Promise<PaymentResult> {
    if (opts.amount_sats == null && opts.usd_cents == null) {
        throw new Error('payment.authorize requires amount_sats or usd_cents');
    }
    return api<PaymentResult>('/api/payment/authorize', {
        method: 'POST',
        body: opts,
    });
}

export const payment = { authorize };
