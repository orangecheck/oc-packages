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

Strfry asks the plugin about one event at a time and waits for the answer, so
the plugin never touches the network on that path. It holds every OC
attestation that binds a Nostr key in memory, kept current by one standing
subscription (`kinds: [30078], #t: ["oc-attest"]`), and re-reads each bond from
the chain in the background. Measured on the built binary against live relays:
**p50 0.06 ms, max 1.6 ms** per decision for 50 fresh pubkeys. A lookup per
event took about 6 s, which would let anyone rotating pubkeys stall your relay.

For the first few seconds after start, before the backlog has loaded, an
unknown key gets `verifying your proof, try again shortly` rather than a
refusal. After that, an unseen key is refused at once and looked up by
identity in the background, so an attested key that the subscription missed
is admitted on its next event.

Configure via environment variables in the Strfry unit file (or wherever Strfry starts):

| Env var            | Default     | Meaning                                  |
| ------------------ | ----------- | ---------------------------------------- |
| `OC_MIN_SATS`      | `0`         | Minimum sats bonded                      |
| `OC_MIN_DAYS`      | `0`         | Minimum days unspent                     |
| `OC_ALLOW_KINDS`   | `0,3,10002` | Event kinds that bypass the filter       |
| `OC_ALLOW_PUBKEYS` | _(none)_    | Comma-separated hex pubkeys that bypass  |
| `OC_RELAYS`        | SDK default | Discovery relays for lookups             |
| `OC_FAIL_OPEN`     | `false`     | Allow events through on lookup failure   |
| `OC_REFRESH_MS`    | `600000`    | How often each bond is re-read from the chain. A spent bond keeps passing for at most this long. |
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

If your relay is a long-running JS process, use the same in-memory index the
Strfry plugin uses. `decide()` is synchronous:

```ts
import { AttestationIndex } from '@orangecheck/relay-filter';

const index = new AttestationIndex(); // { relays?, refreshMs? }
index.start();

// in the EVENT handler, after verifyEvent():
const decision = index.decide(event, { minSats: 100_000, minDays: 30 });
```

`filterEvent` below looks each pubkey up over the network instead. It suits a
serverless handler that cannot hold state, and costs seconds on a cache miss:

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
- **One bond, one key.** An address that backs more than one Nostr key admits none of them through that bond (`stake_shared`), as SECURITY.md §3 of the protocol requires. A holder who wants two keys gated uses two addresses.
- **Only the signed message counts.** Event tags are indexes. A key is admitted only if the attestation's signed `identities:` line binds it, in npub or hex form.
- **Freshness is bounded, not live.** The index re-reads bonds every `OC_REFRESH_MS`. `filterEvent` caches per pubkey for `cacheTtlMs`. Either way, pick the window your relay can tolerate a spent bond passing for.

---

## What this doesn't do

- **Doesn't verify Nostr event signatures.** Use `nostr-tools`' `verifyEvent()` before calling `filterEvent()`. We only care about the _author's OC proof_, not the event integrity.
- **Doesn't authenticate the caller.** This is a write-time filter, not a NIP-42 `AUTH` implementation. Combine with NIP-42 if you also want AUTH-gated reads.
- **Doesn't fetch profiles or resolve NIP-05.** The filter matches the event's hex pubkey against the npub or hex key the attestation binds.

---

## License

MIT. The OrangeCheck protocol is CC-BY-4.0.
