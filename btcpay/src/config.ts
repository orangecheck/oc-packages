/** One BTCPay store's credentials: where it is, the key for it, and its webhook secret. */
export interface BtcPayStore {
    serverUrl: string;
    apiKey: string;
    storeId: string;
    webhookSecret: string;
}

export type BtcPayStoreResult = { ok: true; cfg: BtcPayStore } | { ok: false; missing: string[] };

/**
 * Read a store from `<prefix>SERVER_URL`, `_API_KEY`, `_STORE_ID` and
 * `_WEBHOOK_SECRET` (vault's prefix is `BTCPAY_`, me.ochk.io's `OC_ME_BTCPAY_`).
 * Any one unset and the store is not configured: nothing is issued or booked.
 */
export function readBtcPayStore(
    prefix: string,
    env: Record<string, string | undefined> = process.env
): BtcPayStoreResult {
    const names = {
        serverUrl: `${prefix}SERVER_URL`,
        apiKey: `${prefix}API_KEY`,
        storeId: `${prefix}STORE_ID`,
        webhookSecret: `${prefix}WEBHOOK_SECRET`,
    };
    const serverUrl = env[names.serverUrl]?.replace(/\/+$/, '') ?? '';
    const apiKey = env[names.apiKey] ?? '';
    const storeId = env[names.storeId] ?? '';
    const webhookSecret = env[names.webhookSecret] ?? '';
    const missing: string[] = [];
    if (!serverUrl) missing.push(names.serverUrl);
    if (!apiKey) missing.push(names.apiKey);
    if (!storeId) missing.push(names.storeId);
    if (!webhookSecret) missing.push(names.webhookSecret);
    if (missing.length > 0) return { ok: false, missing };
    return { ok: true, cfg: { serverUrl, apiKey, storeId, webhookSecret } };
}
