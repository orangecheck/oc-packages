# Changelog

All notable changes to **`@orangecheck/relay-filter`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.5.6] — 2026-11-01

### Fixed

- A check whose only reason is `stake_unread` (`@orangecheck/sdk` 1.18.3:
  everything else passed, and a flood cut off the read of the address's other
  attestations) is a closed lookup failure: `lookup_error`, held for the 5 s
  lookup-error TTL like an outage, and never `fail_open`, since the key holder
  can make that flood at will. It used to fall through to `invalid_proof`,
  cached for the decision TTL. Beside any other reason, that reason decides.
- `AttestationIndex` reads the `oc-attest` backlog, and each new address's own
  attestations, paged per relay (500 a page, 4 pages, one deadline per relay).
  A read is an answer only when 4 of 5 relays finished with a short page and
  none was cut off. The backlog used to be one standing read, synced at the
  first EOSE after a relay's newest 500, and an address read could be cut off
  without notice. A key whose address's read has not finished now waits
  (`lookup_error`, never `fail_open`) instead of being admitted beside a second
  key the flood hid, and each refresh (every `refreshMs`, 10 minutes by
  default) reads it again. The standing subscription reads new events only.

## [0.5.5] — 2026-10-25

### Changed

- **Options are read from the caller's own keys.** `filterEvent`,
  `AttestationIndex.decide` and `new AttestationIndex()` throw a `TypeError`
  when an option they read is only inherited: set on the options' prototype
  (`Object.create({ minSats })`) or on `Object.prototype`. Held, with every
  option check in oc-packages, to auth-core's `test-vectors/option-bags.json`.

## [0.5.4] — 2026-10-23

### Changed

- **Unknown options throw.** `filterEvent` rejects, and
  `AttestationIndex.decide` and `new AttestationIndex()` throw, a `TypeError`
  naming an option they do not read. They read only the keys in
  `FilterOptions` and `IndexOptions`.

## [0.5.3] — 2026-10-22

### Changed

- `cacheTtlMs` is capped at 10 minutes, so a cached decision for a key is
  looked up again within 10 minutes of a bond moving, whatever the option
  asks for. The default stays 60 seconds.

## [0.5.2] — 2026-10-21

### Changed

- **`AttestationIndex` reads an attestation's issue time from its signed
  message**, as in OC Attest SPEC §5.3, and reads each address's bond from
  the attestation it signed last (SPEC §7.2): newest signed `issued_at`, none
  dated more than two minutes ahead, the first whose signature verifies.
- **Only attestations an address signed count toward `stake_shared`.** Each
  copy's signature is checked once, off the write path; copies of one id that
  carry different signatures are held apart.
- `@orangecheck/sdk` is required at `^1.15.0`, for `signatureIsValid`.

## [0.5.1] — 2026-10-19

### Fixed

- **A bond's age is that of the coins covering `minSats`**, as in OC Attest
  SPEC §7 step 5.d: the address's outputs oldest first until they reach
  `minSats`, aged by the youngest of them. `AttestationIndex` now reads each
  bond with `verify(…, { coverSats })`; it took the age of the oldest output.
  New `IndexOptions.minSats` sets the amount from the start, and `oc-strfry`
  passes `OC_MIN_SATS`. A larger `minSats` at `decide()` re-reads every bond,
  and until then a key that needs the age gets `lookup_error`.
- `@orangecheck/sdk` is required at `^1.12.0`, the first version with
  `coverSats` and with `check()` applying the same rule to `filterEvent`.

## [0.5.0] — 2026-10-08

### Changed

- **`failOpen` / `OC_FAIL_OPEN` applies only when the verifier is
  unreachable.** In the strfry index that means the signature verified and
  no Esplora endpoint answered. A key whose signature has not been checked
  yet, including during the warm-up after start, is now refused with
  `lookup_error` whatever the flag says. In `filterEvent`, a verified
  signature with no chain answer now counts as an outage (`lookup_error`, or
  `fail_open` with the flag) rather than `invalid_proof`.
- **A chain-API outage no longer replaces a known bond.** The index keeps the
  last bond it read until the chain answers again.

## [0.4.1] — 2026-09-23

### Fixed

- **The index missed attestations without the `oc-attest` marker.** At least
  one live, signed, npub-bound attestation carries no such tag, and the
  subscription filters on it. An unseen key is now also looked up by identity
  in the background (at most 4 at once, each key at most every 10 minutes), and
  its next event is decided with the result. The write path still never waits.
  Verified against live relays and chain: that attestation's key is refused on
  its first event and admitted on the next.
- **A new address's other attestations are fetched** by `#t`, so a second key
  it backs through an unmarked attestation still counts toward `stake_shared`.
- The no-proof message tells a holder who has one to retry.

## [0.4.0] — 2026-09-23

### Changed — the Strfry plugin decides from memory

Strfry waits on the plugin for every event. The plugin looked each pubkey up
over the network, about 6 s on a miss, so a sender rotating fresh pubkeys could
stall the relay's write path, which is the traffic this filter exists to stop.

`oc-strfry` now holds an `AttestationIndex`: every OC attestation that binds a
Nostr key, kept current by one standing subscription, with bonds re-read from
the chain every `OC_REFRESH_MS` (default 10 minutes). Each decision is a memory
read. Measured on the built binary against live relays: p50 0.06 ms, max
1.6 ms, for 50 fresh pubkeys.

- `OC_CACHE_TTL_MS` no longer applies to the plugin; `OC_REFRESH_MS` replaces it.
- During the first seconds after start an unknown key is told to retry rather
  than refused.

### Added

- `AttestationIndex` and `parseAttestationEvent`, for any long-running relay.
  `filterEvent` is unchanged.

## [0.3.0] — 2026-09-23

### Fixed

- **An attested Nostr key is now found.** SPEC §2 binds keys as `nostr:npub1…`
  and this filter looked up the event's hex `pubkey`, so it found no binding
  written the documented way. The 0.2.0 note below that the `#i` path "was
  never broken" was wrong. `@orangecheck/sdk` 1.7.0 matches either form.
- `allowPubkeys` accepts npub as documented; it was compared raw against hex.

### Changed

- `@orangecheck/sdk` `^1.4.0` → `^1.7.0`, which resolves the subject from the
  signed message and holds one bond to one Nostr key. A key whose address also
  backs another key is rejected with the new reason `stake_shared`.

## [0.2.0] — 2026-09-03

### Fixed

- **`@orangecheck/sdk` `^0.1.3` → `^1.4.0`.** No behavioural change here: this package looks up by identity (`#i`), which was never broken. Bumped to keep the family on one SDK major and to pick up relay.ochk.io in the default relay set.

  The pinned SDK filtered Nostr relays on a multi-letter `#address` tag. Relays
  index single-letter tag names only (NIP-12), so the query matched nothing and
  every lookup by address answered `not_found` — including for attestations
  that plainly exist. Fixed in `@orangecheck/sdk` 1.4.0, which queries the
  indexed `#t` tag. Lookups by attestation id (`#d`) and by identity (`#i`)
  were never affected.

  Measured against live relays before and after, for an address holding a real
  10,000-sat / 308-day attestation:

  ```
  sdk 0.1.4  ->  not_found
  sdk 1.4.0  ->  ok, sats 10000, days 308
  ```

  No API change: `CheckResult`, `CheckParams` and the `./scoring` subpath are
  identical across the two SDK majors, so this is a drop-in for callers.


## [0.1.3] — Initial published state

Initial public release. Drop-in Strfry / Nostr-relay plugin that rejects events from addresses without a valid OrangeCheck attestation.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-relay-filter-v0.1.3...HEAD
[0.1.3]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-relay-filter-v0.1.3
