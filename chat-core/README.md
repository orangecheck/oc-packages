# @orangecheck/chat-core

Verify the public artifacts of [OC Chat](https://github.com/orangecheck/oc-chat-protocol)
(0.4.0), a mode of OC Lock: channel descriptors and their governance chain
(kind 30110), channel posts and the write gate (kind 30111), directory handles
(kind 30114) and `did:oc` session devices.

Every read a verdict needs is passed in: relay queries, device records, the
auth host's keys, chain state and a BIP-322 verifier. The same rules run in a
browser, in a relay's write gate and in a terminal. `@orangecheck/chat-core/io`
has an Esplora reader for the utxo-floor write proof.

This package verifies. It does not build, sign or publish events, and it
does not open direct messages.

## Install

```
npm i @orangecheck/chat-core
```

## Usage

```ts
import { verifySignature } from '@orangecheck/bip322';
import { readChannelVersions, recordReads, resolveChannelChain } from '@orangecheck/chat-core';

const verifyBip322 = ({ address, message, signature }) => verifySignature(address, message, signature);
const reads = recordReads(lookupDeviceRecords, { hostKeys: loadAuthHostKeys, verifyBip322 });
const { events } = await readChannelVersions(channelId, { query, everBoundKeys: reads.everBoundKeys });
const channel = await resolveChannelChain(events, channelId, { ...reads, hostKeys: loadAuthHostKeys, verifyBip322 });
```

`lookupDeviceRecords(principal)` returns the kind-30078 records under the
principal's d-tag (`deviceDtag(principal)`) and, per relay asked, whether it
finished answering (`relayStatus`). `query(filter)` makes one relay request. A
read that got no answer throws `UnansweredReadError`; a verifier never reads
silence as "no".

### Relay floor and write quorum (SPEC §8.7)

A record is on whichever relays its publisher reached, so an answer that rests
on something not being there ("live", "bound now", "not bound", "no newer
version") is drawn only from a read that met the floor: `readFloor(asked)`, which
is `asked - WRITE_QUORUM + 1`, at least 1, so 3 of the 4 relays a reader asks by
default. What a read returned needs one relay. A binding or revocation write
counts as published only once `WRITE_QUORUM` (2) relays sent OK;
`publishToQuorum` writes and retries until then, or reports "not yet published".
The two together are what make a revocation hold: the floor plus the quorum
exceeds the relays asked, so a revocation is missed only when every relay that
sent OK for it is silent in the same read, and that read does not meet the
floor. Neither rule alone is enough.

From a shell, `oc chat verify` in [`@orangecheck/cli`](https://www.npmjs.com/package/@orangecheck/cli)
runs these checks against live relays and the chain.

## Conformance

The tests run the spec's vectors `vc07`, `vc08` and `vc14`–`vc20` from an
`oc-chat-protocol` checkout (`OC_CHAT_VECTORS_DIR`). In CI a missing checkout
fails the build. The directory walk itself is `@orangecheck/lock-core/directory`,
which runs `vc22`–`vc25`.

## Trust anchors

- A `did:oc` session device is bound only by the vouch of the auth host,
  ochk.io, a named trust anchor. That tier is not offline-verifiable and carries
  no Bitcoin claim.
- The reference deployment's directory relay is `wss://relay.ochk.io`
  (`DIRECTORY_RELAYS`), an availability anchor: it can withhold a claim, never
  reorder or forge one.

## License

MIT
