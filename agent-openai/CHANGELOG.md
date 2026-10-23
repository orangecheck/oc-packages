# Changelog

All notable changes to **`@orangecheck/agent-openai`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message changes are coordinated via [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)'s CHANGELOG.

## [Unreleased]

- _(no pending changes)_

## [1.1.2] — 2026-10-23

### Changed

- Requires `@orangecheck/agent-signer` `^0.5.1` and `@orangecheck/agent-core`
  `^2.7.1`, the versions whose `verifyAction` checks an action as of the time
  of verification.

## [0.0.1] — Initial in-design release

Initial published state. Transport-agnostic canonicalization + stamping for OpenAI function calls. Covers both Responses API `function_call` items and legacy Chat Completions `tool_calls`.

The canonicalization shape (`{arguments, id, name}` lexicographic, RFC 8785 canonical JSON, trailing LF) is locked from v0.0.1 onward.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-openai-v0.0.1...HEAD
[0.0.1]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-openai-v0.0.1
