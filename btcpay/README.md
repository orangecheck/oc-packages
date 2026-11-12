# @orangecheck/btcpay

The family's one BTCPay Server implementation, for the stores vault.ochk.io and me.ochk.io bill through.
Server-only, no dependencies. MIT.

```ts
import {
    readBtcPayStore,
    readRawBody,
    verifyBtcPaySignature,
    getInvoice,
    getPaymentMethods,
    settledPayments,
} from '@orangecheck/btcpay';

const store = readBtcPayStore('OC_ME_BTCPAY_'); // SERVER_URL, API_KEY, STORE_ID, WEBHOOK_SECRET
if (!store.ok) return res.status(503).json({ error: 'btcpay_not_configured' });
const raw = await readRawBody(req); // the bytes BTCPay signed, capped at 64 KB
if (!verifyBtcPaySignature(store.cfg.webhookSecret, raw, req.headers['btcpay-sig'] as string)) {
    return res.status(400).end();
}
const { invoiceId } = JSON.parse(raw.toString('utf8'));
const inv = await getInvoice(store.cfg, invoiceId); // re-read from BTCPay, never trust the event
const paid = settledPayments(await getPaymentMethods(store.cfg, invoiceId));
```

What it holds:

- **Webhook:** `verifyBtcPaySignature(secret, raw, header)` checks `BTCPay-Sig` (`sha256=<hex>`, HMAC-SHA256 of
  the raw body). `readRawBody(req, maxBytes?)` reads that body and stops at the cap.
- **Store:** `readBtcPayStore(prefix, env?)` reads the four variables under a prefix and names any missing.
- **Payments:** a payment counts once BTCPay calls it Settled under a confirmed speed policy
  (`CONFIRMED_SPEED_POLICIES`; every invoice pins `PINNED_SPEED_POLICY`, one confirmation). `confirmedSats`
  totals them net of fees; `settledPayments` gives each with its id, to book once per payment.
  `canonicalSats` reads BTCPay's own amount; `satsToBtc` writes one exactly.
  These and the constants also come from `@orangecheck/btcpay/payments`, which imports nothing, so a
  browser bundle can check an invoice id without taking `node:crypto`.
- **Greenfield:** `btcpayRequest` and the calls built on it are bounded at 10 s and throw `BtcPayError` on any
  error answer, so a caller answers 500 and BTCPay redelivers rather than a payment going unread. Its `detail`
  is the start of BTCPay's answer, for the log.

Lightning is off family-wide; nothing here makes a Lightning invoice.
