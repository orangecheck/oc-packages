# Changelog

All notable changes to **`@orangecheck/cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

## [0.5.5] — 2026-11-06

- Requires `@orangecheck/chat-core` ^0.2.6, which judges a channel's version
  read against the read floor itself (`floorMet`): a read anyone can publish
  into that stopped at its bound meets it when each REQ it made did, and every
  other read, each read under a role holder's key included, on the relays read
  to its end. `oc chat verify` reads that judgment. A version read below the
  floor is NOT READ, exit 2, whether or not it stopped at its bound.
- The relay report names a relay that answered a read and was cut off before
  the end of what it holds under `cut_off` (`{ relay, reads }`), apart from the
  relays that sent nothing (`silent`). Below the floor, the run lists each
  relay that sent nothing and each that was cut off.
- A directory relay cut off partway leaves a handle NOT READ, exit 2.

## [0.5.4] — 2026-11-06

- Requires `@orangecheck/chat-core` ^0.2.5 and `@orangecheck/nostr-core`
  ^0.8.2. chat-core pages every channel-version and directory read to each
  relay's end, whatever page size the relay caps at. nostr-core 0.8.2's
  `DEFAULT_RELAYS`, the set device records are read from (chat-core
  `DEVICE_RECORD_RELAYS`), lists nostr.mom in place of relay.damus.io.
- `oc chat verify` reads device records and revocations with nostr-core's
  `readRelays`: each relay is paged alone to the end of what it holds under the
  principal's d tag, 500 asked a page, within 8 s per relay. The read floor
  counts the relays whose read ended complete. A relay that stops answering
  partway is cut off, so the key is NOT READ, exit 2, never live or not bound.
- A channel's version read below the read floor (chat-core `floorMet`) is NOT
  READ, exit 2, unless the read was cut off at its bound. A read cut off at its
  bound stands only when every REQ of the role holders' key reads met its read
  floor and none of those reads was cut off at its bound, so a flood alone does
  not block a verdict.
- With `--relays`, each relay's NIP-11 document is asked for its `max_limit`
  (nostr-core `relayMaxLimit`). A relay that declares under 100 and sent
  anything is cut off. The reference sets declare 500 and are not asked. A
  relay that caps a page below 100 without declaring it is not told apart.
- `RawQuery` takes an optional third argument, the ms a REQ may take;
  `liveNet` an optional fifth, the NIP-11 reader. `netFor(opts, raw?)` builds
  the network a run reads.

## [0.5.3] — 2026-11-05

- Requires `@orangecheck/chat-core` ^0.2.4 (it was ^0.2.3). With `--founder`,
  `oc chat verify` judges a channel version whose version read was cut off at
  its bound only when every role holder's key was read in full, and chat-core
  0.2.4 counts a key read that a relay filled to its page of 500 as not read
  in full: more versions that key signed may lie behind the page. Such a
  version is NOT READ, exit 2, never the tip. A key read that comes back short
  of its page, or an open read that was not cut off, gives a verdict on the
  versions read, so a flood of the open read by another key alone leaves the
  version VERIFIED or FAILED.

## [0.5.2] — 2026-11-05

- Requires `@orangecheck/chat-core` ^0.2.3 (it was ^0.1.1). `oc chat verify`
  checks a utxo-floor post's write proof against the one coin it names, `GET
  /tx/<txid>` and then `GET /tx/<txid>/outspend/<vout>`, as chat.ochk.io does.
  The post is VERIFIED or FAILED by its coin: the coin must pay the author the
  value the proof states, at its height and block hash, and be unspent (a spend
  still in the mempool counts as spent).
- A coin read that is refused, rate limited, answered with a 5xx or with a body
  that is not a transaction, or not answered within 8 s (its body included) is
  NOT READ, exit 2, never FAILED. Each of the two reads takes chat-core's own
  time limit, which aborts its request.
- The directory walk (`--handle`, and a listing from a file or stdin) takes a
  page as full by what the relay sent, as chat-core 0.2.1 reads it: the events
  nostr-core kept, repeats included, and the ones it dropped for a bad
  signature. A full page that brings nothing new is a read cut off, so with no
  other answer the handle is NOT READ, exit 2.
- Device records and revocations are asked in pages of 500, and the page goes
  to chat-core with the answer, as chat-core 0.2.2 reads a `RecordLookup`. A
  relay that fills the page has not answered in full, and a read with such a
  relay is below its floor however many others answered, so "live", "bound
  now" and "not bound" are NOT READ, exit 2. The relay report counts such a
  read below its floor, and the line that names those reads says "fewer relays
  answering in full than their floor".

## [0.5.1] — 2026-11-05

- `oc chat verify` reads a chain tip body that is blank, 0, negative or not
  a whole number as no answer, as `@orangecheck/sdk` 1.23.1's tip read does:
  NOT READ, exit 2. It read the body with `parseInt`, so a 0 body was block 0,
  and a utxo-floor post checked against it FAILED. The directory walk's tip
  read follows the same rule.

## [0.5.0] — 2026-11-03

- Requires `@orangecheck/sdk` ^1.21.0 (it was ^1.7.0), the release whose
  `check()` names a coin it could not read (`chain_unread`, `utxo_cap_unread`,
  `provider_refused_unread`) and never puts `below_min_*` beside it.
- Requires `@orangecheck/chat-core` ^0.1.1 (it was ^0.1.0). 0.1.0's version
  read stopped on a page it could not get past, such as more than 500 events
  in one second under a channel's tag, and called that read complete, so 0.4.0's
  cut-off rule never saw it. 0.1.1 marks that read cut off. Under such a flood,
  with no `--founder`, `oc chat verify` now says it can't tell: NOT READ, exit 2,
  for all three subjects that resolve the channel.
  - `--channel`: FAILED, exit 1, before.
  - A post from a file or stdin: FAILED, exit 1, before.
  - A channel version from a file or stdin: **VERIFIED, exit 0, before.** That
    VERIFIED was wrong: it judged the version against only what the stuck read
    reached. A script that gates on the exit code sees 2 where it saw 0.

### Changed

- `oc check` and `oc verify` exit **3** when nothing could be concluded, and
  print `? unread: …` with no sats, days or score line. That covers no chain
  API or relay answering (`chain_unread`, `attestation_unread`,
  `stake_unread`, or before `@orangecheck/sdk` 1.21.0 `bad_request` beside a
  verified signature), the address holding more coins than the chain API
  lists (`utxo_cap_unread`), and a refused lookup (`provider_refused_unread`,
  with its HTTP status). They used to print `✗ fail / sats: 0` or
  `✗ invalid` and exit 2, so a script gating on the exit code read a
  mempool.space rate limit as a failed proof. `--json` uses the same codes.
  `oc chat verify` keeps its own codes.

## [0.4.0] — 2026-10-28

### Added

- `oc chat verify`: a channel version, post or directory listing from a file
  or stdin, a channel by `--channel`, or a handle by `--handle`, checked with
  `@orangecheck/chat-core` against the relays, the device records, ochk.io's
  keys and the chain. A version counts only as one of its version's
  authorized copies: the same content under another key fails. The given
  version is judged with what the relays hold, so one they lack stands by its
  binding, and `on_relays` says whether a relay holds it. A verdict that
  rests on something not being on the relays (no revocation, no newer
  version, no earlier claim) needs every read to meet chat-core's read floor
  (OC Chat SPEC §8.7): device records and revocations are read from
  nostr-core's five relays, the set OC Lock counts over (4 of 5 must answer),
  and channel versions and posts from chat's four (3 of 4); `--relays` sets
  both, with `readFloor(asked)`. Below it the verdict is NOT READ; a failure the event itself
  shows stands. The output names every relay that missed a read, the reads
  below their floor, and in VERIFIED how many relays answered every read.
  `resolves` says whether the channel resolves, and `channel` is its chain when
  it does. A NOT READ report always carries `detail`, with the same keys for its
  subject whether a read failed outright or the verdict rested on it: the
  event's own id, and every key a relay read decides (`is_tip`,
  `on_resolved_chain`, `on_relays`, `resolves`, `channel`, the holder) as null
  in `--json` and `unknown` in the text. `--offline` reads nothing and lists
  what it skipped. Exit 0 verified, 1 failed, 2 not
  read (a relay, ochk.io's keys or the chain did not answer, or a read was
  cut off), 3 offline checks only.
- A read of a channel's versions that stopped at its bound is not an answer
  (OC Chat SPEC §8.3.1): when the channel did not resolve, or the founder's and
  role holders' keys were not all read, the verdict is NOT READ and says it
  can't tell, never FAILED or VERIFIED. Anyone can fill the bound by publishing
  under the channel's tag.

### Fixed

- `oc --version` prints the package's version, read from its package.json. It
  had said 0.1.0 since 0.1.0.

## [0.3.2] — 2026-10-26

### Fixed

- `oc me test-fire` checks `--subtype` against the subtype table's own
  keys, so `constructor` gets the local "unknown subtype" message.

## [Unreleased]

- _(no pending changes)_

## [0.3.1] — 2026-09-24

### Changed

- **`@orangecheck/sdk` `^1.4.0` → `^1.7.0`.** The range previously resolved
  to 1.6.0. From 1.7.0, `check()` takes the subject from the signed canonical
  message rather than from event tags, matches a Nostr identity in either the
  `npub` or hex spelling, and applies the one-bond-one-identity rule
  (SECURITY.md §3, reason `stake_shared`). `oc check --identity` now follows those rules.

## [0.3.0] — 2026-09-03

### Fixed

- **`@orangecheck/sdk` `^0.1.3` → `^1.4.0`.** `oc check --addr <address>` always reported a failure. `--id` and `--identity` were unaffected.

  The pinned SDK filtered Nostr relays on a multi-letter `#address` tag. Relays
  index single-letter tag names only (NIP-12), so the query matched nothing and
  every lookup by address answered `not_found` — including for attestations
  that plainly exist. Fixed in `@orangecheck/sdk` 1.4.0, which queries the
  indexed `#t` tag. Lookups by attestation id (`#d`) and by identity (`#i`)
  were never affected.

  Measured against live relays before and after, for an address holding a real
  10,000-sat / 308-day attestation:

  ```
  sdk 0.1.4  ->  not_found
  sdk 1.4.0  ->  ok, sats 10000, days 308
  ```

  No API change: `CheckResult`, `CheckParams` and the `./scoring` subpath are
  identical across the two SDK majors, so this is a drop-in for callers.


## [0.1.3] — Initial published state

Initial public release. `oc` shell for one-shot OrangeCheck checks, attestation creation, and verification.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-cli-v0.1.3...HEAD
[0.1.3]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-cli-v0.1.3
