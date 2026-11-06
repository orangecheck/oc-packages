# @orangecheck/nostr-core

> **Full reference:** [ochk.io/docs/sdk/nostr-core](https://ochk.io/docs/sdk/nostr-core) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Browser-compatible Nostr client used by every OrangeCheck family web app. Raw NIP-01 over WebSocket against a list of relays.

## Install

```bash
yarn add @orangecheck/nostr-core
# or
npm install @orangecheck/nostr-core
```

Uses the platform `WebSocket` global. Works in any runtime that ships a WHATWG WebSocket (browsers, Node 22+, Deno, Bun, Cloudflare Workers).

`queryEvents` keeps only events whose id recomputes (NIP-01), whose BIP-340 signature verifies against `pubkey`, and which match the filter it sent. Everything else is dropped and counted per relay in `relayStatus[].rejected`. `relayStatus[].eose` is true only for a relay that sent EOSE; use it, not `ok`, to decide whether an empty result is complete. `verifyEvent`, `getEventHash` and `matchFilter` are exported for events obtained elsewhere.

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

## Reading to the end

A relay answers newest first, up to a page size of its own (`max_limit`, 500 on
the default relays), so one `queryEvents` shows only a relay's newest events.
Anyone can publish under a tag, so a read that rests on what is not there pages
to the end:

```ts
import { readRelays, readPages, queryEvents } from '@orangecheck/nostr-core';

// Each relay paged alone, its pages sharing one deadline.
const { events, relayStatus } = await readRelays(filter, relays, { timeoutMs: 4000 });
// relayStatus[i].state: 'complete' | 'cut_off' | 'no_answer'

// Or over any query, one relay or several at once.
const read = await readPages((f) => queryEvents(f, relays, 6000), filter);
```

A relay's read ends on a page that is empty, under `MIN_PAGE` (100), or shorter
than a page it sent before; anything else is paged with `until`. A second that
holds more events than a relay sends in a page cannot be paged past: the read
steps past it and reads that relay as `cut_off`. A relay that sent anything and
whose NIP-11 document declares a `max_limit` under 100 (or under `limit`, when
that is smaller) is `cut_off` (`relayMaxLimit` reads it; `readRelays` asks it
unless you pass your own `query`). A read stops at 16 REQs or 2,000 events
(`maxPages`, `maxEvents`), and in `readRelays` at each relay's deadline; a
relay still open then is `cut_off` and the read `truncated`. Only a `complete`
relay says what it does not hold. A relay that caps below 100 without declaring
it is not told apart.

## One socket per relay

In a browser, every call on the page shares one WebSocket per relay. Each
query is a subscription on it, at most 10 open at once per relay; the rest
wait, and the wait counts against their own `timeoutMs`. A relay that refuses
the handshake (a 503, a 429, a refused connection) is dialled once more after
half a second when every waiting call can wait that long, then skipped for 10
seconds,
and `relayStatus` says so with `reason: "relay_unavailable"`. A call that
passes an `auth` signer gets its own socket. Outside a browser each call opens
its own socket, as before.

A long-lived subscription shares the same socket and holds one of the slots
while open:

```ts
import { subscribe } from '@orangecheck/nostr-core';

const sub = subscribe({ kinds: [1059], '#p': [myPubkey], since }, {
  onEvent: (event, relay) => handle(event),
  onStatus: ({ relay, state }) => console.log(relay, state), // open, eose, closed, error, unavailable
});
// later
sub.stop();
```

```ts
import { configureRelayPool, closeRelayPool } from '@orangecheck/nostr-core';

configureRelayPool({ maxSubscriptions: 10, backoffMs: 10_000, idleMs: 30_000 });
closeRelayPool(); // close every pooled socket, e.g. on sign-out
```

## What's in `DEFAULT_RELAYS`

Five relays, in order:

1. `wss://nos.lol`
2. `wss://relay.primal.net`
3. `wss://nostr.mom`
4. `wss://nostr.oxtr.dev`
5. `wss://relay.ochk.io` — the OC family's first-party kind-allowlisted relay (see [`oc-relay-infra`](https://github.com/orangecheck/oc-relay-infra))

**`DEFAULT_RELAYS` is enforced at the type level to never collapse to `relay.ochk.io` alone or to fewer than two entries.** See the `ValidRelaySet` invariant in `src/index.ts`. A future change that violates the invariant fails `tsc` at build time.

## Why it exists

Several OC web repos (`oc-vote-web`, `oc-pledge-web`, `oc-stamp-web`, `oc-lock-web`) used to carry near-identical 200-line `client.ts` files via fork-and-paste. Drift between them was already visible before extraction. Now each repo imports from this package; the family stays in sync via a single `yarn upgrade @orangecheck/nostr-core`.

Product-specific helpers (`fetchPollEvent` for OC Vote, `fetchPledgeOutcomes` for OC Pledge, etc.) stay local to each app — they're shape-specific to one verb and don't generalize.

## License

MIT.
