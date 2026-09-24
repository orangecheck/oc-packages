# @orangecheck/stamp-ots

> **Full reference:** [docs.ochk.io/sdk/stamp-ots](https://docs.ochk.io/sdk/stamp-ots) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


OpenTimestamps calendar client, proof helpers, and anchor-verification hooks for [OC Stamp](https://github.com/orangecheck/oc-stamp-protocol) envelopes.

## Install

```
npm i @orangecheck/stamp-core @orangecheck/stamp-ots
```

## What it does

OC Stamp envelopes carry an optional `ots` field that anchors the envelope `id` to a Bitcoin block via the [OpenTimestamps](https://opentimestamps.org) protocol. This package provides the thin client-side glue:

- **`submitToCalendars(id, opts)`** — POST the envelope's 32-byte digest to one or more OTS calendars. Returns a pending `OtsProof` you can fold into the envelope's `ots` field.
- **`upgradeProof(proof, id, { headerSource })`** — ask each calendar for the continuation of its pending attestation (calendars index upgrades by that commitment) and graft it on. Returns a confirmed `OtsProof` once the proof reaches a Bitcoin block whose header checks out.
- **`createCalendarClient(url)`** — low-level HTTP client implementing the minimal OTS calendar API (`POST /digest`, `GET /timestamp/<hex(commitment)>`).
- **`makeAnchorVerifier({ headerSource })`** — the `verifyOtsAnchor` hook for `verify()` from `@orangecheck/stamp-core`. It walks the proof with the built-in OTS parser and requires that the proof commits to the envelope id, attests at the declared height, and that the header at that height has the proof's Merkle root and hashes to the declared block hash.
- **`mempoolHeaderSource(opts)`** — block headers from an Esplora-compatible API (default `https://mempool.space/api`). Each header is checked against the declared block hash, so this source is trusted only to say which block sits at a height. Supply your own node or headers snapshot to remove that trust.
- **`parseProof` / `parseDetached` / `serializeTimestamp` / `bitcoinAnchors` / `pendingCommitments`** — the OTS proof format, accepting both the bare timestamp carried in `ots.proof` and detached `.ots` files.

## Verify an anchor

```ts
import { verify } from '@orangecheck/stamp-core';
import { makeAnchorVerifier, mempoolHeaderSource } from '@orangecheck/stamp-ots';

const result = await verify({
    envelope: env,
    verifyOtsAnchor: makeAnchorVerifier({ headerSource: mempoolHeaderSource() }),
    verifyBip322: myBip322Verifier,
});
// result.anchor.verified is true only when the proof checked out.
```

## Usage

### Submit an envelope to calendars

```ts
import { stamp } from '@orangecheck/stamp-core';
import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';

const env = await stamp({ /* ... */ });
const proof = await submitToCalendars(env.id);  // uses DEFAULT_CALENDARS
const envWithOts = { ...env, ots: toStampOts(proof) };
// envWithOts now has a pending OTS proof.
```

### Upgrade later

```ts
import { fromStampOts, mempoolHeaderSource, toStampOts, upgradeProof } from '@orangecheck/stamp-ots';

const current = fromStampOts(envWithOts.ots!);
const upgraded = await upgradeProof(current, envWithOts.id, {
    headerSource: mempoolHeaderSource(),
});
const envUpgraded = { ...envWithOts, ots: toStampOts(upgraded) };
```

## Exports

- `submitToCalendars(id, opts)` / `upgradeProof(proof, id, opts)`
- `createCalendarClient(url, opts)` / `DEFAULT_CALENDARS`
- `makeAnchorVerifier(config)` / `makeDefaultAnchorVerifier(config)` / `mempoolHeaderSource(opts)` / `walkOtsProof(input)` / `blockHashOf(header)`
- `parseProof` / `parseDetached` / `parseTimestamp` / `serializeTimestamp` / `bitcoinAnchors` / `pendingCommitments` / `mergeAt` / `attestations`
- `toStampOts(proof)` / `fromStampOts(stampOts)` — shape adapters
- `base64Encode` / `base64Decode` / `hexEncode` / `hexDecode`
- Types: `OtsProof`, `CalendarClient`, `AnchorVerifier`, `BlockHeaderSource`, etc.

See [`SPEC.md` §6](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#6-opentimestamps-integration) for the normative OTS integration.
