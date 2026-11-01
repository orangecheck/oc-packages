# Changelog

All notable changes to **`@orangecheck/sdk`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [1.18.3] — 2026-10-31

### Fixed

- `verifyNostrIdentity` (and so `verifyIdentity` and `verifyAllIdentities` for
  `nostr:` identities) counts only a kind-1 note whose `pubkey` is the npub
  being verified. It asked relays for that author's notes but accepted any
  validly signed note a relay returned, so a note by another key containing the
  attestation id verified the npub. `isNostrIdentityVerified` already checked this.
- `verifyAttestationById` returns an attestation only when its signature
  verifies for the address its message names, and null otherwise. It checked
  only that the id is the message's hash and that the relay's index tags agree,
  so a message naming any address beside a junk signature came back as that
  address's attestation. A valid attestation comes back as before.
- `check({ identity })` holds one address to one bond (SECURITY.md §3) only on
  a read of the address that a flood could not cut off. The by-address read
  stopped silently on a page stuck on one second, at its 4-page bound, on a
  timeout and on a CLOSED, so 501 events under the address's `t` tag hid its
  other attestation and `stake_shared` never fired. Each relay's read now ends
  complete, cut off or unanswered. When no attestation backing another identity
  is found, the answer stands only if the read floor of relays (those asked,
  less 2, plus 1) finished with a short page and none was cut off. Otherwise
  `ok` is false with the new reason `stake_unread`: ask again. One found is
  `stake_shared` whatever the read.

## [1.18.2] — 2026-10-25

### Changed

- Needs `@orangecheck/bip322` ^1.1.3, whose `decodeAddress` returns null for
  text longer than any address before decoding it. `verifyChallenge`,
  `verify()` and the bond reader read addresses through it, so a server can
  pass request input in as it arrives.

## [1.18.1] — 2026-10-25

### Changed

- **Options are read from the caller's own keys.** `check()` and `verify()`
  throw a `TypeError` when an option they read is only inherited: set on the
  options' prototype (`Object.create({ minSats })`) or on `Object.prototype`.
  Held, with every option check in oc-packages, to auth-core's `test-vectors/option-bags.json`.
- `issueChallenge()` and `computeScore()` check their options, which they did
  not before: an option they do not read, or an inherited one, throws a
  `TypeError`. `issueChallenge()` reads only `address`, `ttlSeconds`, `nonce`,
  `audience`, `purpose` and `now`; `computeScore()` reads only `algorithm`.

## [1.18.0] — 2026-10-25

### Changed

- **A `bond:` value is read as OC Attest SPEC §2.2 writes it.** `verify()`
  reads the amount from base-10 ASCII digits of at most 2^53 - 1 only, and
  fails any other value (`5000abc`, `1e9`, `+5000`, `5000.0`) with the new
  status code `bond_malformed`, before it reads the chain.
  `buildCanonicalMessage()` throws rather than write such a value.

### Added

- `readBondExtension(value)`: the amount a `bond:` value gives, or null.
  Held, with sdk-py, to conformance vector `tv29`.

## [1.17.1] — 2026-10-24

### Changed

- **`createAttestationEnvelope()` copies `issued_at` from the signed line
  `verify()` reads:** the first line whose key is `issued_at`, in any case,
  split at its first colon. Other text containing `issued_at: ` does not set
  it.

## [1.16.2] — 2026-10-22

### Changed

- **A lookup by id, address or identity reads every event under the
  subject's tag,** paged by `until`, up to 2,000 per relay, and the signatures
  choose among them. A lookup by id reads every copy under the `d` tag.
- **`check()` tries every candidate's signature,** newest signed `issued_at`
  first, until one holds.
- **A message that signs any key twice is refused:** `verify()` answers
  `decode_error`, and discovery and `check()` leave it out (OC Attest SPEC
  §2.2).

## [1.16.1] — 2026-10-22

### Changed

- **`verify()` reads the signed `issued_at` as an RFC 3339 time** (OC Attest
  SPEC §7.1.g) and answers `decode_error` when it is not one.
- **`verify()` answers `not_yet_valid`** when the signed `issued_at` is more
  than two minutes ahead of the verifier's clock, the same allowance
  `check()` uses to rank attestations. New status code `not_yet_valid`.

## [1.16.0] — 2026-10-22

### Fixed

- **A signature's bytes decide its scheme.** `verify()`, `signatureIsValid()`
  (and so `check()` and discovery) and `verifyChallenge()` treat a 65-byte
  signature as legacy BIP-137 on every address type it can stand for (P2PKH,
  P2SH-P2WPKH, P2WPKH, P2TR) and anything else as BIP-322 simple, the rule
  `@orangecheck/bip322` verifies by. `verify()` used to pick the scheme from the
  address and the signature's first base64 letter, so a valid BIP-137
  signature on a `3…` address passed or failed with its recovery id, and
  passed on a `bc1…` address labelled `sig_ok_bip322`. `verifyChallenge()`
  with `scheme: 'legacy'` refused every address but P2PKH.

### Changed

- `verify()` labels each signature by the scheme that verified it:
  `sig_ok_legacy` or `sig_ok_bip322`. `sig_unsupported_script` now means a
  BIP-322 full or proof-of-funds signature, which is not supported, and
  `verifyChallenge()` answers those with `sig_unsupported_scheme`.
- The `scheme` input of `verify()`, `signatureIsValid()` and
  `verifyChallenge()` is deprecated and ignored.
- Requires `@orangecheck/bip322` ^1.1.0, which reads the `smp` prefix.

### Added

- `verifyChallenge()` returns `scheme` on success.

## [1.15.0] — 2026-10-21

### Changed

- **Signed fields only.** `check()`, `discoverAttestations()` and
  `queryRecent()` read `address`, `identities`, `issued_at` and `expires_at`
  from the signed message (OC Attest SPEC §5.3). The envelope's copies of those
  fields are not used, and `message_b64url` is re-encoded from the message.
- **`check()` takes the newest attestation whose signature holds,** ordered by
  its signed `issued_at`. An `issued_at` more than two minutes ahead of the
  verifier's clock is not valid yet. Only attestations the address signed count
  toward `stake_shared`.
- **Discovery keeps one envelope per id;** where copies of one id carry
  different signatures, the first whose signature holds.
- **`verify()` treats an `expires` value that is not an RFC 3339 date-time as
  expired.**

### Added

- `signedEnvelope(envelope)`: the envelope with its signed fields read from its
  message, or null when the message names no address or no RFC 3339
  `issued_at`.
- `signatureIsValid({ addr, msg, sig, scheme })`: the signature check alone,
  with no chain lookup.

## [1.14.1] — 2026-10-21

### Fixed

- **`discoverAttestations` returns each attestation once.** It merges every
  relay's events, and a publish reaches all of them, so an attestation came
  back once per relay holding it: attest.ochk.io's discovery listed 32 rows for
  8 attestations on four relays. An attestation's id is the hash of its message,
  so the first valid copy of each is kept; a broken copy never displaces a valid
  one.

## [1.14.0] — 2026-10-21

### Changed

- **`DEFAULT_RELAYS` swaps relay.snort.social for nostr.oxtr.dev**: relay.damus.io,
  nos.lol, nostr.oxtr.dev, relay.ochk.io. relay.snort.social now runs in
  memory; on 2026-10-21 it answered OK true to 16 rebroadcast family events and
  served none of them back. nostr.oxtr.dev kept all 37 it was sent an hour
  later.

## [1.13.0] — 2026-10-16

### Changed (security) — the nullifier is keyed

- `bondNullifier(key, audience, outpoint)` takes the registry's secret key
  first (at least 32 bytes) and returns HMAC-SHA256. 1.12.0's unkeyed hash
  could be inverted: outpoints are public, so an audience could hash every
  unspent output that met the claim's floors and find the coin in minutes.
  A breaking change to a day-old function, made before any third party used it.
- The signed acknowledgement reads "I back this subject with this coin. It
  stays in my wallet." Messages with 1.12.0's wording no longer parse.

### Added

- `verifyBondSignature` refuses a signing window longer than an hour
  (`bond_window_too_long`; `maxWindowSeconds` to tune it,
  `BOND_MAX_WINDOW_SECONDS` exported), so a signature can't stand as a
  standing re-pledge.

### Fixed

- Times that roll over, such as `T24:00:00Z` or February 30, are malformed
  rather than read as the next day.
- `esploraSource` treats a missing or garbled tip as an outage. A tip that
  wasn't a number made every coin look confirmed.

## [1.12.0] — 2026-10-16

### Added — bonds (oc-attest-protocol `BOND.md`)

- `issueBondMessage`, `buildBondMessage`, `parseBondMessage`, `bondId`:
  the eight-line `orangecheck-bond` message, content-addressed.
- `verifyBondSignature` (shape, subject, signing window, BIP-322) and
  `checkBondCoin` (the coin is an unspent, confirmed, 6+ deep output of the
  signing address), composed by `verifyBond`.
- `bondNullifier(audience, outpoint)` and `bondFloors(sats, ageBlocks)`: what an
  audience sees instead of the coin.
- `esploraSource(base)`: chain state from one named Esplora API, with no
  silent fallback.

### Fixed — old dust no longer lends its age to a fresh deposit

- `check({ minSats, minDays })` compares `minDays` with the youngest of the
  oldest coins that cover `minSats`, as `CheckResult.days` already documented.
  It took the single oldest coin, so a year-old 546-sat output beside 100,000
  sats deposited today passed `minDays: 365`. `verify()` takes the same rule as
  `VerifyOptions.coverSats`; without it, its metrics are unchanged.

## [1.11.0] — 2026-10-16

### Changed — signatures verify through `@orangecheck/bip322`

- `verify`, `check` and `verifyChallenge` verify BIP-322 and legacy signatures
  with `@orangecheck/bip322` instead of `bip322-js` and `bitcoinjs-message`.
  bitcoinjs-lib 6.1.9 (2026-10-13) made PSBT extraction throw on BIP-322's virtual
  `to_spend` input, so bip322-js, and every check built on it, rejected every
  signature. A fresh install of 1.10.0 reported `sig_invalid` for every
  attestation.
- A segwit signature must carry `SIGHASH_ALL` and a witness must parse exactly,
  as BIP-322 requires. bip322-js accepted both.
- A failure inside verification is no longer reported as `sig_invalid`; it
  surfaces as `bad_request`, so a broken verifier can't call real attestations
  forged.
- Dropped dependencies: `bip322-js`, `bitcoinjs-message`,
  `@bitcoinerlab/secp256k1`.

## [1.10.0] — 2026-10-08

### Changed — cached identity checks bind to the identity asked about

- `isGitHubIdentityVerified` counts only gists whose `owner.login` is the
  username passed. Keep the API's `owner` field in the cache.
- `isDnsIdentityVerified` refuses a well-known file whose `Domain:` line names
  another domain. A bare TXT value is still accepted on the id alone.
- `isNostrIdentityVerified` recomputes each cached note's id and checks its
  signature, as `verifyNostrIdentity` already did.

## [1.9.0] — 2026-10-07

### Deprecated

- `VerifyOptions.demoMode` has no effect. `verify()`, and `check()` through
  `verifyOptions`, always check the signature and chain state whatever
  options are passed. The field stays in the type so existing callers still
  compile; it goes in 2.0.

## [1.8.0] — 2026-09-24

### Added

- `queryRecent(relays?, limit?)` — the most recent attestations across every
  publisher, for aggregate views such as network stats. Filters on the
  `#t=["oc-attest"]` family marker, because kind 30078 is shared by every
  NIP-78 app. Keeps envelopes whose `attestation_id` is the hash of their
  message, one per id, and shares the fan-out deadline with the other queries.
  Signatures are not checked; call `verify()` on anything you act on.

### Changed

- `bond_zero` and `bond_pending` detail text says "stake" rather than
  "reputation score", matching the reference site.

## [1.7.0] — 2026-09-23

### Changed — `check()` resolves its subject from the signed message

- A Nostr identity matches in either spelling. SPEC §2 binds `nostr:npub1…`,
  relays and event authors carry hex, and the reference site accepts both. A
  lookup by one form now finds a binding written in the other, so
  `@orangecheck/relay-filter` can look up an event's hex `pubkey` directly.
- The subject is taken from the signed canonical message: the queried id,
  address, or identity must appear there. Event tags are indexes, not claims.
- Discovery skips an event whose `d` or `t` tag disagrees with its envelope
  (NIP_ORANGECHECK "Required invariants").
- **One bond, one identity per protocol** (SECURITY.md §3). A query by identity
  returns `ok: false` with reason `stake_shared` when the same address also
  binds a different identity on that protocol, in the same attestation or
  another one. Holders who want two Nostr keys gated use two addresses.

### Added

- `nostrPubkeyToHex()` and `nostrIdentifierForms()`.

## [1.6.0] — 2026-09-11

### Added — the parameter types of `buildCanonicalMessage` are exported

`Extensions` is its second parameter and `BuildOptions` its third, and neither
was re-exported from the index, so a consumer calling the public function had no
way to name the types it takes — oc-www had to recover one with
`Parameters<typeof buildCanonicalMessage>[1]`. Types only, no runtime change.

## [1.5.2] — 2026-09-03

### Changed

- Documented why `relay.damus.io` stays in `DEFAULT_RELAYS` even though it
  fails to connect from at least one serverless runtime. It is reachable from a
  browser (~391ms, real events), its NIP-11 declares no `auth_required` or
  `restricted_writes` — so this is datacenter-IP filtering rather than policy —
  and since `FANOUT_DEADLINE_MS` is a shared budget, a relay that cannot
  connect resolves immediately and costs no latency. Removing a relay that
  works for most callers to tidy one runtime's status field is the wrong trade.

  The note also says what to do about it: if you run this SDK server-side and
  need certainty about coverage, pass `relays` explicitly. Silent partial
  coverage is the hazard, not latency.

  No code change. Full reasoning in the workspace's
  `research/RELAY-COVERAGE-DECISIONS.md`.

## [1.5.1] — 2026-09-03

### Fixed

- Re-export `FANOUT_DEADLINE_MS` from the package root. 1.5.0 exported it from
  `src/nostr.ts` but not from `index.ts`, so the constant the 1.5.0 notes tell
  you to compare against `@orangecheck/gate`'s `lookupTimeoutMs` was not
  actually reachable — `import { FANOUT_DEADLINE_MS } from '@orangecheck/sdk'`
  threw. `DEFAULT_RELAYS` sits right beside it and was exported, so this was
  just an omission. No behaviour change.

## [1.5.0] — 2026-09-03

### Fixed

- **`check()` took 10.4 seconds. It now takes about one.** The relay queries
  fan out with `Promise.allSettled`, so a fan-out costs as long as its
  *slowest* relay — and `relay.nostr.band`, in `DEFAULT_RELAYS`, had stopped
  accepting TCP connections altogether (DNS still resolves; port 443 never
  completes a handshake, from two independent networks, and the apex
  `nostr.band` is down too). Every call paid the full 10s per-relay timeout.

  ```
  check({ addr })  1.4.0   10.4s
  check({ addr })  1.5.0    1.0s
  ```

  Two changes: `relay.nostr.band` is out of `DEFAULT_RELAYS`, and all four
  fan-outs (`publishToRelays`, `queryByAttestationId`, `queryByAddress`,
  `queryByIdentity`) now share one wall-clock budget, `FANOUT_DEADLINE_MS`
  (4000). The second matters more — whichever relay is dead or slow next, a
  fan-out is bounded.

- **This was breaking `@orangecheck/gate` outright, not just slowing it.** Gate
  races `check()` against a 5s `lookupTimeoutMs`, so a 10.4s lookup lost the
  race every time and no address-based gate decision could ever succeed.
  `FANOUT_DEADLINE_MS` is deliberately below that 5s default, and a test now
  asserts the relationship so raising one without the other fails loudly.

  Dependents pinning `^1.4.0` pick this up with no change on their side.

### Notes

- `relay.damus.io` stays in the defaults. It is unreachable from some
  serverless runtimes but answers in ~390ms from a developer machine and
  returns real events, which reads as datacenter-IP blocking rather than an
  outage. With a shared deadline an unreachable relay is cheap, so there is no
  reason to drop one that works for most callers.

## [Unreleased]

- _(no pending changes)_

## [1.17.0] — 2026-10-23

### Changed

- **Unknown options throw.** `check()` and `verify()` reject with a
  `TypeError` naming an option they do not read, and `check()` does the same
  for a key in `verifyOptions`. They read only the keys in `CheckParams` and
  `VerifyOptions`.

## [1.3.0] — 2026-05-18 · Remove the Binding Attestation API (reverted)

Removes `verifyBinding`, `buildBindingMessage`, `bindingId`,
`buildBindingEventTemplate`, `assembleBindingEnvelope`, `xOnlyHexToNpub`
and their types — the entire Binding Attestation surface added in 1.1.0
and 1.2.0 (both two days old, no external consumers).

That API was built on a mis-designed premise: a *mutually-signed* BTC ⇄
Nostr artifact requiring the Nostr key to counter-sign. oc-attest is a
**single-signature** protocol — one BIP-322 signature by the Bitcoin
address links it to a list of *self-asserted* handles (Nostr, GitHub,
DNS, Twitter); Nostr is transport, not a trust root. Identity linking is
already served by the v0 `createAttestation` / `verify` API, unchanged.
The `oc-attest-protocol` v1 spec and Nostr kind 30079 were reverted in
lockstep.

## [1.2.0] — 2026-05-16 · Binding Attestation issuer-side construction

Additive. Completes the round-trip for the v1 Binding Attestation — v1.1.0
shipped verification, this ships the construction helpers an issuer needs:

- `xOnlyHexToNpub(hex)` — encode a 32-byte x-only Nostr key as `npub1…`
  (inverse of the §6 decode).
- `buildBindingEventTemplate({ message, btcSignature, nostrPubkeyHex, btc })`
  — the unsigned kind-30079 NIP-01 event template; pass it to a NIP-07
  `signEvent` to obtain the Nostr counter-signature.
- `assembleBindingEnvelope({ message, btcSignature, nostrEvent })` — the
  full §5 transport envelope, structural fields re-derived from the signed
  message.

A round-trip conformance test confirms `assembleBindingEnvelope` rebuilds
an envelope that `verifyBinding` accepts. The v0 API is unchanged.

## [1.1.0] — 2026-05-16 · Binding Attestation verifier (OC Attest v1)

Additive. Reference implementation of the v1 Binding Attestation
(`oc-attest-protocol/SPEC-BINDING.md`) — the mutually-signed BTC ⇄ Nostr
identity bond. Three new exports:

- `buildBindingMessage(input)` — the canonical 8-line binding message,
  with the §3.5 line-smuggling defense (rejects CR/LF/control in any
  field).
- `bindingId(message)` — `SHA-256(message)` content address.
- `verifyBinding(envelope)` — the full §7 verification algorithm: BIP-322
  root proof + Nostr (BIP-340 Schnorr) counter-signature + the
  single-message rule, pure and offline, zero trusted party.

Conformance: all 8 `bv*` vectors from the protocol repo pass (binding
canonical message, `binding_id`, mutual-signature verify, tampered-sig
rejection, line-smuggling rejection, header cross-verify rejection).
The v0 stake-attestation API is unchanged.

## [0.1.5] — Initial published state

Initial public release. TypeScript core — `check`, `verify`, `createAttestation`. Byte-equal to `orangecheck` (Python).

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-sdk-v0.1.5...HEAD
[0.1.5]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-sdk-v0.1.5
