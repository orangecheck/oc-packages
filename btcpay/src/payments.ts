/** An invoice id goes into a BTCPay URL path: no slash, dot, query or escape gets there. */
export const INVOICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The policy every family invoice pins: one confirmation before it counts as paid. */
export const PINNED_SPEED_POLICY = 'MediumSpeed';

/**
 * Policies a payment is counted under. HighSpeed counts an unconfirmed payment
 * as paid, and since full-RBF an unconfirmed payment can be replaced.
 */
export const CONFIRMED_SPEED_POLICIES: ReadonlySet<string> = new Set([
    'MediumSpeed',
    'LowMediumSpeed',
    'LowSpeed',
]);

interface BtcPayPayment {
    id?: string;
    value?: string;
    fee?: string;
    status?: string;
}

interface BtcPayPaymentMethod {
    currency?: string;
    payments?: BtcPayPayment[];
}

/** A payment id as BTCPay gives it (`<txid>-<vout>` on chain). */
const PAYMENT_ID = /^[A-Za-z0-9_:-]{1,200}$/;

/** The on-chain payments of a payment-methods answer. */
function paymentsOf(methods: unknown): BtcPayPayment[] {
    if (!Array.isArray(methods)) return [];
    const out: BtcPayPayment[] = [];
    for (const m of methods as BtcPayPaymentMethod[]) {
        if (m?.currency !== 'BTC' || !Array.isArray(m.payments)) continue;
        out.push(...m.payments);
    }
    return out;
}

/** A Settled payment's sats net of the network fee BTCPay charged for it; null for anything else. */
function netSats(p: BtcPayPayment): number | null {
    if (p?.status !== 'Settled') return null;
    const value = Number.parseFloat(p.value ?? '');
    const fee = Number.parseFloat(p.fee ?? '0');
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round((value - (Number.isFinite(fee) && fee > 0 ? fee : 0)) * 1e8);
}

/**
 * Sats confirmed toward an invoice, from its payment-methods answer: every
 * payment BTCPay reports Settled (confirmed under the invoice's speed policy),
 * net of fees. Processing and Invalid payments count for nothing yet.
 */
export function confirmedSats(methods: unknown): number {
    let sats = 0;
    for (const p of paymentsOf(methods)) sats += netSats(p) ?? 0;
    return Math.max(0, sats);
}

export interface SettledPayment {
    id: string;
    sats: number;
}

/** Each Settled payment with its id, for booking once per payment. One with no usable id or no sats is left out. */
export function settledPayments(methods: unknown): SettledPayment[] {
    const out: SettledPayment[] = [];
    for (const p of paymentsOf(methods)) {
        const sats = netSats(p);
        if (sats === null || sats <= 0) continue;
        if (typeof p.id !== 'string' || !PAYMENT_ID.test(p.id)) continue;
        out.push({ id: p.id, sats });
    }
    return out;
}

/** Payments BTCPay has seen and not yet confirmed. */
export function confirmingPayments(methods: unknown): number {
    return paymentsOf(methods).filter((p) => p?.status === 'Processing').length;
}

/** Whether BTCPay holds any payment for the invoice, confirmed or not. */
export function anyPayment(methods: unknown): boolean {
    return paymentsOf(methods).some((p) => p?.status === 'Settled' || p?.status === 'Processing');
}

/**
 * BTCPay's own amount for an invoice, in sats, or null when it reports none.
 * The caller checks it against the amount it made the invoice for.
 */
export function canonicalSats(inv: { amount?: unknown }): number | null {
    if (typeof inv.amount !== 'string') return null;
    const btc = Number.parseFloat(inv.amount);
    if (!Number.isFinite(btc) || btc < 0) return null;
    return Math.round(btc * 1e8);
}

/** Sats as the BTC amount BTCPay takes, exactly: eight decimals, no float in between. */
export function satsToBtc(sats: number): string {
    if (!Number.isSafeInteger(sats) || sats < 0) throw new Error(`not a sat amount: ${sats}`);
    return `${Math.floor(sats / 1e8)}.${String(sats % 1e8).padStart(8, '0')}`;
}
