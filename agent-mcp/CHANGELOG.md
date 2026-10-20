# Changelog

All notable changes to **`@orangecheck/agent-mcp`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

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
