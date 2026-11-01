# Changelog

All notable changes to **`@orangecheck/vote-react`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.1.1] — 2026-11-01

### Fixed

- `useTally` clears `data` when a fetch fails, so `OcPoll` and anything built
  on the hook no longer show an earlier tally beside the error. Before, the
  last good numbers stayed on screen after a refresh failed or the tally
  service refused to count. The next good answer shows a tally again.

## [0.1.0] — Initial published state

Initial public release. React components for OC Vote poll creation, ballot casting, and tally rendering.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-vote-react-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-vote-react-v0.1.0
