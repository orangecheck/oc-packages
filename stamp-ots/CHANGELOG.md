# Changelog

All notable changes to **`@orangecheck/stamp-ots`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.3.0]

### Changed

- Depends on `@orangecheck/stamp-core ^1.0.0` (was `^0.1.2`). stamp-core 1.0.0
  ships the same `dist` as 0.1.2, and this package uses only its `StampOts`
  type, so behaviour is unchanged. A test now runs `makeAnchorVerifier`
  through stamp-core 1.x `verify()` to pin the `verifyOtsAnchor` contract.

## [0.2.1]

### Fixed

- Calendar submission sends no `Content-Type`. `application/vnd.opentimestamps.v1`
  is not a CORS-safelisted type, so browsers sent a preflight, which OTS
  calendars answer with 501, and the submission never left the page. The
  calendars accept the bare digest body.

## [0.2.0]

### Added

- Built-in OpenTimestamps proof parser and serializer (`parseProof`, `parseDetached`, `serializeTimestamp`, `bitcoinAnchors`, `pendingCommitments`, `mergeAt`). Accepts the bare timestamp carried in `ots.proof` and detached `.ots` files. Depends on `@noble/hashes`.
- `mempoolHeaderSource()`, `walkOtsProof()`, `blockHashOf()`.

### Changed

- `makeAnchorVerifier`: `walkProof` is optional and defaults to the built-in parser. The proof must commit to the envelope id, the header at the declared height must hash to the declared block hash, and its Merkle root is compared in header byte order.
- `makeDefaultAnchorVerifier` uses the built-in parser; the optional `opentimestamps` peer dependency is removed.
- `upgradeProof` requests each pending attestation's commitment from its calendar (`GET /timestamp/<hex(commitment)>`), as the calendar protocol defines, and merges the answer into the proof. It takes `headerSource` (or `parseAnchor`, now called with the merged proof) and only contacts calendars listed in the proof.
- `CalendarClient.fetchProof` takes the commitment rather than the submitted digest.

## [0.1.1] — Initial published state

Initial public release. OpenTimestamps calendar client + proof helpers — bridges OTS into the Stamp envelope.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-stamp-ots-v0.1.1...HEAD
[0.1.1]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-stamp-ots-v0.1.1
