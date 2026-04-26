# Changelog

All notable changes to **`@orangecheck/relay-filter`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.1.3] — Initial published state

Initial public release. Drop-in Strfry / Nostr-relay plugin that rejects events from addresses without a valid OrangeCheck attestation.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-relay-filter-v0.1.3...HEAD
[0.1.3]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-relay-filter-v0.1.3
