# Changelog

All notable changes to **`@orangecheck/wallet-adapter`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.6.5] — 2026-10-20

### Fixed

- A screen reader heard `OcWalletButton`'s wallets as "UniSat Ready": the
  dot, the name and the state ran together into one name. Each button is now
  named by what a press does ("Sign with UniSat", "Install Xverse"), and its
  state ("Ready", "Signing…") is a description read after it.
  `OcWalletPicker`'s radios are named by the wallet alone, their state the
  same way. A test finds each one by role and name, computed as a browser
  computes it.

## [0.6.4] — 2026-10-20

### Added

- `--oc-wallet-heading`: the display of `OcWalletButton`'s heading ("Sign
  with your wallet"). Fallback `block`. A frame that already says what to do
  sets it to `none`: app-design ≥ 1.6.1 does inside `SignMessage`'s wallets
  slot, where the heading was a second, differently styled label above the
  buttons.

## [0.6.3] — 2026-10-20

### Added

- `--oc-wallet-message-font`: the message to sign and the pasted signature in
  `OcWalletButton`'s paste panel read it. Both are exact strings, so a design
  with sans labels (app-design ≥ 1.4.0 sets it to its mono) keeps them mono.
  The fallback is `--oc-wallet-font`, the font they inherited before.

## [0.6.2] — 2026-10-20

### Fixed

- **Xverse signs wherever it was detected.** `detectWallets()` lists Xverse
  when `window.XverseProviders.BitcoinProvider` has a `request`, but
  `getSigner('xverse')` only looked at `window.BitcoinProvider`. A browser
  with only the first offered Xverse, and picking it failed with "Xverse
  wallet not found". The signer now reads both, as detection does. A new
  test installs each global that detection reads, one at a time, and signs
  through `getSigner` with a real key, so a wallet the picker lists can no
  longer be one the signer cannot reach.

## [0.6.1] — 2026-10-20

### Fixed

- **Alby is no longer listed.** `detectWallets()`, `OcWalletPicker` and
  `OcWalletButton` offered it whenever WebLN was present, but WebLN signs with
  a Lightning node key, so since 0.5 every Alby signature failed the address
  check. A person picked it and nothing they could do would work.
  `isWalletDetected('alby')` is `false`, and `getSigner('alby')` refuses
  without asking the wallet to sign. `'alby'` stays in `WalletId` so code that
  names it still compiles.

## [0.6.0] — 2026-10-20

### Added — the wallet step takes a site's design

`OcWalletPicker` and `OcWalletButton` read `--oc-wallet-*` CSS variables for
type and shape, the way auth-client's ceremony reads `--oc-signin-*`.
`@orangecheck/app-design` ≥ 1.1.0 sets them; a site that sets none renders as
before. Each fallback is the look 0.5.2 hard-coded:

| Variable | Reads into | Fallback |
| --- | --- | --- |
| `--oc-wallet-font` | every label, button and field | `ui-monospace, SFMono-Regular, monospace` |
| `--oc-wallet-case` | small labels and buttons | `uppercase`; `lowercase` for Back and the empty notes' first words |
| `--oc-wallet-tracking` | small labels | `0.18em` headings, `0.06em` status words |
| `--oc-wallet-scale` | multiplies every 8–12px size | `1` |
| `--oc-wallet-strong` | wallet names, Use signature, heading | `600`; `700` for the heading |
| `--oc-wallet-radius` | list rows, the message, the field | `6px` |
| `--oc-wallet-button-radius` | buttons and row chips | `6px`; `4px` Copy; `9999px` chips |
| `--oc-wallet-min-height` | wallet rows, the paste panel's buttons | `auto` |
| `--oc-wallet-surface` | rows, the message, the field | `--muted` at 30% over transparent |
| `--oc-wallet-ready` | a detected wallet's dot | `#22c55e` |
| `--oc-wallet-field-size` | the pasted signature | `12px`; `16px` below 768px |
| `--oc-wallet-mark` | display of "§ ", "// ", "← " | `inline` |

Copy is now written in sentence case ("Ready", "Install", "Paste",
"Signing…", "Back", "Copy"); the fallback case renders it as before. The
decorative marks are hidden from screen readers.

### Fixed

- The paste field set 12px inline, which outranks a stylesheet's 16px phone
  rule, so iOS zoomed into it on focus. Below 768px it is now 16px. This is
  the one change a site that sets no variable can see.

## [0.5.2] — 2026-10-16

### Fixed — every wallet signature read as the wrong account's

- `verifyBip322` and `assertSignedBy` use `@orangecheck/bip322`. bitcoinjs-lib 6.1.9 (2026-10-13) made PSBT extraction throw on BIP-322's virtual
  `to_spend` input, so bip322-js, and every check built on it, rejected every
  signature.
  Every signer ran that check before returning, so every signature became
  `WrongAccountError`.

## [0.5.1] — 2026-10-08

### Added — `onManualSign` for the `manual` wallet

`getSigner('manual', { address, onManualSign })` hands the message to the
caller, which shows it in its own UI and resolves with the pasted signature.
The result goes through the same shape and address checks as every other
wallet. An empty paste is a cancel.

- `ManualSignUnavailable` (`code: 'E_MANUAL_SIGN_UNAVAILABLE'`) is thrown when
  there is neither an `onManualSign` nor a browser prompt to fall back on.

### Deprecated

- The `window.prompt` fallback used when `onManualSign` is absent. It still
  works and logs a one-time warning; it will be removed in a later minor.
  `manualPrompt` applies only to that fallback. `<OcWalletButton />` is
  unaffected: it renders its own paste panel and never used the prompt.

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
