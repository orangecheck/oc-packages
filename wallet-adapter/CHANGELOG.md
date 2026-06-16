# Changelog

All notable changes to **`@orangecheck/wallet-adapter`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

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
