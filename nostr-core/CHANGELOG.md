# Changelog

All notable changes to **`@orangecheck/nostr-core`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.2.1] — 2026-09-03

### Fixed

- **Dropped `wss://relay.nostr.band` from `DEFAULT_RELAYS`.** It is
  unreachable, not slow: DNS resolves 95.216.33.150 but port 443 never
  completes a handshake, and the apex `nostr.band` is down too — verified from
  two independent networks while `nos.lol` connected fine from both.

  A dead relay in a default set is worse than a missing one, because fan-outs
  wait on every relay. In `@orangecheck/sdk` the same entry pushed `check()` to
  10.4s, past `@orangecheck/gate`'s 5s lookup race, so no address-based gate
  decision could succeed at all.

- `wss://relay.snort.social` takes its place, keeping the five-relay breadth
  the set exists for (no artifact should depend on a single relay being up).
  It answered every probe. Note it accepts unindexed tag filters by *ignoring*
  them rather than rejecting, so a multi-letter filter makes it return a flood
  of unrelated events — which the `Filter` type in this package now makes
  impossible to express.

- `index.test.ts` gains a guard that `DEFAULT_RELAYS` does not contain the dead
  relay. The existing "at least 5 relays" assertion is what caught the removal;
  the right answer was to restore breadth with a relay that answers rather than
  to lower the bar, so it stands unchanged with its intent written down.

## [0.2.0] — 2026-09-02

### Changed

- **`Filter` now admits single-letter tag filter keys only** (`#a`–`#z`,
  `#A`–`#Z`), the only thing NIP-12 guarantees relays index. The previous type
  NAMED `'#poll_id'`, `'#voter'` and `'#creator'` as legitimate alongside a
  `` `#${string}` `` catch-all, which is how four separate codebases shipped
  filters that relays accept, forward, and match nothing with: OC Vote's tally
  read zero ballots for every poll, OC Agent showed revoked delegations as
  valid, and the SDK answered `not_found` for every attestation.

  A multi-letter key is now a compile error. Filter by an indexed `#t` tag and
  disambiguate on the event body, or query `#d` when you hold the id.

## [0.1.1] — earlier

- Initial published line. See git history.
