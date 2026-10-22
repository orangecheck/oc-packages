# Changelog

All notable changes to **`@orangecheck/stamp-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.4.0] — 2026-10-22

### Changed — a check that could not be made is `unchecked`

- `verifyOtsAnchor` resolves `false` for a decided no, the header read and the
  proof not leading to it, which is `E_BAD_ANCHOR`. It throws when the check
  could not be made, for example when the header source does not answer.
- `verify()` reports a throwing `verifyOtsAnchor` as
  `anchor: { status: 'unchecked', blockHeight, blockHash, verified: false, reason }`,
  never as `E_BAD_ANCHOR` (SPEC §8.1 step 5, errata 1.0.6). The signature and id
  results stand; check the anchor again later.
- `VerifyOk['anchor']` gains the `unchecked` variant. Code that switches on
  `anchor.status` exhaustively handles it alongside `claimed`.

## [1.3.0] — 2026-10-21

### Added — `parseStamp`, the edge for an envelope from outside

Examples cast `JSON.parse` to `StampEnvelope`, so a malformed `.stamp` reached
the code as if it were well formed. `parseStamp(textOrValue)` checks every
field's shape and type (SPEC §4.1, §4.2) and returns the envelope typed, or
throws `StampError`: `E_UNSUPPORTED_VERSION` for a `v` other than 1,
`E_MALFORMED` for anything else. Unknown top-level fields are kept; a missing
`content.ref`, `stake` or `ots` reads as null. Text over 1,000,000 characters is
refused before parsing.

### Changed — `signed_at` is kept as given, under one rule

SPEC §0 allows `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS.sssZ`. stamp()
dropped a Date's milliseconds without saying so, and stamp() and verify() took
any number of fractional digits.

- `signedAt` takes a `Date` or a string. A Date keeps its milliseconds, written
  without them only when they are zero, so whole-second Dates sign exactly as
  before. A string must already be in one of the two forms and is used exactly
  as given. Anything else throws `E_MALFORMED`.
- The default, now, keeps its milliseconds.
- stamp(), verify() and parseStamp() share `isSignedAt`, which also refuses a
  date that does not exist (Feb 30, 25:00). verify() now returns `E_MALFORMED`
  for a `signed_at` such as `.5Z` or `.123456Z` that it used to accept.

### Docs

- `canonicalizeEnvelope` and `canonicalEnvelopeBytes` say which is SPEC §5's
  byte form (the bytes, ending in LF) and that neither feeds the id. The vector
  suite checks both against an independent serializer.
- `VerifyInput.verifyBip322` states its argument order,
  `(message, signatureB64, address)`, and that leaving it out fails closed with
  `E_BAD_SIG`.

## [1.2.0] — 2026-10-21

### Added — `checkStake`, for a stake reference nobody signed

`stake` is outside the canonical message, so it is outside the id and the
signature, and anyone who relays an envelope can strip it, add one or swap in
another address's attestation. oc-stamp-protocol errata 1.0.3 says so and makes
SPEC §8.1 step 7 require the attestation's address to equal `signer.address`.
`checkStake(envelope, attestation, policy)` runs that step against an
attestation you resolved now (attest.ochk.io `/api/check?id=` JSON fits as is)
and ignores the declared `sats_bonded` / `days_unspent`. The vector harness runs
the spec's new strip, swap and own vectors (v06–v08) through it.

## [1.1.0] — 2026-10-08

### Changed — an unwalked anchor is `claimed`, not `confirmed`

`verify()` without `verifyOtsAnchor` now reports a confirmed `ots` block as
`{ status: 'claimed', blockHeight, blockHash, verified: false }`. The `ots`
block is not covered by the signature, so its block is the envelope's say-so
until a verifier walks the proof (SPEC §6.3). `confirmed` now always means a
passing `verifyOtsAnchor`, and carries `verified: true`.

Shipped as a minor so `^1` consumers pick it up. Code that read
`status === 'confirmed'` and then checked the anchor itself should accept
`claimed` as well.

## [Unreleased]

- _(no pending changes)_

## [1.0.0] — reconstructed 2026-09-04

**No code change.** Verified by unpacking both versions from npm: `dist/index.js`
is byte-identical to 0.1.2, `dist/index.d.ts` is identical, and the file sets
match. 1.0.0 declares the API stable; it breaks nothing.

Recorded because the absence of an entry was itself a problem — `oc-stamp-web`
pinned `^0.1.2`, and a caret on a `0.x` version locks the MINOR, so the site
could never resolve 1.0.0. Anyone weighing that bump had a major version with
no changelog and no way to tell it was a no-op without doing this diff.

## [0.1.2] — Initial published state

Initial public release. Canonical message, envelope format, `stamp()` / `verify()` for OC Stamp.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-stamp-core-v0.1.2...HEAD
[0.1.2]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-stamp-core-v0.1.2
