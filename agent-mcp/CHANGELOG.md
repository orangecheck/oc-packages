# Changelog

All notable changes to **`@orangecheck/agent-mcp`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.5.3] — 2026-10-25

### Changed

- `stampInvocation` and `invokeWithStamp` default the exercised scope to
  `mcp:invoke(server="<server>",tool="<tool>")`, written through agent-core's
  `canonicalizeScope` with both as quoted values. They are read as written: a
  tool called `"*"` exercises that tool, and a server URL with a query stays
  whole. The quoted form is a sub-scope of the same grants as before.
- README: the server-side example pins the called tool by value.

## [0.5.2] — 2026-10-25

### Changed

- Requires `@orangecheck/agent-core` `^2.9.0` and `@orangecheck/agent-signer`
  `^0.5.2`. A validly signed revocation revokes whatever its reason or its
  unsigned copy fields hold, and a federation revocation stands on M valid
  signatures from distinct guardians (oc-agent-protocol 1.9.0).

## [0.5.1] — 2026-10-23

### Changed

- Requires `@orangecheck/agent-signer` `^0.5.1` and `@orangecheck/agent-core`
  `^2.7.1`, the versions whose `verifyAction` checks an action as of the time
  of verification.

## [0.5.0] — 2026-10-21

### Changed — `invokeWithStamp` hands the action to the call

- `call` is now `(invocation, action) => Promise<T>`, called after the stamp,
  so the request can carry the action and the server can verify it before it
  runs the tool. A `call` that takes one argument works as before.

### Added

- `ACTION_META_KEY` (`io.ochk/agent-action`): where a `tools/call` request
  carries its action, under `params._meta`.

### Docs

- `McpInvocation.server` is the endpoint URL exactly as the delegation's scope
  names it. Only surrounding whitespace is trimmed; nothing is lowercased.
- The canonical invocation bytes end in one LF.
- The README's server example checks with agent-core 2.7's live `verifyAction`,
  binds `content`, pins the scope to this server and tool, and refuses a
  repeated action. The anchoring example uses `submitToCalendars` and
  `toStampOts`, which stamp-ots exports.

## [0.4.3] — 2026-10-20

### Fixed — the publish example tags the delegation id

- The "Composing with Nostr" example now adds `['t', action.delegation_id]`,
  the tag oc-agent-protocol 1.5.0 asks publishers to set so a delegation's
  actions can be listed by `#t`. It also stops calling kind 30084 a shared
  OC Stamp transport: stamps are on 30083. README only; no code change.

## [0.4.2] — 2026-10-20

### Fixed — the server-side verification example runs

- It called `verifyAction` without `revocations`, which `@orangecheck/agent-core`
  has refused with `E_MALFORMED` since 2.0.0, and with an undefined `bip322`.
  It now passes `revocations` (fetched by `"#t": [delegation.id]`) and verifies
  with `@orangecheck/bip322`.

## [0.1.0] — Initial published state

Initial public release. Model Context Protocol bridge so LLM toolchains can produce agent-signed tool calls.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-mcp-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-mcp-v0.1.0
