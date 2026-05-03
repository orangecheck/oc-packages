/**
 * @orangecheck/webhook-verify
 *
 * Drop-in HMAC-SHA256 verifier for outbound webhooks delivered by
 * fleet.ochk.io. The fleet signs every delivery with a per-endpoint
 * secret you saw once at create time; this package gives you the
 * timing-safe compare so you don't have to roll it yourself.
 *
 * Quick start:
 *
 *   import { verify } from '@orangecheck/webhook-verify';
 *
 *   // Express / Fastify / etc — get the RAW request body bytes,
 *   // not the JSON-parsed object. Most frameworks need explicit setup
 *   // for this (e.g. express.raw({ type: 'application/json' })).
 *   app.post('/webhooks/orangecheck', (req, res) => {
 *     const ok = verify({
 *       secret:    process.env.OC_WEBHOOK_SECRET!,
 *       signature: req.header('X-OrangeCheck-Signature') ?? '',
 *       rawBody:   req.body, // Buffer or string
 *     });
 *     if (!ok) return res.status(401).send('bad signature');
 *     // ...handle the event
 *   });
 *
 * Why a tiny package: signature verification is two lines that everyone
 * gets subtly wrong (string compare instead of timing-safe; sha256(secret)
 * confusion; trimming the wrong way). Centralizing keeps the failure mode
 * impossible.
 *
 * Headers the fleet sends on every delivery:
 *
 *   X-OrangeCheck-Event              event_type, e.g. delegation.registered
 *   X-OrangeCheck-Delivery           opaque per-attempt id (idempotency)
 *   X-OrangeCheck-Idempotency-Key    stable per-event-fanout id (use this)
 *   X-OrangeCheck-Payload-SHA256     sha256 hex of the raw body
 *   X-OrangeCheck-Signature          sha256=<hmac-hex>
 *   X-OrangeCheck-Attempt            (only on cron retries) attempt count
 *   X-OrangeCheck-Redelivery         (only on retries) "true"
 *
 * Verification is body-only — the headers above are advisory. The HMAC
 * is over the raw body bytes the receiver receives.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyInput {
    /** The endpoint signing secret you stored at create time (`ock_xxx…`). */
    secret: string;
    /** The X-OrangeCheck-Signature header value (`sha256=<hex>` or just `<hex>`). */
    signature: string;
    /** The raw request body bytes. NOT the JSON-parsed object — must be the bytes the receiver got. */
    rawBody: string | Uint8Array;
}

/**
 * Returns true iff the signature is a valid HMAC-SHA256 of rawBody under
 * secret. Uses timing-safe compare so a malicious server can't byte-by-
 * byte probe the expected sig.
 */
export function verify(input: VerifyInput): boolean {
    if (!input.secret) return false;
    if (!input.signature) return false;

    const provided = stripPrefix(input.signature.trim());
    if (!provided) return false;
    if (!/^[0-9a-f]+$/i.test(provided)) return false;

    const bodyBytes =
        typeof input.rawBody === 'string'
            ? new TextEncoder().encode(input.rawBody)
            : input.rawBody;

    const expected = createHmac('sha256', input.secret).update(bodyBytes).digest('hex');
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(
            Buffer.from(provided.toLowerCase(), 'hex'),
            Buffer.from(expected, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * Compute the expected signature for a given body. Useful for tests on
 * the customer side — generate the sig, attach it to a fake request,
 * verify the receiver accepts it.
 */
export function sign(secret: string, rawBody: string | Uint8Array): string {
    const bodyBytes =
        typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : rawBody;
    return `sha256=${createHmac('sha256', secret).update(bodyBytes).digest('hex')}`;
}

function stripPrefix(s: string): string {
    if (s.startsWith('sha256=')) return s.slice('sha256='.length);
    return s;
}
