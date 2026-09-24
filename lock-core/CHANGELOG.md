# Changelog

All notable changes to **`@orangecheck/lock-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.2.0] — 2026-09-24

### Added — `unseal` requires `sig.pubkey` to equal `from.address`

SPEC §4.3 verifies the signature against `sig.pubkey`, and §7.1 says the
envelope proves authorship by `from.address`. Nothing required the two to be
the same address, so a signature valid for one address was accepted on an
envelope whose `from` named another. `unseal()` now rejects a signed envelope
whose `sig.pubkey` differs from `from.address` with `E_BAD_SIG`. Envelopes made
by `seal()` always set both from the same value and are unaffected.

### Added — `UnsealResult.authenticated`

`true` only when the call verified the BIP-322 signature for `sender.address`.
`false` when `skipSenderVerification` was set, including every unsigned
envelope (`sig.value === ''`). In that case `sender` is an unverified claim;
show it as one, and do not treat `sender.address === self` as "sent by me".

## [1.1.0] — 2026-09-11

### Added — `unseal` rejects an unsupported envelope version

SPEC §9 says "Clients MUST reject envelopes whose `v` they do not support".
`unseal()` read expiry, envelope id, signature and recipients and then
decrypted, without ever looking at `env.v`. pledge-core, stamp-core and
agent-core all gate this; lock-core was the outlier.

Not exploitable before this: `id` canonicalizes `v` and the signature covers
`id`, so an existing envelope could not be re-labelled, and only v2 has ever
shipped. But a v3 envelope minted by a v3 sender was accepted and decrypted
under v2 rules, which is the semantic confusion the MUST exists to prevent.

Checked FIRST, before expiry and before the id recompute — you cannot
meaningfully interpret any field of a format you do not know. Throws
`E_UNSUPPORTED_VERSION`.

### Added — `seal` refuses a revoked device record explicitly

SPEC §3.5: revocation republishes the record with `device_pk` set to the literal
`"revoked"`, and "conforming senders MUST refuse to encrypt to a revoked device
record".

`seal()` did refuse, but only because `"revoked"` is not valid hex, so
`hexDecode` threw `hex string must have even length` — a plain `Error` with no
code, indistinguishable from a malformed record. A security guarantee that held
only because an unrelated helper happened to be strict, with no test covering
it. Now throws `E_REVOKED`, and refuses the whole seal when any recipient is
revoked rather than silently dropping them from a group envelope.

`REVOKED_DEVICE_PK` is exported for callers that filter before sealing.


## [0.1.0] — Initial published state

Initial public release. Sealed-envelope format, canonicalization, `seal()` / `unseal()` for OC Lock.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-lock-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-lock-core-v0.1.0
