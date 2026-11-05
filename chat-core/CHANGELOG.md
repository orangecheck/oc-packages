# Changelog

All notable changes to **`@orangecheck/chat-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire rules live in the
`oc-chat-protocol` spec's CHANGELOG; this file tracks the package's API.

## [0.2.4] — 2026-11-05

- `readChannelVersions` returns `incomplete: true` when a relay fills a role
  holder's key read to its page of 500, the founder's keys under the channel's
  `t` tag or the walk forward by `s`: more versions that key signed may lie
  behind the page. A page is full by what the relay sent, the events the
  reader dropped included; with no counts, by the events read back. One relay
  of those asked filling it is enough. A flood of the open read alone leaves
  `incomplete` false while the key reads come back short.

## [0.2.3] — 2026-11-05

### Fixed

- `readOutpoint`, and through it `writeProofOnChain`, `verifyWriteProofOnChain`
  and `esploraWriteProofCheck`, gives each of its two Esplora reads a time of
  its own: `EsploraOptions.timeoutMs`, default `ESPLORA_TIMEOUT_MS` (8000),
  its body included. Past it the request is aborted and the coin is
  `'unanswered'`, so a hung explorer leaves a post unchecked instead of
  holding the feed. Before, the reads waited as long as the `fetch` they were
  given.
- A 200 from `/tx` whose body is not a transaction (not an object, or no
  `vout` list) is `'unanswered'`, not `'missing'`: a malformed answer is no
  answer, never a coin that isn't there.

## [0.2.2] — 2026-11-03

### Fixed

- The read floor counts a relay only when it answered in full (§8.7), in the
  family's words: `complete`, its last page came back short; `cut_off`, it sent
  a full page that was not read past, or stopped after sending something;
  `no_answer`, it sent nothing. A relay cut off keeps the floor unmet however
  many others answered. `meetsReadFloor(status, limit?)` takes each relay's
  `state` when its reader paged it, else its EOSE with a short page when its
  counts and the page `limit` are known; `answeredInFull` and `readState` are
  new, and `QueryAnswer.relayStatus` entries are `RelayAnswer`s.
- `readChannelVersions` counts its open read per relay across its pages: a
  relay counts only when it sent EOSE for every page it was asked for and its
  last page was short. An EOSE on some page of the union no longer counts, so
  a relay that answered page 1 and stopped cannot make "no newer version". Its
  other reads ask for a page of 500 and count a capped answer as cut off.
- `RecordLookup` answers may carry each relay's `state`, or its counts and the
  `limit` asked for, so an EOSE after a capped page of device records no longer
  meets the floor. Answers with neither are taken as before.

## [0.2.1] — 2026-11-03

### Fixed

- The directory walk's reads (`resolveDirectoryHandle`, `resolveWithState`)
  take a page as full by what the relay sent, not by what the reader kept.
  `PageRead` may return `sent`, the events the relay sent with the ones it
  dropped (a bad signature) included. A relay that padded a page with junk
  ended the directory read as complete, so a handle read as not listed, or a
  claim behind the junk was missed; it ended an audit relay's read early, so
  an earlier claim only it held did not count. Without `sent`, the events kept
  are the count, as before.

## [0.2.0] — 2026-11-03

A channel feed tells a post it could not check from one that failed, and
checks a write proof by the one coin it names. The API changes below break
callers of `verifyChannelPosts` and of `EsploraOptions.utxoCache`.

### Changed

- `./io` reads the coin a write proof names (SPEC §8.3.3 (1)): `GET
  /tx/<txid>` for the output at `vout`, then `GET /tx/<txid>/outspend/<vout>`,
  once per outpoint. It no longer reads the author's whole UTXO set, which
  Esplora refuses to list past a few hundred UTXOs, so a large wallet's posts
  verify, and dust sent to an author cannot stop them. A spend still in the
  mempool counts as spent. A 404 from either read, or a `vout` the transaction
  does not have, is false. A 429, a 5xx, a timeout or a body that does not
  parse is `'no-answer'`, and is not cached.
- The owner is compared through `@orangecheck/bip322`'s `normalizeAddress`,
  now a dependency: a bech32 author in capitals matches its coin, and a
  mixed-case string never does.
- `EsploraOptions.utxoCache` is now `cache`, a `WriteProofCache` keyed by
  outpoint. `readOutpoint` and `OutpointRead` are new; `MempoolUtxo` and
  `WriteProofUtxoCache` are gone.
- `esploraWriteProofCheck` throws `UnansweredReadError` by default when a read
  gets no answer, so a verifier never reads silence as "no".
  `unanswered: 'false'` returns false instead.
- `VerifyPostOpts.tipHeight` takes `'unanswered'`. A writer's utxo-floor post
  then throws `UnansweredReadError` once its own checks pass; one with no proof
  or no `control_sig` is still refused. Founder and admin posts need no tip.
- `verifyChannelPosts` returns `ChannelPosts`: `{ posts, unchecked,
  removalsChecked }`. A post whose binding, coin or tip read got no answer is
  not shown and is counted in `unchecked`, and the rest of the feed still
  verifies. Before, one such read threw out of the whole feed, or, with the
  default chain check, dropped the post as if it failed. A removal that could
  not be checked sets `removalsChecked` false. Any other error still reaches
  the caller.

## [0.1.1] — 2026-10-31

### Fixed

- `readChannelVersions` reports the read as `truncated` when a full page of
  the open read brings nothing new. 500 or more events in one second under a
  channel's tag stopped that read without saying so, so a caller could take
  "nothing resolves" or "no newer version" from a read that was cut off.

## [0.1.0] — 2026-10-28

### Added

The verifiers for OC Chat 0.4.0's public artifacts, as the reference client
at chat.ochk.io runs them:

- Channels (SPEC §8.3): `channelId`, `descriptorId`, `postId` and their d-tags;
  `parseDescriptor`, `parsePost`; `verifyDescriptor` (founder and prior-epoch
  admin authority, founder-only close, re-open and successor);
  `resolveChannelChain` (every authorized copy counts, earlier versions stand
  on their `binding`, the last needs a live one, the fork rank, closed tips;
  each version lists its authorized copies' keys and event ids);
  `authorizedCopy`, whether one event is an authorized copy of a resolved
  version (the same content under another key or event is not);
  `readChannelVersions` (the open read, the per-key reads, the walk forward by
  `s` and back by exact d-tag, and `floorMet` when every read, of versions
  and of role holders' keys, met the read floor, so "no newer version" can be
  said); `checkWritePolicy`, `verifyPost` and
  `verifyChannelPosts` (authorship, the write gate, tombstones, feed order).
- Session devices (§8.6): `verifySessionVouch`, `verifyHostRevocation`,
  `parseSessionDeviceEvent`, `sessionRevocations`, `liveSessionDevices`,
  `sessionKeysEverBound`, `stepUpAddress`.
- Bindings: `readVersionBinding`, `recordBinding`, `recordReads` (which keys a
  principal's records bind, liveness, every key ever bound). A lookup reports
  each relay's answer (`relayStatus`). A conclusion that rests on a record
  not being there needs the read floor: below it "bound now", "not bound" and
  "live" are not read, while a revocation seen is revoked on any answer. And
  `addressKeysEverBound`, over OC Lock's rule in `@orangecheck/lock-device`.
- Directory (§8.2.5–§8.2.6): `resolveDirectoryHandle`, `resolveWithState` and
  `readAddressState` over `@orangecheck/lock-core/directory`'s walk, with the
  deployment's directory and audit relays and §8.2.8 legacy claims as options
  (the reference deployment's by default); `isValidHandle`, `safeAvatar`.
- `./io`: `writeProofOnChain` ('no-answer' when the outputs cannot be read),
  `verifyWriteProofOnChain` (fail-closed) and `esploraWriteProofCheck`
  (`unanswered: 'throw'` for a verifier that must say it could not tell).
- The relay floor and write quorum (SPEC §8.7): `WRITE_QUORUM` (2),
  `readFloor(asked)` (`asked - WRITE_QUORUM + 1`, at least 1), `meetsReadFloor`,
  `DEVICE_RECORD_RELAYS` (nostr-core's `DEFAULT_RELAYS`, re-exported: the
  reference set for device records and revocations, shared with OC Lock),
  `CHAT_RELAYS` (the reference set for channel versions), and `publishToQuorum`, which
  writes to the given relays and the reference set (the device-record set by
  default) and reports a binding or
  revocation published only once `WRITE_QUORUM` reference relays hold it (on
  their OK, or with `readBack` only once they serve it back), retrying the rest,
  and otherwise "not yet published". An OK from any other relay counts for
  nothing. Together the floor and the quorum make a revocation hold; neither
  alone does.
- A read that gets no answer reaches the caller as `UnansweredReadError`: the
  host's keys while reading a version's binding (`readVersionBinding`,
  `resolveChannelChain`), and the chain through `esploraWriteProofCheck` when
  asked. The entries share one copy of that class.
- Vectors `vc07`, `vc08`, `vc14`–`vc20` run in CI against the spec checkout.
