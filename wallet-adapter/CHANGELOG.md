# Changelog

All notable changes to **`@orangecheck/wallet-adapter`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.5.0] — 2026-09-25

### Added — `verifyBip322({ address, message, signature })`

One BIP-322 verifier for every consumer, with named arguments. All three
arguments are strings, so a positional signature cannot be type-checked:
callers that pass them in a different order compile and then reject every
valid signature. Named arguments make the binding visible at the call site.

- Accepts base64 or hex, trims surrounding whitespace, and accepts legacy
  BIP-137 signatures where bip322-js does (P2PKH, P2SH-P2WPKH, P2WPKH).
- Resolves `false` on any malformed input; never throws.

### Changed

- `assertSignedBy` now takes the same named arguments,
  `assertSignedBy({ address, message, signature })`, and is built on
  `verifyBip322`.

## [0.4.3] — 2026-09-24

### Fixed — a signer only returns a signature by the requested address

UniSat and Leather sign with the wallet's active account and take no address,
so with another account active `getSigner(id, { address })` returned a valid
signature by a different key. Nothing the caller could verify against
`address` would accept it.

- Every signer now BIP-322-verifies its result against `opts.address` before
  returning it (legacy BIP-137 signatures for P2PKH / P2WPKH still pass), and
  throws `WrongAccountError` (`code: "E_WRONG_ACCOUNT"`) otherwise.
- UniSat (`getAccounts`) and Leather (`getAddresses`) are asked for the active
  account first and refuse before prompting when it is not `address`; the
  error names the active account. OKX's existing check throws the same error.
- `OcWalletButton`'s paste panel runs the same check and reports a mismatch
  through `onError` instead of calling `onSigned`.
- New exports: `WrongAccountError`, `assertSignedBy(message, signature, address)`.
- New dependency: `bip322-js` ^3, loaded lazily on first signature.

Alby / WebLN signatures are Lightning node signatures, not BIP-322, so they
now always fail this check; they never verified for a Bitcoin address.

## [0.4.2] — 2026-09-14

### Fixed

- **Phantom signed with the wrong account instead of refusing.** When the
  wallet had no account matching `opts.address`, the signer fell back to
  `accounts[0]`. The challenge message NAMES the address, so a signature from
  another account is rejected by the verifier — and the user is told "invalid
  signature", never the one thing that would fix it. It now refuses and names
  the accounts the wallet does have, which is what `signWithOkx` already did
  forty lines up in the same file.

## [0.4.1]

### Fixed

- **`OcWalletButton` manual / paste path no longer opens a native `window.prompt()`.** Clicking the "paste" wallet now renders an INLINE panel inside the component — the canonical message in a read-only box with a copy button, a real `<textarea>` for the signature, and Use-signature / back buttons — instead of invoking the `prompt()`-based `signManual` signer. The native dialog was an unstyled, un-themed, mobile-hostile UX that every consumer (chat, vault, me, …) inherited. The prompt-based `signManual` stays as the programmatic (non-React) fallback in `sign.ts`; only the React component changed. No API change — a behavior fix.

## [0.1.2] — Initial published state

Initial public release. Normalize UniSat / Xverse / Leather / Alby behind one `sign(message)` API.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-wallet-adapter-v0.1.2...HEAD
[0.1.2]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-wallet-adapter-v0.1.2
