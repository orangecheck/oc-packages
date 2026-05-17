# Changelog

All notable changes to **`@orangecheck/sdk`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [1.1.0] — 2026-05-16 · Binding Attestation verifier (OC Attest v1)

Additive. Reference implementation of the v1 Binding Attestation
(`oc-attest-protocol/SPEC-BINDING.md`) — the mutually-signed BTC ⇄ Nostr
identity bond. Three new exports:

- `buildBindingMessage(input)` — the canonical 8-line binding message,
  with the §3.5 line-smuggling defense (rejects CR/LF/control in any
  field).
- `bindingId(message)` — `SHA-256(message)` content address.
- `verifyBinding(envelope)` — the full §7 verification algorithm: BIP-322
  root proof + Nostr (BIP-340 Schnorr) counter-signature + the
  single-message rule, pure and offline, zero trusted party.

Conformance: all 8 `bv*` vectors from the protocol repo pass (binding
canonical message, `binding_id`, mutual-signature verify, tampered-sig
rejection, line-smuggling rejection, header cross-verify rejection).
The v0 stake-attestation API is unchanged.

## [0.1.5] — Initial published state

Initial public release. TypeScript core — `check`, `verify`, `createAttestation`. Byte-equal to `orangecheck` (Python).

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-sdk-v0.1.5...HEAD
[0.1.5]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-sdk-v0.1.5
