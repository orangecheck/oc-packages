# @orangecheck/webhook-verify

Drop-in HMAC-SHA256 verifier for outbound webhooks delivered by [console.ochk.io](https://console.ochk.io). The console signs every delivery with a per-endpoint secret you saw once at create time; this package gives you the timing-safe HMAC compare so you don't have to roll it yourself.

```bash
npm install @orangecheck/webhook-verify
```

## Usage

```ts
import { verify } from '@orangecheck/webhook-verify';

// Express — get the RAW body bytes, not the JSON-parsed object.
import express from 'express';
const app = express();
app.use(express.raw({ type: 'application/json' }));

app.post('/webhooks/orangecheck', (req, res) => {
    const ok = verify({
        secret:    process.env.OC_WEBHOOK_SECRET!,
        signature: req.header('X-OrangeCheck-Signature') ?? '',
        rawBody:   req.body, // Buffer
    });
    if (!ok) return res.status(401).send('bad signature');

    const event = JSON.parse(req.body.toString('utf8'));
    // ... handle event.event_type, event.id, etc.
    res.status(200).send('ok');
});
```

## Headers the console sends

| Header | Value |
|---|---|
| `X-OrangeCheck-Event` | `delegation.registered`, `action.registered`, `revocation.registered`, `subdelegation.registered` |
| `X-OrangeCheck-Delivery` | opaque per-attempt id |
| `X-OrangeCheck-Idempotency-Key` | stable per-event-fanout id (use this for idempotency) |
| `X-OrangeCheck-Payload-SHA256` | sha256 hex of the raw body |
| `X-OrangeCheck-Signature` | `sha256=<hmac-hex>` |
| `X-OrangeCheck-Attempt` | (only on cron retries) attempt count |
| `X-OrangeCheck-Redelivery` | (only on retries) `"true"` |

Verification is **body-only**. The headers above are advisory.

## API

### `verify({ secret, signature, rawBody })`

Returns `true` iff `signature` is a valid HMAC-SHA256 of `rawBody` under `secret`. Uses Node's `timingSafeEqual` so a malicious server can't byte-by-byte probe the expected sig.

### `sign(secret, rawBody)`

Compute the expected `sha256=<hex>` signature. Useful for tests on the customer side.

## Why a tiny package

Signature verification is two lines that everyone gets subtly wrong (string compare instead of timing-safe; sha256(secret) confusion; trimming the wrong way). Centralizing keeps the failure mode impossible.

## License

MIT
