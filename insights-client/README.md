# @orangecheck/insights-client

> **Full reference:** [docs.ochk.io/sdk/insights-client](https://docs.ochk.io/sdk/insights-client) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Server-side emit API for **oc insights** — the OrangeCheck family's first-party, protocol-aware event lane. It records what hosted Plausible is structurally blind to: BIP-322 sign success, Connect logins, settlements, attestations, votes, pledges, agent delegations — emitted from each app's own backend at the moment a protocol action commits.

It runs **alongside** Plausible, never instead of it. Pageviews stay on the Plausible beacon; this is the server-side product-analytics lane.

```bash
npm install @orangecheck/insights-client
```

## Two properties, by design

`emit()` is called inline of a protocol action, so it:

1. **Never throws into the caller** — every failure is swallowed (pass `onError` to observe them). A down collector can never break a sign, a settlement, or a login.
2. **Is safe when unconfigured** — with no `OC_INSIGHTS_INGEST_TOKEN` it is an inert no-op, so call sites can ship before the collector exists.

## Usage

```ts
import { emit } from '@orangecheck/insights-client';

// Long-lived server (Node/Express): ignore the promise; it sends in the background.
void emit('attest', 'bip322_success', { scheme: 'p2wpkh' });

// Serverless (Vercel): await it (or hand it to waitUntil) so the function
// doesn't freeze before the request flushes. `keepalive` is set so a
// returning function's request still survives.
await emit('me', 'settlement', { class: 'B' });
```

## Configuration

Env (no code setup needed beyond the two vars):

| Var | Default | Notes |
|---|---|---|
| `OC_INSIGHTS_INGEST_URL` | `https://insights.ochk.io/api/insights/ingest` | the collector route |
| `OC_INSIGHTS_INGEST_TOKEN` | — | bearer token; **required** to enable (absent ⇒ no-op) |
| `OC_INSIGHTS_SOURCE` | — | optional emitting-service id, sent as `x-oc-insights-source` |

Or explicitly, for tests / custom runtimes:

```ts
import { createInsightsClient, configure } from '@orangecheck/insights-client';

const client = createInsightsClient({ token, url, fetch, onError, timeoutMs: 2000 });
await client.emit('vault', 'unseal');

// …or override the default client used by the top-level emit():
configure({ token, onError: (e) => log.warn(e) });
```

## API

### `emit(product, name, props?)`

Fire a protocol event. `product` is the registry slug (`me`, `vault`, `attest`, …); `name` is the event (`bip322_success`, `settlement`, …); `props` is a small flat bag (≤ 30 keys, primitive values only). Resolves (never rejects).

### `emitEvent(event)`

Full event shape — adds optional `ts`, `actor`, `eventClass` (oc-me A/B/C), and `subtype`.

### `createInsightsClient(config)` · `configure(config)` · `isEnabled()`

Explicit-config client, default-client override, and a configured-state probe.

## Privacy

An optional `actor` (bare Bitcoin address / email) may be attached so per-actor activity can be counted. The client sends it server-to-server over TLS to the trusted first-party collector, which computes a **product-scoped, daily-salted hash and discards the raw value** — the raw actor is never stored, and the salt rotates daily so cross-day correlation is cryptographically impossible. The client never hashes (the rotating salt lives at the collector) and never persists anything. Omit `actor` for fully anonymous events.

## License

MIT
