# @orangecheck/lock-crypto

X25519 ECDH, HKDF-SHA256, and AES-256-GCM primitives for [OC Lock](https://github.com/orangecheck/oc-lock-protocol).

This package is the narrow crypto surface used by `@orangecheck/lock-core` and `@orangecheck/lock-device`. You normally don't import it directly.

## Install

```
npm i @orangecheck/lock-crypto
```

## Exports

| Symbol | Purpose |
|---|---|
| `generateX25519KeyPair()` | 32-byte secret + 32-byte public |
| `x25519Shared(secret, peerPublic)` | ECDH shared secret |
| `hkdfSha256(ikm, salt, info, len)` | HKDF per RFC 5869 |
| `aesGcmEncrypt/Decrypt(key, nonce, data, aad?)` | AES-256-GCM authenticated encryption |
| `randomBytesN(n)` | CSPRNG bytes |
| `sha256Bytes(...chunks)` | SHA-256 |
| `hexEncode/Decode`, `b64urlEncode/Decode`, `utf8Encode/Decode`, `zeroize` | Byte utilities |

See the [OC Lock specification](https://github.com/orangecheck/oc-lock-protocol/blob/main/SPEC.md) for how these primitives compose.
