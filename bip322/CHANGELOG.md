# Changelog

All notable changes to **`@orangecheck/bip322`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/).

## [Unreleased]

- _(no pending changes)_

## [1.0.1] — 2026-10-16

### Fixed

- `decodeAddress` and `verifySignature` no longer throw on a bech32 address
  whose checksum is valid but whose padding isn't. They return null and false,
  as documented; callers that dropped their try/catch on 1.0.0 answered such an
  address with a 500.

## [1.0.0] — 2026-10-16

### Added

- **`verifySignature(address, message, signatureBase64)`**: BIP-322 simple
  (P2WPKH, P2SH-P2WPKH, single-key P2TR) and legacy BIP-137 verification on
  `@noble/curves`, `@noble/hashes` and `@scure/base`. Never throws.
- **`decodeAddress(address)`**: type, program and scriptPubKey for mainnet,
  testnet/signet and regtest addresses.
- Tests: BIP-322's vectors, every orangecheck attestation on public relays, and
  552 cases generated with bip322-js 3.0.0 on bitcoinjs-lib 6.1.8.
