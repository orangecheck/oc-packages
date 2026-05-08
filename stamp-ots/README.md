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
- **`upgradeProof(proof, id, opts)`** — poll calendars for an upgraded proof once OTS has anchored the containing batch to a Bitcoin block. Returns a confirmed `OtsProof` when available.
- **`createCalendarClient(url)`** — low-level HTTP client implementing the minimal OTS calendar API (`POST /digest`, `GET /timestamp/<hex>`).
- **`makeAnchorVerifier({ walkProof, headerSource })`** — adapter that turns a proof-parser plus a block-header source into a function `verify()` (from `@orangecheck/stamp-core`) can call via its `verifyOtsAnchor` parameter.

## What it does NOT do

This package does **not** ship a full OpenTimestamps proof parser. Parsing the binary proof format (Merkle path chunks, calendar attestations, Bitcoin attestations) requires a larger, maintained library like `javascript-opentimestamps`. We keep this package's dependency surface narrow and expose `walkProof` as a plug-in point.

Consumers who want fully-offline verification should combine:

```ts
import { verify } from '@orangecheck/stamp-core';
import { makeAnchorVerifier, adaptAnchorVerifier, base64Decode, hexDecode } from '@orangecheck/stamp-ots';
import { myOtsParser, myHeaderSource } from './your-adapters';

const anchor = makeAnchorVerifier({
    walkProof: myOtsParser,
    headerSource: myHeaderSource,
});

const result = await verify({
    envelope: env,
    verifyOtsAnchor: adaptAnchorVerifier(anchor, (blockHash) => hexDecode(env.id)),
    verifyBip322: myBip322Verifier,
});
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
import { upgradeProof, fromStampOts, toStampOts } from '@orangecheck/stamp-ots';

const current = fromStampOts(envWithOts.ots!);
const upgraded = await upgradeProof(current, envWithOts.id, {
    parseAnchor: myOtsParser, // plug in your OTS proof parser
});
const envUpgraded = { ...envWithOts, ots: toStampOts(upgraded) };
```

## Exports

- `submitToCalendars(id, opts)` / `upgradeProof(proof, id, opts)`
- `createCalendarClient(url, opts)` / `DEFAULT_CALENDARS`
- `makeAnchorVerifier(config)` / `adaptAnchorVerifier(verifier, digestLookup)`
- `toStampOts(proof)` / `fromStampOts(stampOts)` — shape adapters
- `base64Encode` / `base64Decode` / `hexEncode` / `hexDecode`
- Types: `OtsProof`, `CalendarClient`, `AnchorVerifier`, `BlockHeaderSource`, etc.

See [`SPEC.md` §6](https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md#6-opentimestamps-integration) for the normative OTS integration.
