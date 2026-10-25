# @orangecheck/lock-device

> **Full reference:** [ochk.io/docs/sdk/lock-device](https://ochk.io/docs/sdk/lock-device) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


Device-key binding and Nostr kind-30078 directory publication helpers for [OC Lock](https://github.com/orangecheck/oc-lock-protocol).

## Install

```
npm i @orangecheck/lock-device
```

## What this package does

- Generates X25519 device keypairs used by recipients to receive sealed envelopes.
- Builds canonical binding/revocation statements that a Bitcoin wallet signs via BIP-322.
- Derives a Nostr Schnorr keypair deterministically from a device secret (so the same browser always publishes under a stable Nostr pubkey, without asking the user to manage Nostr keys).
- Builds, finalizes, and parses kind-30078 addressable events keyed by `d: oc-lock:device:<btc-address>`.

This package is WebCrypto-free: it works in Node and in the browser.

## Exports

- `generateDeviceKey()` — new `(device_sk, device_pk, device_id, created_at)`.
- `buildBindingStatement({ address, device_pk, device_id, created_at, nostr_pk? })` — exact bytes per SPEC §3.2 (v3 when `nostr_pk` is given).
- `liveDevices(records, { now?, maxSkewMs? })` — the verified bind records no revocation retires (SPEC §3.5). Seal to these, one per `device_id`. `pendingDevices` lists binds dated ahead of the clock; `revokedAtFor` dates a revocation.
- `authorizedDevices(records, { now? })` — the records whose Nostr pubkey is the device's inbox (SPEC §3.4): every v3 record, and before `V2_INBOX_SUNSET` (2027-01-21T00:00:00Z) a v2 record carried by one key only. For Nostr delivery, never for choosing recipients.
- `buildRevocationStatement({ address, device_id, revoked_at })` — for explicit revocation.
- `deriveNostrKey(deviceSk)` — deterministic `nostr_sk` from `device_sk` (HKDF).
- `finalizeDeviceEvent({ ... bindingSigBase64, ... })` — returns a fully signed kind-30078 `NostrEvent`.
- `parseDeviceEvent(event)` — extracts `{ address, device_pk, device_id, bindingStatement, bindingSigBase64, revoked }`. A bind's tags must agree with its signed statement; a revocation is read from its statement alone.

The caller is responsible for obtaining the BIP-322 signature from the user's wallet and for publishing / querying Nostr relays. See [`SPEC.md`](https://github.com/orangecheck/oc-lock-protocol/blob/main/SPEC.md) §3 for the normative device-binding rules.
