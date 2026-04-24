# @orangecheck/stamp-core

Canonical message, envelope format, `stamp()`, and `verify()` for [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol).

## Install

```
npm i @orangecheck/stamp-core
```

## Usage

```ts
import { stamp, verify } from '@orangecheck/stamp-core';

// Produce a signed stamp envelope.
const env = await stamp({
    content: new TextEncoder().encode('hello world'),
    mime: 'text/plain',
    signer: {
        address: 'bc1qalice…',
        signMessage: async (msg) => walletSignBIP322(msg),
    },
});

// Share env as JSON, or via a URL fragment:
//   https://stamp.ochk.io/v#<base64url(JSON)>
// OTS anchoring is a separate step — see @orangecheck/stamp-ots.

// A verifier, later:
const result = await verify({
    envelope: env,
    content: new TextEncoder().encode('hello world'),
    verifyBip322: async (msg, sig, addr) => { /* your verifier */ },
});
if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
```

## Exports

- `stamp(input)` → `StampEnvelope` — build a signed envelope. Leaves `ots: null`; anchoring is a later step.
- `verify(input)` → `VerifyResult` — full verification algorithm per SPEC §8. Returns a discriminated `{ok: true, ...} | {ok: false, code, message}`.
- `canonicalMessage(input)` → `string` — the exact bytes the signer signs via BIP-322.
- `computeEnvelopeId(input)` → `string` — lowercase hex of `sha256(canonical_message)`.
- `canonicalize(value)` / `canonicalizeEnvelope(env)` — RFC 8785 JSON canonicalization.
- `StampError` — typed error with protocol-defined `code`.
- Full type definitions: `StampEnvelope`, `StampInput`, `VerifyInput`, `StampStake`, etc.

## Composition

- **OTS anchoring**: use [`@orangecheck/stamp-ots`](https://www.npmjs.com/package/@orangecheck/stamp-ots) to submit an envelope's `id` to OpenTimestamps calendars, parse returned proofs, and upgrade pending → confirmed.
- **Stake context**: populate `input.stake` with an OrangeCheck attestation reference. Verifiers who care should re-resolve via [`@orangecheck/sdk`](https://www.npmjs.com/package/@orangecheck/sdk).
- **BIP-322 signing**: plug in any wallet adapter — the SDK doesn't ship one. See [`@orangecheck/wallet-adapter`](https://www.npmjs.com/package/@orangecheck/wallet-adapter) for the cross-wallet reference adapter.
- **BIP-322 verification**: plug in a verifier via `verify({ verifyBip322 })`. Node environments can use `bip322-js`; browser environments can use the same via a Buffer polyfill.

See [`SPEC.md`](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md) for the normative spec.
