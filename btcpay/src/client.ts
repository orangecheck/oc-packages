import type { BtcPayStore } from './config';

/** Every Greenfield call is bounded: a hung BTCPay fails the call, never the function. */
export const BTCPAY_TIMEOUT_MS = 10_000;

/**
 * A Greenfield call that answered an error. The caller answers 500 or 503; nothing is guessed.
 * `detail` is the start of BTCPay's answer, for the log: it says why a create was refused.
 */
export class BtcPayError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly detail = ''
    ) {
        super(message);
        this.name = 'BtcPayError';
    }
}

export interface BtcPayInvoice {
    id: string;
    status?: string;
    additionalStatus?: string;
    amount?: string;
    currency?: string;
    checkoutLink?: string;
    /** Unix seconds. */
    createdTime?: number;
    /** Unix seconds. */
    expirationTime?: number;
    metadata?: Record<string, unknown>;
    checkout?: { speedPolicy?: string | null };
}

export type StoreKey = Pick<BtcPayStore, 'serverUrl' | 'apiKey' | 'storeId'>;

/**
 * One call under the store's Greenfield API (`/api/v1/stores/<store>/<path>`).
 * Throws BtcPayError on a non-2xx answer; the message names the first path
 * segment and the status, never the key.
 */
export async function btcpayRequest<T>(
    cfg: StoreKey,
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' }
): Promise<T> {
    const url = `${cfg.serverUrl}/api/v1/stores/${encodeURIComponent(cfg.storeId)}/${path}`;
    const r = await fetch(url, {
        method: init.method,
        headers: {
            Authorization: `token ${cfg.apiKey}`,
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(BTCPAY_TIMEOUT_MS),
    });
    if (!r.ok) {
        const detail = (await r.text().catch(() => '')).slice(0, 300);
        throw new BtcPayError(r.status, `btcpay ${init.method} ${path.split(/[/?]/)[0]} ${r.status}`, detail);
    }
    return (await r.json()) as T;
}

export function getInvoice(cfg: StoreKey, id: string): Promise<BtcPayInvoice> {
    return btcpayRequest<BtcPayInvoice>(cfg, `invoices/${encodeURIComponent(id)}`);
}

/** The invoice's payment methods and their payments: what confirmedSats and settledPayments read. */
export function getPaymentMethods(cfg: StoreKey, id: string): Promise<unknown> {
    return btcpayRequest<unknown>(cfg, `invoices/${encodeURIComponent(id)}/payment-methods`);
}

/** The store's invoice made under `orderId`, or null: a retry adopts it rather than make a second. */
export async function findInvoiceByOrderId(
    cfg: StoreKey,
    orderId: string
): Promise<BtcPayInvoice | null> {
    const list = await btcpayRequest<BtcPayInvoice[]>(
        cfg,
        `invoices?orderId=${encodeURIComponent(orderId)}`
    );
    if (!Array.isArray(list)) return null;
    return list.find((inv) => inv?.metadata?.orderId === orderId) ?? null;
}

/** Make an invoice from a Greenfield create body; the caller pins its speed policy and payment methods. */
export function createInvoice(cfg: StoreKey, body: Record<string, unknown>): Promise<BtcPayInvoice> {
    return btcpayRequest<BtcPayInvoice>(cfg, 'invoices', { method: 'POST', body });
}

/** Void an invoice at BTCPay, so nobody pays one we cancelled. */
export async function markInvoiceInvalid(cfg: StoreKey, id: string): Promise<void> {
    await btcpayRequest<unknown>(cfg, `invoices/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: { status: 'Invalid' },
    });
}
