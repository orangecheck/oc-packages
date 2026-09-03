# Changelog

All notable changes to **`@orangecheck/me-client`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [0.25.0] — 2026-09-03

### Fixed

- **`session.invalidate()` emitted the wrong telemetry code.** It sent
  `session.intra_signin`, which the event taxonomy defines as "user pressed
  sign-in while a valid session was already open" — the opposite of a teardown.
  A subscriber therefore saw a sign-in event every time an integrator tore a
  session down. It now emits `session.teardown`.

  Both codes are non-billable, so no integrator was ever charged for this; the
  cost was corrupt telemetry in the subscriber's own callback. `emitTelemetry`
  notifies local subscribers only and sends nothing to OC.

### Added

- `'session.teardown'` on the `TelemetryEvent['code']` union, and in
  `NON_BILLABLE_EVENTS` server-side (served via `/api/abuse-limits`). The
  taxonomy had no teardown code at all, which is why `invalidate` reached for
  the nearest wrong one. A consumer doing an exhaustive `switch` over the union
  will need a case for it.

### Changed

- `invalidate`'s docstring now says what the call does: OC sessions are
  stateless, derived from the `oc_session` JWT, so there is no server-side
  record to delete and the endpoint acknowledges without revoking anything.
  Dropping your copy of the token IS the logout. The
  `/api/session/invalidate` OpenAPI summary, which read "Invalidate a session
  (logout)", is corrected in oc-me-web alongside this.

## [0.24.0] and earlier

See git history.
