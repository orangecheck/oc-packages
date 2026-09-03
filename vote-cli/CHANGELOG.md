# Changelog

All notable changes to **`@orangecheck/vote-cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

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
