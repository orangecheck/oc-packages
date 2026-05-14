# Changelog

All notable changes to **`@orangecheck/auth-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.1.0] — 2026-05-14 · WebAuthn step-up surface

Additive · all v2.0.0 consumers continue to verify unchanged. New
`step_up_at?: number` claim on `SessionPayload` carries the unix
seconds when the user last completed a WebAuthn assertion on the
auth host. New `verifyStepUpClaim(payload, { max_age_secs })` helper
is the single source of truth for "is this session freshly stepped
up." Consumer subdomains gating sensitive actions (spend > 1M sats,
project_key creation, etc.) read it both before triggering
`useStepUpAuth()` and again server-side after JWT verify.

`signSession`'s `claims` type now accepts `merged_from?: string[]`
and `step_up_at?: number`. Existing callers that don't pass them
mint identical tokens (omitted claims, not null-valued).

See `AUTH-OVERVIEW.md` §6 + `AUTH-TODO.md` §6 in the workspace for
the broader design. The matching auth-client hooks ship in
`@orangecheck/auth-client` v2.1.0 the same day.

## [0.1.0] — Initial published state

Initial public release. Crypto-only Ed25519 JWT verify + cookie helpers — the consumer half of the ochk.io auth host stack.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-auth-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-auth-core-v0.1.0
