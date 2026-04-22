# @orangecheck/lock-core

Envelope format, canonicalization, `seal`, and `unseal` for [OC Lock](https://github.com/orangecheck/oc-lock-protocol).

## Install

```
npm i @orangecheck/lock-core
```

## Usage

```ts
import { seal, unseal } from '@orangecheck/lock-core';

const env = await seal({
    payload: new TextEncoder().encode('hello'),
    sender: { address: 'bc1qalice…', signMessage: async (m) => walletSignBIP322(m) },
    recipients: [
        { address: 'bc1qbob…', device_id: '…', device_pk: '…' /* from device registry */ },
    ],
});

// Share env as JSON. Recipient later:

const result = await unseal({
    envelope: env,
    device: { device_id: '…', secretKey: localDeviceSecret },
    verifyBip322: async (msg, sig, addr) => { /* your verifier */ },
});
const plaintext = new TextDecoder().decode(result.payload);
```

## Exports

- `seal(input)` → `LockEnvelope`
- `unseal(input)` → `{ payload, envelopeId, sender, matchedDeviceId }`
- `canonicalize(value)` / `canonicalBytes(value)` — RFC 8785 JSON canonicalization with OC Lock's `recipients[]` sort rule
- `LockError` — typed error class with protocol-defined `code`
- Full type definitions: `LockEnvelope`, `EnvelopeRecipient`, `DeviceRecord`, etc.

See [`SPEC.md`](https://github.com/orangecheck/oc-lock-protocol/blob/main/SPEC.md) for the normative spec.
