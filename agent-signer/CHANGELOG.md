# Changelog

All notable changes to **`@orangecheck/agent-signer`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.5.2] — 2026-10-24

- `revoke` writes a reason of printable ASCII only, at most 128 bytes, and
  refuses any other before it asks for a signature (SPEC §9.1, 1.9.0).
  Requires `@orangecheck/agent-core` ^2.9.0 for `authoredReasonProblem`; it
  and `shownReason` are re-exported here.

## [0.5.1] — 2026-10-22

- `revoke` lets the delegation's agent revoke whatever
  `revocation.holders` says, as the principal always could (oc-agent-protocol
  1.8.0, §9.5). Requires `@orangecheck/agent-core` ^2.7.1.

## [0.5.0] — 2026-10-21

- Requires `@orangecheck/agent-core` ^2.7.0, whose `verifyAction` checks an
  action as of the time of verification.
- Re-exports `verifyActionAsOfSignedAt`, `createReplayGuard`,
  `DEFAULT_MAX_SKEW_MS` and the `VerifyActionInput` /
  `VerifyActionAsOfSignedAtInput` types beside the verifiers it already
  re-exported.

## [0.1.0] — Initial published state

Initial public release. Helpers for signing delegations (principal) and actions (agent).

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-signer-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-signer-v0.1.0
