# Changelog

All notable changes to **`@orangecheck/cli`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.3.0] — 2026-09-03

### Fixed

- **`@orangecheck/sdk` `^0.1.3` → `^1.4.0`.** `oc check --addr <address>` always reported a failure. `--id` and `--identity` were unaffected.

  The pinned SDK filtered Nostr relays on a multi-letter `#address` tag. Relays
  index single-letter tag names only (NIP-12), so the query matched nothing and
  every lookup by address answered `not_found` — including for attestations
  that plainly exist. Fixed in `@orangecheck/sdk` 1.4.0, which queries the
  indexed `#t` tag. Lookups by attestation id (`#d`) and by identity (`#i`)
  were never affected.

  Measured against live relays before and after, for an address holding a real
  10,000-sat / 308-day attestation:

  ```
  sdk 0.1.4  ->  not_found
  sdk 1.4.0  ->  ok, sats 10000, days 308
  ```

  No API change: `CheckResult`, `CheckParams` and the `./scoring` subpath are
  identical across the two SDK majors, so this is a drop-in for callers.


## [0.1.3] — Initial published state

Initial public release. `oc` shell for one-shot OrangeCheck checks, attestation creation, and verification.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-cli-v0.1.3...HEAD
[0.1.3]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-cli-v0.1.3
