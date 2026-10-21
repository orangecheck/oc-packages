# @orangecheck/bip322

> **Full reference:** [ochk.io/docs/sdk/bip322/README](https://ochk.io/docs/sdk/bip322/README) — generated from the TypeScript source on every release.

Bitcoin message signatures: verify BIP-322 "simple" signatures from P2WPKH, P2SH-P2WPKH and single-key P2TR addresses and legacy BIP-137 `signmessage` signatures, and sign BIP-322 "simple" signatures for P2WPKH and P2TR from a private key you hold. orangecheck's verifiers are moving to it: `@orangecheck/sdk` ≥ 1.12, `@orangecheck/wallet-adapter` ≥ 0.5.2, the vote, stamp and agent CLIs and ochk.io use it now; the other family sites follow as they take those releases.

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

A signature is base64, standard or URL-safe, with or without padding, and with or without the finalized BIP's `smp` prefix. Anything malformed returns `false`: an unknown address, a broken witness, or a bad point.

## Sign on a server

```ts
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';

const key = process.env.SIGNING_KEY!; // WIF, 64 hex characters, or 32 bytes
const address = addressFromPrivateKey(key, 'p2wpkh'); // or 'p2tr'
const signature = signMessage(address, message, key); // base64, BIP-322 simple
```

`signMessage` signs only for the P2WPKH or single-key P2TR (BIP-86) address of the key and throws otherwise. P2WPKH signatures are deterministic (RFC 6979) and match the BIP's official vectors byte for byte. P2TR signatures use fresh randomness unless you pass `auxRand`.

The finalized BIP-322 says signers prefix a simple signature with `smp`. Verifiers deployed before it, including this package before 1.1.0 and `bip322-js`, reject the prefix, so `signMessage` leaves it off unless you pass `{ prefixed: true }`.

`decodeAddress(address)` returns `{ type, program, scriptPubKey }` for mainnet, testnet/signet and regtest addresses, and `null` for anything else.

## Compatibility

`verifySignature` agrees with `bip322-js` 3.0.0, on its last working bitcoinjs-lib (6.1.8), across a frozen corpus of random keys, address types, legacy headers and mutations (`test/fixtures`). It is stricter in three places, each one invalid per the BIPs:

- A segwit v0 signature must carry `SIGHASH_ALL`, as BIP-322 requires. bip322-js accepted any hash type byte.
- A witness must parse exactly. bip322-js accepted length prefixes that overran the data.
- A 65-byte Schnorr signature must end in `0x01`; BIP-341 forbids `0x00` there.

BIP-137 signatures are checked leniently about the header's address-type flag, as bip322-js and most wallets are: the recovered key must derive the claimed address in that address's own form.
