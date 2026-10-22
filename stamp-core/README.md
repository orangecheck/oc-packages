# @orangecheck/stamp-core

> **Full reference:** [ochk.io/docs/sdk/stamp-core](https://ochk.io/docs/sdk/stamp-core) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Canonical message, envelope format, `stamp()`, and `verify()` for [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol).

## Install

```
npm i @orangecheck/stamp-core
```

## Usage

```ts
import { verifySignature } from '@orangecheck/bip322';
import { parseStamp, stamp, verify } from '@orangecheck/stamp-core';

// Produce a signed stamp envelope.
const env = await stamp({
    content: new TextEncoder().encode('hello world'),
    mime: 'text/plain',
    signer: {
        address: 'bc1qalice…',
        signMessage: async (msg) => walletSignBIP322(msg), // msg is the 64-hex id
    },
});

// Share env as JSON, or via a URL fragment:
//   https://stamp.ochk.io/v#<base64url(JSON)>
// OTS anchoring is a separate step — see @orangecheck/stamp-ots.

// A verifier, later. parseStamp checks an envelope from outside (a .stamp file,
// a Nostr event, a fetch body) before anything reads it; never cast JSON.parse.
const result = await verify({
    envelope: parseStamp(receivedText),
    content: new TextEncoder().encode('hello world'),
    // Called (message, signatureB64, address); message is the 64-hex id.
    // Leave it out and verify() fails closed with E_BAD_SIG.
    verifyBip322: async (msg, sig, addr) => verifySignature(addr, msg, sig),
});
if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
```

`signed_at` is `YYYY-MM-DDTHH:MM:SSZ` or `YYYY-MM-DDTHH:MM:SS.sssZ` (SPEC §0),
and nothing rewrites it: the id is computed over the string as written. Pass
`signedAt` as a `Date` (its milliseconds are kept) or as a string already in
one of those forms (used exactly as given). stamp() throws `E_MALFORMED` for
anything else rather than rounding it.

## Exports

- `stamp(input)` → `StampEnvelope` — build a signed envelope. Leaves `ots: null`; anchoring is a later step.
- `verify(input)` → `VerifyResult` — full verification algorithm per SPEC §8. Returns a discriminated `{ok: true, ...} | {ok: false, code, message}`. Without `verifyBip322` (and without `skipSignatureVerification`) it fails closed with `E_BAD_SIG`.
- `parseStamp(textOrValue)` → `StampEnvelope` — checks an untrusted envelope's shape and types (SPEC §4.1, §4.2) and returns it typed, or throws `StampError` (`E_UNSUPPORTED_VERSION` for a `v` other than 1, else `E_MALFORMED`). Shape only; verify() checks the id, signature and anchor.
- `isSignedAt(value)` → `boolean` — the SPEC §0 timestamp rule stamp(), verify() and parseStamp() share.
- `canonicalMessage(input)` → `string` — the six lines hashed into the id. The wallet signs the id, not these lines.
- `computeEnvelopeId(input)` → `string` — lowercase hex of `sha256(canonical_message)`; this hex string is what BIP-322 signs.
- `checkStake(envelope, attestation, policy)` → `{ ok } | { ok: false, code: 'E_STAKE_UNMET', message }` — SPEC §8.1 step 7 against an attestation you resolved now.
- `canonicalEnvelopeBytes(env)` — SPEC §5's canonical envelope bytes: RFC 8785 JSON and a final LF. `canonicalizeEnvelope(env)` is the same JSON as a string, without the LF. Neither feeds the id, which is the hash of the canonical message (no trailing LF).
- `canonicalize(value)` — RFC 8785 JSON canonicalization of any JSON value.
- `StampError` — typed error with protocol-defined `code`.
- Full type definitions: `StampEnvelope`, `StampInput`, `VerifyInput`, `StampStake`, etc.

## Composition

- **OTS anchoring**: use [`@orangecheck/stamp-ots`](https://www.npmjs.com/package/@orangecheck/stamp-ots) to submit an envelope's `id` to OpenTimestamps calendars, parse returned proofs, and upgrade pending → confirmed.
- **Stake context**: populate `input.stake` with an OrangeCheck attestation reference. It is outside the id and the signature, so anyone can strip or swap it. A verifier re-resolves it and passes the result to `checkStake`, which accepts only an attestation signed by `signer.address` whose current bond meets the policy:

  ```ts
  const id = env.stake!.attestation_id;
  const att = await fetch(`https://attest.ochk.io/api/check?id=${id}`).then((r) => r.json());
  const stake = checkStake(env, att.ok ? att : null, { minSats: 100_000, minDays: 30 });
  ```
- **BIP-322 signing**: plug in any wallet adapter — the SDK doesn't ship one. See [`@orangecheck/wallet-adapter`](https://www.npmjs.com/package/@orangecheck/wallet-adapter) for the cross-wallet reference adapter.
- **BIP-322 verification**: plug in a verifier via `verify({ verifyBip322 })`. stamp-core calls it as `(message, signatureB64, address)` and expects a Promise; [`@orangecheck/bip322`](https://www.npmjs.com/package/@orangecheck/bip322) works in Node and the browser alike: `verifyBip322: async (msg, sig, addr) => verifySignature(addr, msg, sig)`.

See [`SPEC.md`](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md) for the normative spec.
