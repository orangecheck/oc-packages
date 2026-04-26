# Changelog

All notable changes to **`@orangecheck/lock-crypto`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.1.0] — Initial published state

Initial public release. Narrow crypto primitives (X25519 / HKDF-SHA256 / AES-256-GCM) for OC Lock.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-lock-crypto-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-lock-crypto-v0.1.0
