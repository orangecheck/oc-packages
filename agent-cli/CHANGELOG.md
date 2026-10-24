# Changelog

All notable changes to **`@orangecheck/agent-cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.3.2] — 2026-10-24

### Dependencies

`@orangecheck/agent-core` ^2.8.0, whose verifiers answer with a result for any
input: a revocation list holding entries that are not revocations is read
around them, and they are counted in `revocationsSkipped`.

## [0.3.1] — 2026-10-22

### Dependencies

`@orangecheck/bip322` ^1.1.0, so a signature with the final BIP-322 `smp`
prefix verifies in every install, including a lockfile that held 1.0.x.

## [0.3.0] — 2026-10-21

### Changed — an action is checked live

- `verify` on `[delegation, action]` uses agent-core 2.7's `verifyAction`, as
  of now (oc-agent-protocol 1.7.0): the delegation in force now, a revocation
  in effect refuses, and `signed_at` within 120 seconds of the clock
  (`E_STALE` otherwise, with a hint to audit instead). The output says when
  it was checked.

### Added

- `--as-of-signed-at` audits a past action as of its own `signed_at`, and says
  whether that time is the agent's claim or fixed by a verified anchor.
- `--revocations <file>`: a JSON array of the revocations fetched for the
  delegation. Without it, the output says revocation was not checked.

### Fixed

- `--version` prints the package's version.
- The header and README say which commands take `--json`; `canonical` does not.

## [0.2.4] — 2026-10-20

### Fixed — the offline note names a query relays answer

- The "revocation not checked" note told users to query kind 30085 "by
  #delegation". Relays do not index that tag and most reject the filter. It
  now names `"#t": [delegation id]` (oc-agent-protocol 1.4.1, SPEC §9.4).

## [0.2.3] — 2026-10-16

### Fixed — signatures verify again on a fresh install

- BIP-322 checks use `@orangecheck/bip322` instead of `bip322-js`. bitcoinjs-lib 6.1.9 (2026-10-13) made PSBT extraction throw on BIP-322's virtual
  `to_spend` input, so bip322-js, and every check built on it, rejected every
  signature.

## [0.2.2] — 2026-10-08

### Changed

- `oc-agent verify --skip-sig` no longer prints "verified": the line says the
  envelope is well-formed and its signature was not checked. `--json` output
  carries `signature_checked`.

## [0.1.0] — Initial published state

Initial public release. CLI for OC Agent — mint delegations, sign actions, verify, inspect envelopes from the shell.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-cli-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-cli-v0.1.0
