# Changelog

All notable changes to **`@orangecheck/agent-cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

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
