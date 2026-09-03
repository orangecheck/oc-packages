# Changelog

All notable changes to **`@orangecheck/sdk`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.5.1] — 2026-09-03

### Fixed

- Re-export `FANOUT_DEADLINE_MS` from the package root. 1.5.0 exported it from
  `src/nostr.ts` but not from `index.ts`, so the constant the 1.5.0 notes tell
  you to compare against `@orangecheck/gate`'s `lookupTimeoutMs` was not
  actually reachable — `import { FANOUT_DEADLINE_MS } from '@orangecheck/sdk'`
  threw. `DEFAULT_RELAYS` sits right beside it and was exported, so this was
  just an omission. No behaviour change.

## [1.5.0] — 2026-09-03

### Fixed

- **`check()` took 10.4 seconds. It now takes about one.** The relay queries
  fan out with `Promise.allSettled`, so a fan-out costs as long as its
  *slowest* relay — and `relay.nostr.band`, in `DEFAULT_RELAYS`, had stopped
  accepting TCP connections altogether (DNS still resolves; port 443 never
  completes a handshake, from two independent networks, and the apex
  `nostr.band` is down too). Every call paid the full 10s per-relay timeout.

  ```
  check({ addr })  1.4.0   10.4s
  check({ addr })  1.5.0    1.0s
  ```

  Two changes: `relay.nostr.band` is out of `DEFAULT_RELAYS`, and all four
  fan-outs (`publishToRelays`, `queryByAttestationId`, `queryByAddress`,
  `queryByIdentity`) now share one wall-clock budget, `FANOUT_DEADLINE_MS`
  (4000). The second matters more — whichever relay is dead or slow next, a
  fan-out is bounded.

- **This was breaking `@orangecheck/gate` outright, not just slowing it.** Gate
  races `check()` against a 5s `lookupTimeoutMs`, so a 10.4s lookup lost the
  race every time and no address-based gate decision could ever succeed.
  `FANOUT_DEADLINE_MS` is deliberately below that 5s default, and a test now
  asserts the relationship so raising one without the other fails loudly.

  Dependents pinning `^1.4.0` pick this up with no change on their side.

### Notes

- `relay.damus.io` stays in the defaults. It is unreachable from some
  serverless runtimes but answers in ~390ms from a developer machine and
  returns real events, which reads as datacenter-IP blocking rather than an
  outage. With a shared deadline an unreachable relay is cheap, so there is no
  reason to drop one that works for most callers.

## [Unreleased]

- _(no pending changes)_

## [1.3.0] — 2026-05-18 · Remove the Binding Attestation API (reverted)

Removes `verifyBinding`, `buildBindingMessage`, `bindingId`,
`buildBindingEventTemplate`, `assembleBindingEnvelope`, `xOnlyHexToNpub`
and their types — the entire Binding Attestation surface added in 1.1.0
and 1.2.0 (both two days old, no external consumers).

That API was built on a mis-designed premise: a *mutually-signed* BTC ⇄
Nostr artifact requiring the Nostr key to counter-sign. oc-attest is a
**single-signature** protocol — one BIP-322 signature by the Bitcoin
address links it to a list of *self-asserted* handles (Nostr, GitHub,
DNS, Twitter); Nostr is transport, not a trust root. Identity linking is
already served by the v0 `createAttestation` / `verify` API, unchanged.
The `oc-attest-protocol` v1 spec and Nostr kind 30079 were reverted in
lockstep.

## [1.2.0] — 2026-05-16 · Binding Attestation issuer-side construction

Additive. Completes the round-trip for the v1 Binding Attestation — v1.1.0
shipped verification, this ships the construction helpers an issuer needs:

- `xOnlyHexToNpub(hex)` — encode a 32-byte x-only Nostr key as `npub1…`
  (inverse of the §6 decode).
- `buildBindingEventTemplate({ message, btcSignature, nostrPubkeyHex, btc })`
  — the unsigned kind-30079 NIP-01 event template; pass it to a NIP-07
  `signEvent` to obtain the Nostr counter-signature.
- `assembleBindingEnvelope({ message, btcSignature, nostrEvent })` — the
  full §5 transport envelope, structural fields re-derived from the signed
  message.

A round-trip conformance test confirms `assembleBindingEnvelope` rebuilds
an envelope that `verifyBinding` accepts. The v0 API is unchanged.

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
