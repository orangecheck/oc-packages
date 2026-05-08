# `@orangecheck/relay-filter`

> **Full reference:** [docs.ochk.io/sdk/relay-filter](https://docs.ochk.io/sdk/relay-filter) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


**Sybil filter for Nostr relays.**
Reject events from pubkeys whose OrangeCheck attestation doesn't meet your thresholds. Honest users pay nothing; attackers pay real Bitcoin opportunity cost at scale.

This is the reference implementation for VISION.md pathway 3 — "sybil-filtered infra." Run it on your own relay; license it for commercial deployments; or adapt the primitive into whatever pipeline fits your stack.

---

## Install

```bash
yarn add @orangecheck/relay-filter
```

---

## The framework-agnostic primitive

```ts
import { filterEvent } from '@orangecheck/relay-filter';

// On your relay's EVENT write path:
const decision = await filterEvent(event, {
    minSats: 100_000, // at least 100k sats bonded
    minDays: 30, // unspent for at least 30 days
    allowKinds: [0, 3, 10002], // profile meta, contacts, relay list
    allowPubkeys: [operatorHexPubkey], // your own key, always
});

if (decision.action === 'reject') {
    // Nostr OK message: ['OK', event.id, false, msg]
    socket.send(JSON.stringify(['OK', event.id, false, decision.message]));
    return;
}
// accept — store the event
```

On each call, the filter:

1. Checks bypass rules (allowed kinds, allowed pubkeys).
2. Hits an in-process TTL+LRU cache keyed on `(pubkey, thresholds)`.
3. On a miss, calls `@orangecheck/sdk`'s `check()` with `identity: nostr:<hex pubkey>` — discovers the attestation via Nostr relays, verifies the Bitcoin signature, recomputes sats + days from live chain state.
4. Returns `{ action: 'accept' | 'reject' | 'shadowReject', reason, message?, check? }`.

No state beyond the cache. No secrets. No OrangeCheck server in the relay's data path — the SDK talks directly to public Bitcoin explorers and Nostr discovery relays.

---

## Strfry plugin

[Strfry](https://github.com/hoytech/strfry) is the most widely-deployed relay implementation. It accepts external policy plugins via a simple stdin/stdout JSON protocol. We ship a ready-made plugin as `oc-strfry`:

```conf
# strfry.conf
writePolicy = {
  plugin = "/usr/local/bin/oc-strfry"
}
```

Configure via environment variables in the Strfry unit file (or wherever Strfry starts):

| Env var            | Default     | Meaning                                  |
| ------------------ | ----------- | ---------------------------------------- |
| `OC_MIN_SATS`      | `0`         | Minimum sats bonded                      |
| `OC_MIN_DAYS`      | `0`         | Minimum days unspent                     |
| `OC_ALLOW_KINDS`   | `0,3,10002` | Event kinds that bypass the filter       |
| `OC_ALLOW_PUBKEYS` | _(none)_    | Comma-separated hex pubkeys that bypass  |
| `OC_RELAYS`        | SDK default | Discovery relays for lookups             |
| `OC_FAIL_OPEN`     | `false`     | Allow events through on lookup failure   |
| `OC_CACHE_TTL_MS`  | `60000`     | Cache TTL                                |
| `OC_LOG`           | `true`      | Emit one log line per decision on stderr |

### Install globally for Strfry

```bash
yarn global add @orangecheck/relay-filter
# makes `oc-strfry` available on PATH
```

### Or run via npx

```conf
# strfry.conf
writePolicy = {
  plugin = "npx -y @orangecheck/relay-filter"
}
```

### Strfry plugin protocol (for the curious)

The plugin reads one JSON event per line on stdin:

```json
{ "type": "new", "event": { "id": "...", "pubkey": "...", "kind": 1, ... } }
```

And writes one decision per line on stdout:

```json
{ "id": "<event_id>", "action": "accept" }
{ "id": "<event_id>", "action": "reject",  "msg": "orangecheck: below threshold" }
{ "id": "<event_id>", "action": "shadowReject" }
```

Strfry forwards `msg` to the client as the `OK` message on reject.

---

## `nostr-tools` relay

If you're building a relay in JS with [nostr-tools](https://github.com/nbd-wtf/nostr-tools), wire `filterEvent` into the event handler directly:

```ts
import { filterEvent } from '@orangecheck/relay-filter';
import { Event, verifyEvent } from 'nostr-tools';

async function handleIncomingEvent(socket: WebSocket, event: Event) {
    if (!verifyEvent(event)) {
        socket.send(JSON.stringify(['OK', event.id, false, 'invalid signature']));
        return;
    }

    const decision = await filterEvent(event, {
        minSats: 100_000,
        minDays: 30,
    });

    if (decision.action === 'reject') {
        socket.send(JSON.stringify(['OK', event.id, false, decision.message]));
        return;
    }

    if (decision.action === 'shadowReject') {
        socket.send(JSON.stringify(['OK', event.id, true, ''])); // lie to client
        return; // do not store
    }

    await store.put(event);
    socket.send(JSON.stringify(['OK', event.id, true, '']));
}
```

---

## Design notes

- **Bypass `allowKinds` on purpose.** Kind 0 (profile metadata), kind 3 (contacts), and kind 10002 (relay list) are bootstrap data — users need to publish those before they can create an OC proof. Gating them creates a chicken-and-egg problem. Ephemeral / bootstrap kinds are the only things that bypass by default; everything else (posts, DMs, reactions, zaps) is gated.
- **Bypass `allowPubkeys`.** The operator's own key should never be filtered.
- **Fail closed by default.** If the SDK throws (relays unreachable, network down), we reject. `failOpen: true` opts into degraded-mode — useful for non-critical relays.
- **Per-pubkey cache.** The SDK's `check()` already caches lookups for 60 seconds via the hosted API. This package adds a second in-process LRU so a busy relay doesn't even hit the network for hot pubkeys. Decisions stay fresh enough for sybil-gating; bond state changes at Bitcoin's block cadence.

---

## What this doesn't do

- **Doesn't verify Nostr event signatures.** Use `nostr-tools`' `verifyEvent()` before calling `filterEvent()`. We only care about the _author's OC proof_, not the event integrity.
- **Doesn't authenticate the caller.** This is a write-time filter, not a NIP-42 `AUTH` implementation. Combine with NIP-42 if you also want AUTH-gated reads.
- **Doesn't fetch profiles or resolve NIP-05.** The filter uses the raw hex pubkey as the `nostr:` identity. Users bind their npub when they create the attestation; we just look it up.

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
