# @orangecheck/bip322

> **Full reference:** [ochk.io/docs/sdk/bip322/README](https://ochk.io/docs/sdk/bip322/README) — generated from the TypeScript source on every release.

Bitcoin message signatures: verify BIP-322 "simple" signatures from P2WPKH, P2SH-P2WPKH and single-key P2TR addresses and legacy BIP-137 `signmessage` signatures, and sign BIP-322 "simple" signatures for P2WPKH and P2TR from a private key you hold. orangecheck's verifiers are moving to it: `@orangecheck/sdk` ≥ 1.12, `@orangecheck/wallet-adapter` ≥ 0.5.2, the vote, stamp and agent CLIs and ochk.io use it now; the other family sites follow as they take those releases.

It is built only on audited primitives: `@noble/curves`, `@noble/hashes` and `@scure/base`. BIP-322's virtual `to_spend` and `to_sign` transactions have a fixed shape, so they are serialized directly. There is no bitcoinjs-lib and no PSBT library underneath. On 2026-10-13, bitcoinjs-lib 6.1.9 tightened PSBT extraction, and `bip322-js`, which built those transactions as PSBTs, started rejecting every signature.

## Install

```bash
yarn add @orangecheck/bip322@^1.1.3
```

This README describes 1.1.3. Before 1.1.0 there was no `signMessage`, and a signature carrying the finalized BIP's `smp` prefix was refused; a wallet that follows the finalized BIP needs 1.1.0 or later on the verifying side.

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

## Addresses: one spelling per key

```ts
import { normalizeAddress } from '@orangecheck/bip322';

normalizeAddress(' BC1Q9VZA2E8X573NCZRLZMS0WVX3GSQJX7VAVGKX0L '); // 'bc1q9vza2e8x…', or null
```

`verifySignature` and `decodeAddress` read bech32 only in its canonical lowercase spelling, so one key never has two addresses that verify, and anything you key by address (votes, accounts, devices, limits) sees one spelling. QR codes carry bech32 in capitals, which BIP-173 allows: call `normalizeAddress` on what a person typed or scanned, before signing, verifying or storing. It drops surrounding whitespace, lowercases all-capitals bech32, leaves base58 as it is, and returns `null` for mixed case or anything that is not an address.

`decodeAddress(address)` returns `{ type, network, program, scriptPubKey }` for mainnet, testnet/signet and regtest addresses, and `null` for anything else. `network` is `'mainnet'`, `'testnet'` or `'regtest'`; a base58 testnet address reports `'testnet'`, because base58 regtest addresses use the same version bytes. Text longer than any address (more than 90 characters, or base58 longer than 35) is `null` before it is decoded, so a caller can pass request input straight in: the time it takes does not grow with the input.

## What it accepts

Measured by signing and verifying, not read off the code. `test/behaviour.test.ts` recomputes every cell of this table on each run, so the table cannot drift from the code.

| Address | BIP-322 simple | simple with `smp` | BIP-322 full (`ful`) | BIP-137 legacy |
| --- | --- | --- | --- | --- |
| P2WPKH (`bc1q…`) | accepted | accepted | refused | accepted, under any header flag |
| P2SH-P2WPKH (`3…`) | accepted | accepted | refused | accepted, under any header flag |
| P2TR (`bc1p…`, single key) | accepted | accepted | refused | accepted, under any header flag |
| P2PKH (`1…`) | refused: no witness to sign with | refused | refused | accepted, under any header flag |
| Uppercase bech32 (`BC1Q…`) | refused: not the canonical spelling | refused | refused | refused |

- **BIP-322 simple** is a witness signature, with or without the `smp` prefix. BIP-322 defines no simple form for P2PKH, which has no witness; a P2PKH address signs with BIP-137. The P2SH-P2WPKH simple signature in the table was made by `bip322-js`, because `signMessage` signs only P2WPKH and P2TR.
- **BIP-322 full** (`ful`) and **proof of funds** (`pof`) are refused without being parsed. A wallet that only produces those cannot sign here.
- **BIP-137 legacy** is the 65-byte `signmessage` signature. The header flag (27–42) is not checked against the address type: wallets disagree on it for segwit addresses, some using the P2PKH flags and some the BIP-137 segwit flags, and both verify. What is checked is that the recovered key derives the claimed address: its hash for P2WPKH and P2PKH, its BIP-86 output key for P2TR.
- **Uppercase bech32** is refused in every column; `normalizeAddress` turns it into the lowercase address, which verifies as its row says.

## Compatibility

`verifySignature` agrees with `bip322-js` 3.0.0, on its last working bitcoinjs-lib (6.1.8), across a frozen corpus of random keys, address types, legacy headers and mutations (`test/fixtures`). It is stricter in three places, each one invalid per the BIPs:

- A segwit v0 signature must carry `SIGHASH_ALL`, as BIP-322 requires. bip322-js accepted any hash type byte.
- A witness must parse exactly. bip322-js accepted length prefixes that overran the data.
- A 65-byte Schnorr signature must end in `0x01`; BIP-341 forbids `0x00` there.

BIP-137 signatures are checked leniently about the header's address-type flag, as bip322-js and most wallets are: the recovered key must derive the claimed address in that address's own form.
