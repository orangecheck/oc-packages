# Changelog

All notable changes to **`@orangecheck/nostr-core`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.7.0] — 2026-10-21

### Changed

- **`DEFAULT_RELAYS` is nos.lol, relay.primal.net, relay.damus.io,
  nostr.oxtr.dev and relay.ochk.io.** A relay now stays only if it answers OK
  true to the family's kinds from a fresh key and still serves the event an
  hour later. relay.snort.social runs in memory and answered OK true to 16
  rebroadcast family events, then served none of them. offchain.pub's web of
  trust refused fresh keys, and it held none of the 59 family events on
  relay.ochk.io. nostr.oxtr.dev kept 37 of 37 an hour later; relay.damus.io
  holds the most family events of any public relay.

## [0.6.0] — 2026-10-21

### Added

- **`subscribe(filter, { relays, onEvent, onStatus, initialBackoffMs, maxBackoffMs })`**:
  a long-lived subscription on every relay, kept until `stop()`. Its REQ is
  re-sent whenever a relay's socket comes back (full-jitter back-off, 1s
  doubling to 30s), so a `since` filter backfills what was missed. Events are
  verified and filter-matched like `queryEvents` and delivered once per id
  across relays. `onStatus` reports `open`, `eose`, `closed`, `error` and
  `unavailable` (a relay in its handshake back-off) per relay; `getHealth()`
  counts open relays. In a browser it rides the page's pooled socket and holds
  one of that relay's subscription slots while open. OC Chat and OC Lock each
  kept their own copy of this, with a socket per subscription per relay.

## [0.5.0] — 2026-10-21

### Changed

- **In a browser, calls share one socket per relay.** `queryEvents` and
  `publishEvent` used to open a new WebSocket per call per relay. A page that
  ran several queries at once opened as many sockets: chat's channels view
  opened 9 per relay, 7 at once. offchain.pub refuses a fifth simultaneous
  socket from one address, nos.lol answers 429 at 16, and relay.damus.io's 503s
  rise with concurrency. The handshake was also 60–79% of each query's time.
  Now each relay gets one socket per page:
  - each query is its own subscription on it, closed at EOSE, CLOSED or the
    deadline; at most 10 are open at once per relay, and the rest wait, with
    the wait counted against their own deadline;
  - a relay that refuses the handshake settles every waiting call at once and
    is skipped for 10s, reported as `reason: "relay_unavailable"` in
    `relayStatus` (and in `publishEvent` results, without a retry);
  - publishes match each OK by event id; retry on timeout is unchanged;
  - a call that passes an `auth` signer still gets its own socket;
  - an idle socket closes after 30s.
  Outside a browser nothing changes: each call has its own socket.

### Added

- `configureRelayPool({ enabled, maxSubscriptions, backoffMs, idleMs })` and
  `closeRelayPool()`.

## [0.4.0] — 2026-09-24

### Added

- **`relayStatus[].eose`**: true only when the relay sent EOSE, meaning it
  finished answering and an empty or short result from it is complete. `ok`
  is also true when a relay timed out or closed after sending some events
  (those carry a `reason`), so completeness checks should read `eose` rather
  than `ok`. The field is required on the type, so code that builds its own
  `QueryResult` values must set it.

## [0.3.0] — 2026-09-24

### Changed

- **`queryEvents` returns only verified events.** Each event a relay returns
  is kept only if its id equals the NIP-01 hash of its fields, its `sig` is a
  valid BIP-340 signature of that id by `pubkey`, and it matches the filter
  that was sent (`ids`, `kinds`, `authors`, `since`, `until`, `#x` tags).
  Deduplication is keyed on the verified id, so the first copy of an id no
  longer decides which content is returned. There is no opt-out.
- `relayStatus[].events` now counts accepted events only, and `ok` after a
  `CLOSED` or early close reflects accepted events.

### Added

- `relayStatus[].rejected` — events from that relay dropped by the checks above.
- `verifyEvent()`, `getEventHash()` and `matchFilter()`.
- Dependencies on `@noble/curves` and `@noble/hashes` for the signature check.

## [0.2.3] — 2026-09-14

### Fixed

- **A relay that ends a subscription with `CLOSED` no longer costs the full
  timeout.** `CLOSED` was a recognised frame type with no branch in the query
  loop, so the client kept waiting for an answer that had already arrived, then
  reported `reason: 'timeout'` and discarded the relay's own explanation.

  Not theoretical: strfry CLOSEs a subscription whose filter uses an unindexed
  multi-letter tag, and `relay.snort.social` is in `DEFAULT_RELAYS`. One such
  relay added the whole timeout to every fan-out — 8 seconds on oc-chat's
  device lookup, which is on the deliverability path.

  `ok` still keys off whether events actually arrived, since a relay may stream
  stored events and then close.

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
  It answered every probe. Note it accepts unindexed tag filters by _ignoring_
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
