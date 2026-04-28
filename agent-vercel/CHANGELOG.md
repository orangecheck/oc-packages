# Changelog

All notable changes to **`@orangecheck/agent-vercel`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message changes are coordinated via [`oc-agent-protocol`](https://github.com/orangecheck/oc-agent-protocol)'s CHANGELOG.

## [Unreleased]

- _(no pending changes)_

## [0.0.1] — Initial in-design release

Initial published state. Provider-agnostic wrapper around the Vercel AI SDK `tool()` shape, canonicalizing `(verb, args, callId)` and emitting agent-action envelopes per execution.

The canonicalization shape (`{args, call_id, verb}` lexicographic, RFC 8785 canonical JSON, trailing LF) is locked from v0.0.1 onward.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-vercel-v0.0.1...HEAD
[0.0.1]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-vercel-v0.0.1
