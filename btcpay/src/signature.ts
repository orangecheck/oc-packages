import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Check a BTCPay webhook's `BTCPay-Sig` header: HMAC-SHA256 of the raw body
 * under the store's webhook secret, written `sha256=<hex>`.
 */
export function verifyBtcPaySignature(
    secret: string,
    raw: Uint8Array,
    header: string | undefined
): boolean {
    if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
    const provided = header.slice('sha256='.length).trim().toLowerCase();
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return false;
    }
}
