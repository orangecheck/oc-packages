# @orangecheck/bip322

> **Full reference:** [ochk.io/docs/sdk/bip322/README](https://ochk.io/docs/sdk/bip322/README) — generated from the TypeScript source on every release.

Bitcoin message-signature verification: BIP-322 "simple" signatures from P2WPKH, P2SH-P2WPKH and single-key P2TR addresses, and legacy BIP-137 `signmessage` signatures. orangecheck's verifiers are moving to it: `@orangecheck/sdk` ≥ 1.12, `@orangecheck/wallet-adapter` ≥ 0.5.2, the vote, stamp and agent CLIs and ochk.io use it now; the other family sites follow as they take those releases.

It is built only on audited primitives: `@noble/curves`, `@noble/hashes` and `@scure/base`. BIP-322's virtual `to_spend` and `to_sign` transactions have a fixed shape, so they are serialized directly. There is no bitcoinjs-lib and no PSBT library underneath. On 2026-10-13, bitcoinjs-lib 6.1.9 tightened PSBT extraction, and `bip322-js`, which built those transactions as PSBTs, started rejecting every signature.

## Install

```bash
yarn add @orangecheck/bip322
```

## Use

```ts
import { verifySignature } from '@orangecheck/bip322';

verifySignature(address, message, signatureBase64); // true | false, never throws
```

A signature is base64, standard or URL-safe, with or without padding. Anything malformed returns `false`: an unknown address, a broken witness, or a bad point.

`decodeAddress(address)` returns `{ type, program, scriptPubKey }` for mainnet, testnet/signet and regtest addresses, and `null` for anything else.

## Compatibility

`verifySignature` agrees with `bip322-js` 3.0.0, on its last working bitcoinjs-lib (6.1.8), across a frozen corpus of random keys, address types, legacy headers and mutations (`test/fixtures`). It is stricter in three places, each one invalid per the BIPs:

- A segwit v0 signature must carry `SIGHASH_ALL`, as BIP-322 requires. bip322-js accepted any hash type byte.
- A witness must parse exactly. bip322-js accepted length prefixes that overran the data.
- A 65-byte Schnorr signature must end in `0x01`; BIP-341 forbids `0x00` there.

BIP-137 signatures are checked leniently about the header's address-type flag, as bip322-js and most wallets are: the recovered key must derive the claimed address in that address's own form.
