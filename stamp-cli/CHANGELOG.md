# Changelog

All notable changes to **`@orangecheck/stamp-cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.2.0]

### Changed

- **`stamp verify` / `git-stamp verify` check OTS anchors** (SPEC §6.3, §8 step
  5). A confirmed claim is reported as anchored only when the proof commits to
  the stamp id and the block header at the claimed height hashes to the
  claimed block hash and carries the proof's Merkle root. A proof that does
  not chain exits 2 with `E_BAD_ANCHOR`; an unreachable header source leaves
  the claim unverified. `--require-anchor` requires a checked anchor. New
  `--headers-url` (default `https://mempool.space/api`) and `anchor_state` in
  the output.
- **`stamp anchor` upgrades pending proofs** from the calendars listed in the
  proof instead of re-submitting, which replaced the existing pending proof
  with a new one. The file is rewritten only when the proof changes.
- Depends on `@orangecheck/stamp-core ^1.0.0` (same `dist` as 0.1.2) and
  `@orangecheck/stamp-ots ^0.3.0`.

## [0.1.0] — Initial published state

Initial public release. `stamp` and `git-stamp` shells for OC Stamp envelope creation, verification, and OTS upgrades.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-stamp-cli-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-stamp-cli-v0.1.0
