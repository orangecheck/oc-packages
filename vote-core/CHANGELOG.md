# Changelog

All notable changes to **`@orangecheck/vote-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.4.0] — 2026-09-24

### Added — SPEC §3 snapshot resolution

- `resolveDeadlineSnapshot(deadline, source)` resolves `snapshot_block:
  "deadline"` to the greatest block whose `median_time_past` is ≤ the
  deadline, and returns `E_REORG` until it has 6 confirmations. Fails closed
  (`E_SNAPSHOT_UNRESOLVED`) on explorer errors or an unbounded walk.
- `resolvePollSnapshot(poll, source)` applies it to any poll: a numeric
  `snapshot_block` is kept and held to the same 6-confirmation floor.
- `mempoolBlockTimeSource({ base?, fetch? })` is a `BlockTimeSource` over a
  mempool.space-compatible REST API.

This was implemented separately by each client; one implementation here
means every tallier resolves the same poll to the same block.

## [1.3.0] — 2026-09-24

### Added — `unseal` for secret-mode tallies

`tally({ unseal })` takes a callback that opens one ballot's envelope. It is
called once per voter, on the ballot that passed signature verification and
the tiebreak (SPEC §8 steps 1-3), so the plaintext always comes from the
ballot being counted.

`revealedOptions` is deprecated. It is keyed by voter, so it cannot record
which of a voter's ballots an option was unsealed from; a caller filling it
from every relay ballot could have a voter's signed ballot judged against a
different ballot's envelope. It still works and is ignored when `unseal` is
given.

### Added — `verifyPoll`, `verifyReveal`, `isMainnetAddress`, `VoteError`

- `verifyPoll(poll, verify)` checks SPEC §3.3 structure and the creator's
  BIP-322 signature over `poll_id` (§10.1).
- `verifyReveal(reveal, poll, verify)` checks the poll binding, the
  not-before-deadline rule (§10.3) and the creator's signature over
  `reveal_id` (§6.4).
- `isMainnetAddress(addr)` classifies an address by network prefix.
- `VoteError` carries a SPEC §9 `code`.

### Changed — `tally` enforces more of SPEC §3.3, §4.3, §8 and §10

- The poll's creator signature is verified whenever ballot signatures are;
  a poll that fails throws `VoteError('E_BAD_SIG')`.
- Ballots whose `voter` is not a mainnet address are dropped before any UTXO
  lookup.
- A revealed option must be one of `poll.options` (or `withdraw`); anything
  else drops the ballot (`E_UNKNOWN_OPTION`).
- Option ids are plain keys: `tallies` is built with own properties and
  membership is tested with `hasOwnProperty`, so ids like `__proto__` count
  like any other.
- The snapshot height must be a positive integer, and with the new
  `tipHeight` option `tally` throws `VoteError('E_REORG')` unless the snapshot
  has at least 6 confirmations (§10.5).

## [1.2.0] — 2026-09-11

### Added — `tally` rejects poll and ballot versions it does not support

SPEC §12: "Clients MUST reject polls and ballots whose `v` they do not
support." Nothing enforced it at runtime. The `v: 0` on the `Poll`/`Ballot`
interfaces is a compile-time literal and **types are erased**, so a poll parsed
from a relay event carried whatever integer the publisher wrote.

An unsupported **poll** throws, matching the `weight_mode` gate beside it — an
unsupported poll is not a partial tally. An unsupported **ballot** is dropped
instead, because one publisher on a format we do not speak must not void
everyone else's tally.

`POLL_VERSION`, `BALLOT_VERSION` and `REVEAL_VERSION` are now exported: they are
what the runtime compares against, the role `ENVELOPE_VERSION` plays in
lock/stamp/pledge/agent.

### Fixed — the `tally` docs still described the removed fail-open behaviour

The header told callers to "pass `verifySig: false` to skip" — an option that
does not exist — and the `verifyBip322` field doc claimed "If omitted, signature
verification is skipped". `tally` has failed closed since 1.1.0. The field doc
travels into the `.d.ts`, so it was what a consumer read in their editor while
deciding whether a verifier was needed.

## [1.1.0] — 2026-09-03

### Changed — `tally` now fails closed on a missing verifier

`tally` used to test `if (!opts.skipSignatures && opts.verifyBip322)`. Both
options are optional, so a caller who supplied **neither** got a tally over
completely unverified ballots and no indication anything was wrong.

`agent-core`'s equivalent has always returned `E_BAD_SIG` ("no BIP-322
verifier supplied") in exactly that situation. vote-core was the family
outlier, and the consequence shipped: `oc-vote-web`'s live poll page tallied
forged ballots.

`tally` now throws unless you pass a verifier or explicitly state
`skipSignatures: true`. Skipping is a decision the caller has to make out loud.

**This can break a caller — deliberately, and loudly.** Any code that hit the
old silent path was producing an untrustworthy result; a thrown error is the
correct outcome and is visible immediately, unlike the wrong tally it replaces.

### Added — `verify`, a named-argument verifier

```ts
verify?: (args: { address: string; message: string; signature: string }) => Promise<boolean> | boolean
```

Prefer it over `verifyBip322`. **This package's positional order is
`(address, message, signature)`, and every other package in the family —
`agent-core`, `lock-core`, `stamp-core`, `pledge-core`, `stamp-cli` — declares
that callback as `(msg, signatureB64, address)`.** TypeScript cannot catch the
difference: both are `(string, string, string) => Promise<boolean>`, so a
verifier written for a sibling package compiles cleanly here and then verifies
the wrong things. That is what happened in `oc-vote-web`, where every check
silently passed garbage.

`verifyBip322` keeps its existing order and behaviour. Changing it would be a
*silently* breaking change — callers would keep compiling and start verifying
incorrectly, which is the worst way to break an API. An object literal cannot
swap its fields the way three positional strings can, so `verify` closes the
trap for new code and the old form is documented with the hazard spelled out.

`verify` takes precedence when both are supplied.

## [Unreleased]

- _(no pending changes)_

## [0.1.0] — Initial published state

Initial public release. Reference impl for OC Vote — canonicalization + the deterministic `tally()` pure function.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-vote-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-vote-core-v0.1.0
