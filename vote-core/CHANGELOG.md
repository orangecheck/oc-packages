# Changelog

All notable changes to **`@orangecheck/vote-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.1.0] — 2026-09-03

### Changed — `tally` now fails closed on a missing verifier

`tally` used to test `if (!opts.skipSignatures && opts.verifyBip322)`. Both
options are optional, so a caller who supplied **neither** got a tally over
completely unverified ballots and no indication anything was wrong.

`agent-core`'s equivalent has always returned `E_BAD_SIG` ("no BIP-322
verifier supplied") in exactly that situation. vote-core was the family
outlier, and the consequence shipped: `oc-vote-web`'s live poll page tallied
forged ballots.

`tally` now throws unless you pass a verifier or explicitly state
`skipSignatures: true`. Skipping is a decision the caller has to make out loud.

**This can break a caller — deliberately, and loudly.** Any code that hit the
old silent path was producing an untrustworthy result; a thrown error is the
correct outcome and is visible immediately, unlike the wrong tally it replaces.

### Added — `verify`, a named-argument verifier

```ts
verify?: (args: { address: string; message: string; signature: string }) => Promise<boolean> | boolean
```

Prefer it over `verifyBip322`. **This package's positional order is
`(address, message, signature)`, and every other package in the family —
`agent-core`, `lock-core`, `stamp-core`, `pledge-core`, `stamp-cli` — declares
that callback as `(msg, signatureB64, address)`.** TypeScript cannot catch the
difference: both are `(string, string, string) => Promise<boolean>`, so a
verifier written for a sibling package compiles cleanly here and then verifies
the wrong things. That is what happened in `oc-vote-web`, where every check
silently passed garbage.

`verifyBip322` keeps its existing order and behaviour. Changing it would be a
*silently* breaking change — callers would keep compiling and start verifying
incorrectly, which is the worst way to break an API. An object literal cannot
swap its fields the way three positional strings can, so `verify` closes the
trap for new code and the old form is documented with the hazard spelled out.

`verify` takes precedence when both are supplied.

## [Unreleased]

- _(no pending changes)_

## [0.1.0] — Initial published state

Initial public release. Reference impl for OC Vote — canonicalization + the deterministic `tally()` pure function.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-vote-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-vote-core-v0.1.0
