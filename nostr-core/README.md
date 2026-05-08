# @orangecheck/nostr-core

Browser-compatible Nostr client used by every OrangeCheck family web app. Raw NIP-01 over WebSocket against a list of relays.

## Install

```bash
yarn add @orangecheck/nostr-core
# or
npm install @orangecheck/nostr-core
```

No dependencies — uses the platform `WebSocket` global. Works in any runtime that ships a WHATWG WebSocket (browsers, Node 22+, Deno, Bun, Cloudflare Workers).

## Use

```ts
import { DEFAULT_RELAYS, publishEvent, queryEvents } from '@orangecheck/nostr-core';
import type { NostrEvent, Filter } from '@orangecheck/nostr-core';

// Publish a kind-30078 event to the family default relay set.
const event: NostrEvent = { /* signed by your wallet, see oc-pledge-protocol */ };
const results = await publishEvent(event);
const accepted = results.filter((r) => r.ok).length;
console.log(`${accepted}/${results.length} relays accepted`);

// Query events across the racing read pool.
const filter: Filter = { kinds: [30078], '#t': ['bc1q…'] };
const { events, relayStatus } = await queryEvents(filter);
console.log(`${events.length} unique events from ${relayStatus.filter(r => r.ok).length} relays`);
```

## What's in `DEFAULT_RELAYS`

Five relays, in order:

1. `wss://relay.nostr.band`
2. `wss://nos.lol`
3. `wss://relay.primal.net`
4. `wss://offchain.pub`
5. `wss://relay.ochk.io` — the OC family's first-party kind-allowlisted relay (see [`oc-relay-infra`](https://github.com/orangecheck/oc-relay-infra))

**`DEFAULT_RELAYS` is enforced at the type level to never collapse to `relay.ochk.io` alone or to fewer than two entries.** See the `_ValidRelaySet` invariant in `src/index.ts`. A future change that violates the invariant fails `tsc` at build time.

## Why it exists

Five OC web repos (`oc-vote-web`, `oc-pledge-web`, `oc-stamp-web`, `oc-lock-web`, `oc-fleet-web`) used to carry near-identical 200-line `client.ts` files via fork-and-paste. Drift between them was already visible before extraction. Now each repo imports from this package; the family stays in sync via a single `yarn upgrade @orangecheck/nostr-core`.

Product-specific helpers (`fetchPollEvent` for OC Vote, `fetchPledgeOutcomes` for OC Pledge, etc.) stay local to each app — they're shape-specific to one verb and don't generalize.

## License

MIT.
