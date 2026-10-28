# Changelog

All notable changes to **`@orangecheck/chat-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire rules live in the
`oc-chat-protocol` spec's CHANGELOG; this file tracks the package's API.

## [0.1.0] — 2026-10-28

### Added

The verifiers for OC Chat 0.4.0's public artifacts, as the reference client
at chat.ochk.io runs them:

- Channels (SPEC §8.3): `channelId`, `descriptorId`, `postId` and their d-tags;
  `parseDescriptor`, `parsePost`; `verifyDescriptor` (founder and prior-epoch
  admin authority, founder-only close, re-open and successor);
  `resolveChannelChain` (every authorized copy counts, earlier versions stand
  on their `binding`, the last needs a live one, the fork rank, closed tips;
  each version lists its authorized copies' keys and event ids);
  `authorizedCopy`, whether one event is an authorized copy of a resolved
  version (the same content under another key or event is not);
  `readChannelVersions` (the open read, the per-key reads, the walk forward by
  `s` and back by exact d-tag, and `floorMet` when every read, of versions
  and of role holders' keys, met the read floor, so "no newer version" can be
  said); `checkWritePolicy`, `verifyPost` and
  `verifyChannelPosts` (authorship, the write gate, tombstones, feed order).
- Session devices (§8.6): `verifySessionVouch`, `verifyHostRevocation`,
  `parseSessionDeviceEvent`, `sessionRevocations`, `liveSessionDevices`,
  `sessionKeysEverBound`, `stepUpAddress`.
- Bindings: `readVersionBinding`, `recordBinding`, `recordReads` (which keys a
  principal's records bind, liveness, every key ever bound). A lookup reports
  each relay's answer (`relayStatus`). A conclusion that rests on a record
  not being there needs the read floor: below it "bound now", "not bound" and
  "live" are not read, while a revocation seen is revoked on any answer. And
  `addressKeysEverBound`, over OC Lock's rule in `@orangecheck/lock-device`.
- Directory (§8.2.5–§8.2.6): `resolveDirectoryHandle`, `resolveWithState` and
  `readAddressState` over `@orangecheck/lock-core/directory`'s walk, with the
  deployment's directory and audit relays and §8.2.8 legacy claims as options
  (the reference deployment's by default); `isValidHandle`, `safeAvatar`.
- `./io`: `writeProofOnChain` ('no-answer' when the outputs cannot be read),
  `verifyWriteProofOnChain` (fail-closed) and `esploraWriteProofCheck`
  (`unanswered: 'throw'` for a verifier that must say it could not tell).
- The relay floor and write quorum (SPEC §8.7): `WRITE_QUORUM` (2),
  `readFloor(asked)` (`asked - WRITE_QUORUM + 1`, at least 1), `meetsReadFloor`,
  `CHAT_RELAYS` (the reference set readers ask), and `publishToQuorum`, which
  writes to the given relays and the reference set and reports a binding or
  revocation published only once `WRITE_QUORUM` reference relays hold it (on
  their OK, or with `readBack` only once they serve it back), retrying the rest,
  and otherwise "not yet published". An OK from any other relay counts for
  nothing. Together the floor and the quorum make a revocation hold; neither
  alone does.
- A read that gets no answer reaches the caller as `UnansweredReadError`: the
  host's keys while reading a version's binding (`readVersionBinding`,
  `resolveChannelChain`), and the chain through `esploraWriteProofCheck` when
  asked. The entries share one copy of that class.
- Vectors `vc07`, `vc08`, `vc14`–`vc20` run in CI against the spec checkout.
