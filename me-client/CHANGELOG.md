# Changelog

All notable changes to **`@orangecheck/me-client`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [0.27.0] — 2026-09-22

### Added

- **`audience` on `withOcAuth`, `ocAuthExpress`, `ocAuthHono` and
  `getOcSession`.** The sign-in popup issues each site a token bound to that
  site's origin. Pass your own origin —
  `withOcAuth(handler, { audience: 'https://your-site.example' })` — and a
  token issued to any other site is refused. Sites on `*.ochk.io` that read the
  family cookie leave it out.
- A one-time console warning when a site-bound token reaches a verifier with
  no `audience` configured, rather than a silent 401 on every sign-in.

### Changed

- Requires `@orangecheck/auth-core` ^2.7.0.

## [0.25.3] — 2026-09-18

### Fixed — webhook verification could never succeed

Two independent defects, either of which was fatal:

- **Wrong JWKS.** `webhook.verify` fetched `https://ochk.io/.well-known/jwks.json`
  — the family SESSION key — when me.ochk.io signs its deliveries with a
  different key, published at `https://me.ochk.io/api/dev-jwks`. Any caller that
  did not pass `{ jwk }` failed with `kid … not in JWKS` before it could check a
  signature. The default is now the webhook JWKS; `{ issuer }` still overrides.
- **Signed material disagreed.** me.ochk.io signed `sha256(body)` while this
  verifier verifies over the raw body — so no delivery it ever sent could
  validate. The server is the side that drifted (its own published JWKS note
  says "sigs over the raw webhook body") and has been corrected; this release
  is the matching half, plus a contract test on the server that signs here and
  verifies with this function.

## [0.25.2] — 2026-09-18

### Fixed

- `FireEventOptions.signingSecret` said the signature is "REQUIRED in live
  mode". me.ochk.io now refuses an unsigned `/api/integrator/event` POST in
  **test mode too** — a user session proves a user, never the paying project,
  and a signed-in stranger holding a public `project_key` could otherwise bill
  that project into their own ledger. The docstring is published as SDK
  reference on docs.ochk.io, so a stale one is a false published claim.

## [Unreleased]

- _(no pending changes)_

## [0.25.1] — 2026-09-14

### Fixed

- Raises the `@orangecheck/auth-core` floor to `^2.6.0`, which bounds how often
  an unrecognised `kid` can force a JWKS refetch. This package re-exports
  `verifyOcToken` / `getOcSession`, so an integrator verifying tokens on their
  own server was the one paying for it: a stream of tokens carrying random kids
  dropped the key cache and refetched on every rejection, putting a network
  round-trip in front of each and pointing the volume at the auth host.

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
