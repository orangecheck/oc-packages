# Changelog

All notable changes to **`@orangecheck/agent-vercel`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message changes are coordinated via [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)'s CHANGELOG.

## [Unreleased]

- _(no pending changes)_

## [1.1.5] — 2026-10-26

### Changed

- Requires `@orangecheck/agent-signer` `^0.6.0`. The previous release still
  allowed only 0.5.x, so it signed with agent-signer 0.5.2 and installed a
  second agent-core (2.9.0) beside 2.10.0.

## [1.1.4] — 2026-10-25

### Changed

- `stampToolCall` defaults the exercised scope to `vercel:tool(verb="<verb>")`, written
  through agent-core's `canonicalizeScope` with the name as a quoted value. A
  name is read as written, so a tool called `"*"` exercises that tool. The
  quoted form is a sub-scope of the same grants as before.
- Requires `@orangecheck/agent-core` `^2.10.0` (OC Agent 1.10.0): stamping refuses a
  scope a strict verifier refuses.

## [1.1.3] — 2026-10-25

### Changed

- Requires `@orangecheck/agent-core` `^2.9.0` and `@orangecheck/agent-signer`
  `^0.5.2`. A validly signed revocation revokes whatever its reason or its
  unsigned copy fields hold, and a federation revocation stands on M valid
  signatures from distinct guardians (oc-agent-protocol 1.9.0).

## [1.1.2] — 2026-10-23

### Changed

- Requires `@orangecheck/agent-signer` `^0.5.1` and `@orangecheck/agent-core`
  `^2.7.1`, the versions whose `verifyAction` checks an action as of the time
  of verification.

## [0.0.1] — Initial in-design release

Initial published state. Provider-agnostic wrapper around the Vercel AI SDK `tool()` shape, canonicalizing `(verb, args, callId)` and emitting agent-action envelopes per execution.

The canonicalization shape (`{args, call_id, verb}` lexicographic, RFC 8785 canonical JSON, trailing LF) is locked from v0.0.1 onward.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-vercel-v0.0.1...HEAD
[0.0.1]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-vercel-v0.0.1
