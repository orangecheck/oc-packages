# Changelog

All notable changes to **`@orangecheck/cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

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
  read (a relay, ochk.io's keys or the chain did not answer), 3 offline
  checks only.

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
