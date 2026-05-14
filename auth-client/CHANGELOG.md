# Changelog

All notable changes to **`@orangecheck/auth-client`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.1.0] — 2026-05-14 · WebAuthn step-up hooks

Additive · all v2.0.0 consumers keep working unchanged. Three new
React hooks wrap the ochk.io `/api/auth/webauthn/*` surface plus the
`@simplewebauthn/browser` ceremony:

- `useWebAuthnRegister()` — bind a hardware key to the account.
- `useWebAuthnList()` — list / rename / revoke registered keys.
- `useStepUpAuth()` — assert against a registered key before a
  sensitive action; on success refreshes the session so
  `verifyStepUpClaim(payload, …)` (from auth-core v2.1.0) flips to
  true immediately.

`@simplewebauthn/browser` is now a hard runtime dependency. Bumps
the peer requirement for `@orangecheck/auth-core` to `^2.1.0` (the
new `step_up_at` claim + `verifyStepUpClaim` helper).

## [0.1.0] — Initial published state

Initial public release. `<OcSessionProvider>`, `useOcSession()`, `<OcSignInButton>`, `<OcAccountPill>` for cross-subdomain ochk.io auth.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-auth-client-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-auth-client-v0.1.0
