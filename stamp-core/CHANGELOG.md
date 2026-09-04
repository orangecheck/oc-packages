# Changelog

All notable changes to **`@orangecheck/stamp-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

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
