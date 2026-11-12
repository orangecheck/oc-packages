# Changelog

## 0.1.0

- First release. vault.ochk.io and me.ochk.io each carried a copy of the same BTCPay code; this is the one
  both take. `verifyBtcPaySignature`, `readRawBody`, `readBtcPayStore(prefix)`, the invoice-id and speed-policy
  constants, `confirmedSats` (vault's grant rule, unchanged), `settledPayments`, `confirmingPayments`,
  `anyPayment`, `canonicalSats`, `satsToBtc`, and the Greenfield calls (`btcpayRequest`, `getInvoice`,
  `getPaymentMethods`, `findInvoiceByOrderId`, `createInvoice`, `markInvoiceInvalid`), each bounded at 10 s.
- `@orangecheck/btcpay/payments`: the payment rules and constants alone, with no imports, for browser code.
