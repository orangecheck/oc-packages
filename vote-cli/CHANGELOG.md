# Changelog

All notable changes to **`@orangecheck/vote-cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.7.6] — 2026-11-02

### Changed

- `vote` says a ballot is in only once at least 2 relays (min(2, asked)), each
  asked alone, serve it back. A copy counts only if its Nostr id and signature
  hold, it carries the ballot's ballot_id, and the ballot's own signature
  verifies, since ballot_id leaves out sig.value. Before, it printed
  "published: N/M relays" from the relays' OKs and exited 0 even when none had
  said OK. A relay can say OK and keep nothing, and a count reads all but one
  relay to the end, so a ballot only one relay holds is lost whenever that relay
  is the one the count goes without.
- Below that, `vote` says the ballot isn't in yet, prints the signed event, and
  exits 2. An anchored poll's ballot is stamped once a relay serves it back,
  not on an OK.
- `vote --json` reports `in`, `served_by`, `asked`, `quorum` and the signed
  `event`, in place of `published`, `total` and the per-relay OKs.
- `create` and `reveal` follow the same rule (OC Vote §3.4): a poll or reveal
  is published only once 2 relays, each asked alone, serve back a copy with its
  id that verifies (a reveal as a count checks it now). Below that they say so,
  print the signed event, and exit 2. Before, they printed "published: N/M"
  from OKs and exited 0 at 0 of 5. Their `--json` carries `in`, `served_by`,
  `asked`, `quorum` and `event` in place of `published`, `total` and `relays`.
- An anchored poll's ballot stamp is read back the same way, and `vote` exits 2
  while it is on fewer than 2 relays, since a final count reads stamps at the
  read floor. vote.ochk.io's anchorer also stamps every ballot it sees.
- `reveal` run again, when a reveal that verifies is already on a relay, sends
  that same signed reveal to the relays that lack it instead of refusing.
  `--force` still signs a new one.

### Fixed

- `oc-vote --version` prints the package's version, read from its
  package.json. It had said 0.2.0 since 0.2.0.

### Added

- `oc-vote republish <file>` sends a signed poll, ballot, reveal or ballot
  stamp again, as it is (an `event:` line `create`, `vote` or `reveal` prints,
  or their `--json` output), with nothing new to sign, and asks every relay for
  it back under the same rule. A poll keeps its id, so ballots cast against it
  stay its own. It refuses an event whose Nostr signature doesn't hold, or
  whose poll, ballot or stamp signature doesn't verify, or a reveal that doesn't
  verify against its poll.

## [0.7.5] — 2026-11-01

### Changed

- `tally` reads a secret poll's reveal the way it reads ballots, paged on every
  relay. "Awaiting reveal" stands only on a complete reveal read; a read that
  was cut short or is below the floor can't count, and says so. Before, any
  relay's EOSE was enough, so junk under the reveal's d-tag from fresh keys,
  dated after the reveal, made a revealed poll read as awaiting reveal. A
  public poll's tally sends no reveal read at all, so junk under its reveal tag
  cannot hold the count up.
- `tally` counts a clock-dated poll only from a complete ballot read: all but
  one of the relays asked (4 of the 5 defaults) finished it, and no relay's
  answer was cut short. An answer cut short (a full page from one second, the
  page limit reached, a full page with nothing new that verifies, or a relay
  that sent part of its answer and then stopped) is no answer. Every event a
  relay sends counts toward a full page, events that fail verification
  included. Each relay's read has one deadline across all its pages.
  Otherwise `tally` says it can't count, names the relays, and exits
  non-zero. Before, one relay finishing was enough and an answer cut short
  counted as finished, so ballots a relay did not return could be missing
  from a count reported as `tallied`. `verify` and `show` apply the same rule
  to the ballots they report.
- An anchored poll's count needs the same floor to be final. Below it the
  count is held provisional and `not_final_because` says why, as it already
  was for a ballot answer cut short.

## [0.7.4] — 2026-10-25

### Changed

- Requires `@orangecheck/vote-core` `^2.1.0`: a poll, ballot or reveal nests at
  most 32 levels (oc-vote-protocol SPEC §7), the same limit every tally and
  vote.ochk.io apply.

## [0.7.3] — 2026-10-22

### Changed

- The STATE line of a provisional anchored count says "every counted ballot
  is anchored" when none is waiting, and "no ballot counted yet" when nothing
  is counted, instead of "0 counted ballot(s) not anchored in time yet".

## [0.7.2] — 2026-10-22

### Changed

- `not_final_because` and "! not final" appear only when an incomplete relay
  answer is what keeps an anchored count from final, not while the count is
  provisional anyway.

## [0.7.1] — 2026-10-22

### Changed

- Ballots and ballot stamps are read page by page from each relay with
  `until`, so newer events under a poll's or a ballot's tag cannot push them
  out of a relay's answer. An anchored poll's count is held provisional, and
  says why, when a relay's ballot answer was cut short or a relay the ballots
  came from did not answer the stamp lookup to the end. `--json` adds
  `not_final_because`.

## [0.7.0] — 2026-10-22

As oc-vote-protocol's anchored ballots (SPEC §4.6), on vote-core 2.0.0. From a
deadline of 2026-11-15T00:00:00Z a ballot is in time when a Bitcoin block
anchors it: use 0.7.0 or later.

### Changed

- `tally` counts an anchored poll against the chain: the tip and `H_close`
  from mempool.space (or `--mempool-base`), and each ballot's anchor height from
  every OC Stamp copy the relays hold. Each stamp's id is rebuilt from its
  fields and its proof walked to block headers this CLI fetches; what a stamp
  declares about its anchor is not read. It prints the state (`tallied`,
  `provisional` with the count not yet anchored, `deferred`, or
  `awaiting reveal`), what decided timing, and the ballots counted. A relay set
  that did not finish answering, or a header that could not be read, stops the
  tally with an error rather than a count.
- `vote` stamps the ballot it publishes in an anchored poll, under a fresh key,
  and publishes the stamp.
- `reveal` refuses, without `--force`, an anchored poll's reveal before the tip
  reaches `H_close + G + 6`, when talliers would not accept it.

## [0.6.4] — 2026-10-22

### Changed

- `tally`, `verify` and `discover` verify every copy of a ballot or poll the
  relays return before they deduplicate: `tally` passes every distinct copy to
  vote-core 1.6.1, `verify` reports a ballot valid when any copy of it
  verifies, and `discover` lists a poll id once a copy of it verifies.

## [0.6.3] — 2026-10-22

### Changed

- Requires `@orangecheck/vote-core` ^1.6.0 (oc-vote-protocol errata of
  2026-10-22): poll deadlines and ballot times are read only as `iso8601_utc`,
  and a reveal counts only once the deadline has passed by this machine's
  clock and only with the key for the poll's `reveal_pk`.

## [0.6.2] — 2026-10-16

### Fixed — signatures verify again on a fresh install

- BIP-322 checks use `@orangecheck/bip322` instead of `bip322-js`. bitcoinjs-lib 6.1.9 (2026-10-13) made PSBT extraction throw on BIP-322's virtual
  `to_spend` input, so bip322-js, and every check built on it, rejected every
  signature.

## [0.6.1] — 2026-10-08

### Changed

- `oc-vote tally` names the checks a run skipped: `--no-verify` (signatures)
  and `--snapshot` (snapshot resolution and confirmations), as a
  `! not checked:` line and as `skipped` in `--json` output.

## [0.6.0] — 2026-09-24

### Changed

- **Relay transport is `@orangecheck/nostr-core` ^0.4.0.** The CLI's own
  WebSocket query and publish code is removed. Queries now keep only events
  whose NIP-01 id, BIP-340 signature and filter match verify, and the default
  relay set is nostr-core's `DEFAULT_RELAYS` (the one vote.ochk.io uses).
  On Node < 22, which has no global `WebSocket`, the CLI installs `ws` as it.
- **Absence needs a finished answer.** A relay counts as having answered only
  if it sent EOSE; a relay that timed out or closed after sending some events
  does not. `tally`, `show`, `verify`, `vote` and `reveal` report "no relay
  finished answering" instead of "poll not found" when no relay reached EOSE,
  and `tally`, `show`, `verify` and `discover` refuse to work from a ballot or
  poll set no relay finished sending. `tally` likewise refuses to report a
  secret poll as awaiting reveal on an unfinished reveal query.

## [0.5.0] — 2026-09-24

### Fixed

- **`tally` resolves a `"deadline"` snapshot per SPEC §3** — the greatest
  block whose `median_time_past` is ≤ the deadline, with 6 confirmations —
  instead of the current chain tip. The tip moved after voting closed, so
  the CLI weighed UTXOs at a different block than other talliers (968432
  against 947961 on a live poll). Resolution is vote-core 1.4's
  `resolvePollSnapshot`, the same code the web tallier runs. A snapshot
  without 6 confirmations is an error, not a tally. `--snapshot` still
  overrides a deadline poll explicitly.
- Requires `@orangecheck/vote-core` ^1.4.0.

## [0.4.1] — 2026-09-24

### Changed

- **Requires `@orangecheck/lock-core` ^1.2.0** (was ^0.1.0). lock-core now
  rejects an envelope whose `sig.pubkey` differs from `from.address`; in
  `tally` such a ballot drops its voter and the rest of the tally stands.

## [0.4.0] — 2026-09-24

### Changed

- **Requires `@orangecheck/vote-core` ^1.3.0** (was ^0.1.1).
- **`tally` unseals through vote-core's `unseal` callback.** Each voter's
  option now comes from the ballot vote-core verified and kept after the
  tiebreak (SPEC §8), not from a voter-keyed map filled from every relay
  ballot.
- **Polls and reveals are chosen by content and signature, not recency.**
  Every command fetched `limit: 1` under the d-tag and used the newest event.
  They now fetch every event under the d-tag and take one whose content
  hashes to the requested id and whose creator signature verifies
  (SPEC §3.2, §10.1). `tally` and `vote` refuse a poll whose signature does
  not verify; `show` and `verify` report it.
- **`tally` uses a reveal only if it verifies** (creator signature over
  `reveal_id`, not before the deadline — §6.4, §10.3); `reveal` likewise
  counts only a verified reveal as already published.
- **`tally` passes the chain tip** so a poll's fixed `snapshot_block` must
  have 6 confirmations (§10.5).
- **`discover`** filters on the `oc-vote-poll` tag and lists only polls whose
  creator signature verifies.

## [0.3.1] — 2026-09-03

### Fixed

- **Dropped `wss://relay.nostr.band` from `DEFAULT_RELAYS`.** It is
  unreachable, not slow: DNS resolves 95.216.33.150 but port 443 never
  completes a handshake, and the apex `nostr.band` is down too — verified from
  two independent networks while `nos.lol` connected fine from both. Fan-outs
  wait on every relay, so a dead entry costs the full per-relay timeout on
  every command.

- **`wss://relay.ochk.io` added.** It accepts OC Vote kinds, and after the
  2026-09-03 d-tag policy correction in `oc-relay-infra` it actually stores
  them. Until then it rejected every poll, ballot and reveal this CLI published:
  its allowlist read `oc-vote-poll:` where `oc-vote-protocol` SPEC §12 — and
  this CLI — say `oc-vote:poll:`.

## [0.2.0] — Initial published state

Initial public release. Shell interface for tallying, verifying, and inspecting OC Vote polls and ballots.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-vote-cli-v0.2.0...HEAD
[0.2.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-vote-cli-v0.2.0
