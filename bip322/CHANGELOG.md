# Changelog

All notable changes to **`@orangecheck/bip322`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/).

## [Unreleased]

- _(no pending changes)_

## [1.1.2] — 2026-10-22

### Added

- `normalizeAddress(input)`: the canonical spelling of an address a person
  typed or scanned. It drops surrounding whitespace, lowercases all-capitals
  bech32 (as QR codes carry it, BIP-173), leaves base58 unchanged, and returns
  null for mixed case or anything that is not an address. Store, key and
  compare addresses in this form.
- `decodeAddress` returns the address's `network`: `'mainnet'`, `'testnet'` or
  `'regtest'`. Base58 regtest addresses share testnet's version bytes and
  report `'testnet'`.
- The README states what the package accepts per address type and signature
  form, and a test recomputes that table by signing and verifying.

### Unchanged

- `verifySignature` and `decodeAddress` still read bech32 only in lowercase,
  so one key has one address that verifies.

## [1.1.1]

1.1.1 was not published.

## [1.1.0] — 2026-10-21

### Added — signing

- `signMessage(address, message, privateKey, opts?)` produces a BIP-322
  simple signature for a P2WPKH or single-key P2TR (BIP-86) address from its
  private key (bytes, hex or WIF). It refuses any other address, and any key
  that is not the address's own. P2WPKH signatures are RFC 6979 and match the
  BIP's official vectors byte for byte; P2TR signatures verify, and take
  `auxRand` to be reproducible. No new dependency.
- `addressFromPrivateKey(privateKey, 'p2wpkh' | 'p2tr', network?)`.

### Changed — the `smp` prefix

- The finalized BIP-322 prefixes a simple signature with `smp`, and its
  vectors do. `verifySignature` now accepts the prefix; a `ful` or `pof`
  signature is not supported and returns false. `signMessage` leaves the prefix
  off by default, because verifiers deployed before this release reject it.
- The tests carry the BIP's official vectors (bitcoin/bips `d77863fb9e9b`): every
  P2WPKH and P2TR simple signature verifies, every error vector fails.

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
