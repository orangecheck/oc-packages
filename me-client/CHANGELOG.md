# Changelog

All notable changes to **`@orangecheck/me-client`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

### Added

- `getOcSession`, `withOcAuth`, `ocAuthExpress` and `ocAuthHono` refuse a
  session the person ended everywhere (sign out everywhere, a passkey removed,
  the account deleted) once `OC_PROJECT_KEY` and `OC_SIGNING_SECRET` are set.
  They read the account cutoffs from me.ochk.io once a minute through
  auth-core's `integratorRevocationCheck`. While the cutoffs can't be read, reads
  go on and writes are refused. New options: `method` (the adapters pass it),
  `projectKey` and `revocation` (a check of your own, or `false`). Without the
  two variables nothing changes, apart from a one-time warning in production.

### Changed

- The README and `signInWithOc`'s example hand the token to the site's server,
  which keeps it in an httpOnly cookie, as ochk.io/docs/me/quickstart teaches.

## [0.33.0] — 2026-10-22

### Changed

- Requires `@orangecheck/auth-core` ^2.10.0, so `verifyOcToken` (and
  `withOcAuth`, `ocAuthExpress`, `ocAuthHono`) honours a key published as
  retired only for tokens issued before its `retired_at`, and stops leaning on
  a stale ochk.io key list after `jwksMaxStaleMs` (6 hours by default).
- `oc.identity.verifyActivityAttestation` and `oc.webhook.verify` take the same
  `jwksMaxStaleMs` option, with the same 6-hour default: the last fetched key
  list stands in during an outage until then, and verification fails closed
  after. An unknown `kid` refetches the list at most once a minute per issuer,
  and keeps the cached keys if that refetch fails.
- The integrator vectors (`test-vectors/integrator.json`, shared with sdk-py)
  carry a retired key: one token it signed before retiring, which verifies,
  and two it did not, which are refused.

## [0.32.4] — 2026-10-21

### Fixed

- `oc.scope.request` sends the user straight to ochk.app's consent page.
  It went to me.ochk.io, whose pages moved to ochk.app on 2026-10-19, so
  every request took an extra redirect. `setOrigin()` no longer moves the
  consent page, since it sets the API origin and the API keeps no pages.
  Pass `origin` to point it somewhere else.
- Comments and the README no longer point at me.ochk.io pages that moved,
  or at a private repo.

## [0.32.3] — 2026-10-19

### Changed

- `oc.identity.verifyActivityAttestation` reads the attestation from the
  signed bytes (`canonical_b64`) and returns those values. The bytes must be
  an `oc-me-activity` attestation in canonical form, the expiry is the signed
  one, and a bundle whose readable `attestation` differs from the signed
  bytes fails. `attestation` in the input is now optional, and the result
  carries `attestation` only when every check passes. Upgrade if you gate on
  the result.

## [0.32.2] — 2026-10-17

### Fixed

- A handler typed with Next's own `NextApiRequest` / `NextApiResponse`
  type-checks inside `withOcAuth`. Read the session with
  `WithOcSession<NextApiRequest>`.
- The missing-`audience` warning also fires for a token in your own
  `oc_session` cookie, the flow the quickstart teaches; it used to stay
  silent there and every sign-in 401ed with no clue.
- `payment.authorize` no longer requires `identity`, which the server ignores;
  it takes the account from the session.
- The npm description no longer advertises the removed React button.

## [0.32.1] — 2026-10-17

The first published 0.32. The `me-client-v0.32.0` tag was pushed on the
wrong commit, where the version still read 0.31.0, so the release refused it
and nothing was published under 0.32.0.

### Removed

- `OcSignInButton`, deprecated in 0.30. It was the only React code in the
  main entry, so a Node backend that imported `oc` crashed with "Cannot find
  package 'react'". The main entry has no React now, and `react`,
  `react-dom` and `@orangecheck/auth-client` are no longer peer dependencies.
  Sign in with `signInWithOc()` from `/popup`.

### Changed

- A `projectKey` that names no project answers `500 unknown_project_key` and
  logs once which key is wrong. It used to read as an outage
  (`503 bond_policy_unavailable`) on every request.
- `req.ocSession` is typed on Express's own `Request`, and `OcHonoEnv` types
  `c.get('ocSession')`: `new Hono<OcHonoEnv>()`.
- `webhook.verify` accepts a missing signature or kid (as `req.header()`
  returns them) and answers `ok: false`.
- The npm homepage is the quickstart.

## [0.31.0] — 2026-10-17

### Changed — templates price at the full user share

- Every `ARCHETYPE_TEMPLATES` event, and the disabled default, sits at
  `user_share_pct: 0.8`, the most a user can earn after the 20% platform
  fee. Prices drop so each user earns exactly what they did at the old
  0.65 or 0.7 share: account creation 1,300 → 1,056 sats, still 845 earned.
  A smaller share only returned part of the fee to the developer's balance
  after charging it, so it cost more for nothing.
- Template summaries and examples are plain words with no real company
  names. Doc comments say what the user earns, not "cashback".

## [0.30.1] — 2026-10-17

### Fixed

- `back_url` on a `403 bond_required` opens the Backing section of the
  account page, `https://ochk.app/me/account#backing`. The old address
  redirected to the top of the page.

## [0.30.0] — 2026-10-17

### Added — `accountId` names who earns

- `oc.event.fire({ accountId })` takes the earner's account id, the `did:oc`
  from `/api/auth/me`. It is what `userAddress` always held: an account id,
  never a Bitcoin address.

### Deprecated

- `userAddress`. It still works and means the same thing. Passing both with
  different values throws.
- `OcSignInButton`. Use `signInWithOc()` from `/popup` on your own site, or
  `<OcSignIn>` from `@orangecheck/auth-client` on orangecheck's. It shares a
  name with auth-client's button, which does something else, and it goes in a
  later minor.

## [0.29.0] — 2026-10-16

### Added — paying users is optional

- `payingAt(periods, at)` and the `PayPeriod` type: whether a project pays its
  users at a moment, from the `pay_periods` that `GET /api/integrator/config`
  publishes. A project pays always, in promos, or never.
- `oc.event.verify(envelope, config, amount, { payPeriods })` flags a receipt
  billed outside every period (`outside_pay_period`).
- `fireBatch` results can be `not_paying`, and the response carries
  `next_pay_period` when the project isn't paying.

### Changed

- `oc.event.fire` resolves to what the server sends: `{ earned: true, event, … }`
  or, outside a pay period, `{ earned: false, reason: 'not_paying',
  next_pay_period }`. It was typed as a bare `BillableEvent`, which the response
  never was: `res.id` was always undefined and `res.event.id` didn't compile.

## [0.28.0] — 2026-10-16

### Changed

- A `bond_required` refusal speaks the wire's case: `need` is
  `{ min_sats, min_days }` (plus `max_age_secs` when set), as `have` and the
  project's `require_bond` already were. It also carries `back_url`, where the
  person can back their account; link them there.
- A signed-out request on an optional route, while the project's requirement
  has never been readable, gets `503 bond_policy_unavailable` rather than
  `401 unauthenticated`: signing in wouldn't have helped.

### Fixed

- While me.ochk.io is unreachable, a failed read of the project's requirement
  is retried at most every ten seconds instead of on every request, each of
  which waited up to four seconds.
- The README imported `useOcSession` from this package; it comes from
  `@orangecheck/auth-client`. `oc.session.create` records no charge, and the
  docs no longer say it does.

## [0.27.4] — 2026-10-16

### Fixed — two docstrings that misled integrators

- `OcPopupResult.account` said integrators get a per-project anonymous
  identifier. They get `did_oc`, the same at every site.
- `OcSignInButton` said it was a drop-in sign-in. It rides the family cookie,
  so it works only on orangecheck's own sites; a third-party site uses
  `signInWithOc()` and `withOcAuth`.

## [0.27.3] — 2026-10-16

### Fixed — a tightened sign-in requirement took up to fifteen minutes to bite

- `projectKey` read the requirement from the project's price config, which is
  edge-cached for ten minutes, and held it five more. Live, an app that had
  just turned on "backed accounts only" kept admitting unbacked accounts. It
  now reads me.ochk.io's uncached `/api/integrator/<key>/sign-in` and holds it
  one minute.

## [0.27.2] — 2026-10-16

### Added — ask for accounts backed by bitcoin

- `withOcAuth` / `ocAuthExpress` / `ocAuthHono` take `requireBond: { minSats,
  minDays, maxAgeSecs }`, or `projectKey` to read the floor the integrator set
  in the project's settings (public config, cached five minutes). An account
  below it gets 403 `bond_required` with what was needed and what it has; a
  requirement that has never been readable gives 503
  `bond_policy_unavailable`, never a pass. Apps that set neither are unchanged.
- Re-exports `readBondClaim`, `bondMeets` and `BondClaim` from auth-core 2.8.

### Fixed

- The README quick start used an export that doesn't exist (`useOcSession`)
  and a claim tokens don't carry (`addr`). It now shows the popup and server
  flow that works cross-domain.

## [0.27.1] — 2026-09-24

### Fixed

- **`oc.family.scopes('oc-pledge')`.** `FamilyVerb` and the verb allowlist
  covered five of the six family verbs, so the pledge verb was refused before
  any request was made. me.ochk.io serves `/api/family/scopes/oc-pledge` as of
  the same day.

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
