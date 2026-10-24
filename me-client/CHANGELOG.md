# Changelog

All notable changes to **`@orangecheck/me-client`** will be documented in this
file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [0.48.0] — 2026-10-24

### Added

- `@orangecheck/me-client/button-auto` (`dist/button-auto.mjs`): the sign-in
  button for a page that loads it by a tag. It enhances every
  `button[data-oc-sign-in]` when it runs, reads its options from the button
  (`data-mark`, `data-appearance`, `data-busy-label`, `data-accessible-label`,
  `data-label="none"`), and reports through DOM events: `oc-signed-in`
  (`{ account, token, waitUntil }`; the button stays busy until every
  `waitUntil` promise settles) and `oc-sign-in-outcome` (`{ status, message }`).
  The page's own code imports nothing, so the file can be loaded from a CDN
  with a pinned version and Subresource Integrity, which covers a
  `<script src>` but no `import` in an inline script. Like `button.mjs`, it is
  one file with no imports. A button it cannot enhance is reported in the
  console and skipped.

## [0.47.0] — 2026-10-24

### Added

- A label in any language: `label` takes any words that keep "orangecheck",
  lowercase, as written (`"Se connecter avec orangecheck"`). The approved
  English set stays the default (`SIGN_IN_LABELS`). Words without the name
  still throw. Words already in the button that say "orangecheck" are kept.
- `busyLabel` sets what the button says while the window is open.
- `label: false` (or `data-label="none"` on the button) draws the mark alone:
  `aria-label` names it ("Sign in with orangecheck", or `accessibleLabel`), and
  `button.css` makes it at least 44px wide and centred.
- A `<span data-oc-mark>` placeholder in the button is replaced by the mark,
  at the size `button.css` already gave it, so enhancing changes no size. Its
  value, if any, names the variant (`data-oc-mark="brand"`).
- `holdWidth(button)`: the busy state keeps the button's width (and minimum
  width), so shorter busy words move nothing beside it.

### Changed

- `button.css`: the words stay on one line; the mark is 1.75em wide (the tile
  1.25em) with its aspect ratio set before it paints; under
  `forced-colors: active` the mark is one flat shape in the text colour, the
  tile has no ink square, and the brand button's ring and edge use system
  colours. The `inherit` appearance no longer draws a focus ring: the site's
  own ring shows, as on its other buttons. `brand` keeps its own.
- Built with `@orangecheck/mark` 0.2.0: the mono mark's faces step 1, 0.6 and
  0.3, so it reads as the check at button size.

## [0.46.1] — 2026-10-24

### Fixed

- `button.css` leaves the button's alignment to the site in the `inherit`
  appearance. It centred the mark and label, so on me-demo, whose other
  full-width buttons start at the left, the orangecheck button alone was
  centred. `brand` still centres its own content.

## [0.46.0] — 2026-10-24

### Added

- `@orangecheck/me-client/button`: `enhanceSignInButton(button, options)` makes
  the site's own `<button>` a "Sign in with orangecheck" button. It keeps the
  button's classes and styles, adds the orangecheck mark (`mono` in the text
  colour by default, `brand`, `tile` or none) and an approved label
  (`SIGN_IN_LABELS`), opens the popup inside the click, holds a focusable busy
  state, and reports how the popup ended (`OUTCOME_COPY` has the words). The
  file has no imports, so it can be copied onto the site's origin, and it
  parses no HTML.
- `@orangecheck/me-client/react`: `<SignInWithOrangecheck>`, the same as a
  native button (`react` is an optional peer).
- `@orangecheck/me-client/button.css`: optional, zero specificity. `inherit`
  (the default) adds only the mark's spacing, a 44px target and a focus ring;
  `brand` is orangecheck's button, themed by `--oc-*` properties.

## [0.45.0] — 2026-10-24

### Added

- `matchMergedUser(session, lookup)` and `mergedHandles(session)` (server):
  after someone merges two orangecheck accounts, a sign-in token carries
  `merged_rh`, your site's handle for each account merged in. Look them up in
  the handles you stored; the answer is `none` (a new user), `one` (attach this
  `did_oc` to that user) or `conflict` (two of your users: pick neither). A
  claim that is not a list of at most 16 non-empty strings reads as none.
  `orangecheck` 3.4.0 has `match_merged_user`; both are held to
  `test-vectors/integrator.json` (`merged`).

## [0.44.0] — 2026-10-24

### Changed

- A family session (no `aud`: the ochk.io cookie a *.ochk.io site reads with
  no `audience`) is checked against ochk.io's revocation feed by default, in
  `checkOcSession`, `getOcSession`, `withOcAuth`, `ocAuthExpress` and
  `ocAuthHono`, through auth-core's `familyRevocationCheck`, the same feed
  site-kit reads. **A family site must now set `OC_REVOCATION_FEED_TOKEN`**; with it unset, a family session makes these
  calls throw, naming the variable, rather than accept it by signature alone.
  `revocation: false` still reads it by signature alone on purpose, and a
  check the site passes still wins. Tokens bound to your site (`aud`) are
  checked as before. A token whose `aud` is an empty list counts as a family
  session here, as verification with no audience already counts it.
  orangecheck (Python) reads no family sessions:
  `verify_session` refuses a token without `aud`.

## [0.43.0] — 2026-10-24

### Added

- `checkSignInRule(session, { projectKey })` from
  `@orangecheck/me-client/server`: your project's "who can sign in" rule for a
  session you verified yourself (with `verifyOcToken`, or one your own session
  replaces). The rule is read and held as `withOcAuth({ projectKey })` holds
  it: a minute, the last one read standing ten more while it can't be read,
  then refused. It answers `{ ok: true }` or `{ ok: false, status, body }` with
  `withOcAuth`'s status and body: 403 `bond_required` with `need`, `have` and
  `back_url`, 503 `bond_policy_unavailable`, or 500 `unknown_project_key`.
  `requireBond` sets the floor yourself and reads nothing. It takes only the
  session object `verifyOcToken`, `checkOcToken`, `getOcSession` or an adapter
  returned, and throws for claims read any other way, or on an option it does
  not read. sdk-py 3.3.0 has `check_sign_in_rule`, and both are
  held to `test-vectors/server-helpers.json` (`sign_in_rule`).

## [0.42.1] — 2026-10-24

### Docs

- The API reference covers the `/server` and `/popup` entry points, at
  ochk.io/docs/sdk/me-client/server and ochk.io/docs/sdk/me-client/popup. No
  code change.

## [0.42.0] — 2026-10-24

### Added

- `checkOcToken(token, options)` from `@orangecheck/me-client/server`, for the
  route that receives the token from the sign-in popup. It answers
  `{ status: 'valid', session }`, `{ status: 'invalid', reason? }` (`reason:
  'no_session_handle'` for a bound token with no handle) or `{ status:
  'unavailable', reason: 'key_set_unavailable' }`. Answer the last with 503 so
  the page tries again: `verifyOcToken` answers `null` for it, which reads as a
  failed sign-in. It takes `verifyOcToken`'s options, `requireHandle` included.

### Changed

- Needs `@orangecheck/auth-core` ^2.17.0: a key set with no usable key reads as
  an outage (503 `key_set_unavailable`, shared vector "a key set with no key the
  verifier can use"), and the key-set fetch gives up after 10 seconds.

## [0.41.0] — 2026-10-24

### Added

- From `/server`, for after a sign-in:
  - `spendOnce(jti, exp, store)`, `JtiStore` and `MemoryJtiStore`: a token's
    `jti` starts one session. True the first time, false for a repeat or a
    token that has expired. The store is yours, shared by every server
    (`add` must be atomic); a store that fails rejects.
  - `revokeToken(token | tokens, { issuer?, timeoutMs? })`: ends a token, or up
    to eight, at the auth host (`POST <issuer>/api/auth/revoke`). Resolves to
    `{ ok: true, revoked }` or `{ ok: false, reason, status }` (`rate_limited`,
    `bad_request`, `unavailable`), never throws on an outage. An unknown option
    throws, and so does an `issuer` that is not one origin (https, or http on
    this machine; no path, query, fragment or user name). ochk.io takes 60
    calls a minute per IP: queue a `rate_limited` or `unavailable` result and
    try again, since the token stays valid until it expires.
- `FederationMigratingWebhookPayload`, `FederationMigrationCancelledWebhookPayload`
  and `FederationSuccessor`: the two federation notices, typed as me.ochk.io
  sends them. `/integrator` now exports them too, with `SystemWebhookPayload`
  and `DropClosedWebhookPayload`.
- `test-vectors/server-helpers.json`: what the adapters answer for a token, and
  how `spendOnce` and `revokeToken` behave, read by this package and by
  `orangecheck` 3.2.0's `check_oc_session`, `spend_once` and `revoke_token`.

### Changed

- Needs `@orangecheck/auth-core` ^2.16.0. A request whose token can't be
  checked because ochk.io's key set can't be read (and no copy younger than
  `jwksMaxStaleMs` is held) is `{ status: 'unavailable', reason:
  'key_set_unavailable' }` from `checkOcSession`, and `withOcAuth`,
  `ocAuthExpress` and `ocAuthHono` answer it 503 `key_set_unavailable`, for
  reads and writes alike. It was signed out. `getOcSession` still answers
  `null`. `OcSessionCheck`'s `unavailable` names its `reason`
  (`OcSessionUnavailable`), and a write while the list of ended sessions can't
  be read is `revocations_unavailable`, as before. The same answer as
  `orangecheck` 3.2.0's `check_oc_session`, held to
  `test-vectors/server-helpers.json`.
- `WebhookHeaders` documents `OC-Envelope-Id` as the event's `id` for a
  billable event only. A system notice (`OC-Class: system`) has no `id` in its
  body, so this header is its only id. `OC-Key-Id` names a key published at
  `https://me.ochk.io/api/dev-jwks`.

## [0.40.1] — 2026-10-23

### Changed

- Needs `@orangecheck/auth-core` ^2.15.0: a sign-in token that carries `rh`
  verifies only when `rh` is a non-empty string and `aud` is one string your
  site accepts, so every such session is looked up on its audience's list of
  ended sessions. `SessionPayload.rh` names the handle. The same as
  `orangecheck` 3.1.0, held to `test-vectors/integrator.json`.

## [0.40.0] — 2026-10-23

### Changed

- **Breaking, by design.** A sign-in token bound to your site (one with `aud`)
  that carries no `rh` is refused by `verifyOcToken`, `getOcSession`,
  `checkOcSession`, `withOcAuth`, `ocAuthExpress` and `ocAuthHono`. `rh` is the
  token's handle on your project's list of ended sessions, so without it sign
  out everywhere can't end the session, and the quickstart asked every site to
  refuse such a token itself. Now the SDK does. Every token from the ochk.app
  sign-in popup carries one, so a site that signs people in that way sees no
  change. `checkOcSession` answers `{ status: 'signed_out', reason:
  'no_session_handle' }`, and an adapter with `required` answers
  `401 { reason: 'no_session_handle' }`; the SDK says why once on the console.
  `requireHandle: false` accepts such a token, which sign out everywhere then
  does not end. A family session (no `aud`, on *.ochk.io) is not held to it:
  the family's own feed ends it. `requireHandle` must be `true` or `false`; an
  unknown option is still refused. The same as `orangecheck` 3.0.0
  (`require_handle`), held to `test-vectors/integrator.json`, where every token
  now carries `rh` and two that don't are refused.
- Popup tokens have carried `rh` since 2026-10-22 and live up to 30 days. A site
  that keeps the popup token and verifies it again on later requests, rather
  than starting its own session, signs out anyone still holding an older one,
  once, until about 2026-11-21; they sign in again.
- `audience: '*'` admits family sessions too, which have no `rh`; only the
  family's own feed ends them. Use it only on a route that receives tokens
  forwarded from *.ochk.io.

## [0.39.0] — 2026-10-23

### Added

- OC Connect for a site that keeps its own login, in `/server`:
  `connectProvision`, `connectClaimLink` and `connectDelete`. Each takes
  `{ apiKey, userId }` (plus `consent`, `email`, `emailVerified` for provision)
  and resolves `{ ok: true, … }` or `{ ok: false, reason, status }`. A refusal or
  an outage is a result, never a throw, and a call gives up after `timeoutMs`
  (5 s, at most 30 s). Only a mistake in the call throws, before anything is sent:
  an option it does not read, a missing key or user id, `emailVerified` without
  `email`, `consent: false` (an unticked box means no call at all), or a call
  where there is a `document` (a hint for the commonest slip, not a guard: import
  these only from server code). Only the options object's own keys are read,
  once, so an inherited `consent` is never used. Every call goes to
  `https://ochk.io` and nowhere else; a redirect is an error. A claim link
  anywhere but `https://ochk.app` is `unavailable`. A user id is counted in UTF-16
  code units, as ochk.io counts it.
- `@orangecheck/me-client/connect-consent`: `CONNECT_CONSENT_LABEL` and
  `CONNECT_CONSENT_BLURB`, the words for an optional "also make me an orangecheck
  account" box, from a module with no imports so any UI can render it. Also
  exported from the main and `/server` entries. The same words and results as
  `orangecheck` (py) 2.13.0, held to `test-vectors/connect.json`.

## [0.38.1] — 2026-10-22

Requires `@orangecheck/auth-core` `^2.13.0`.

### Fixed

- A server whose wall clock stepped back let the last sign-in rule stand past ten
  minutes and waited longer before asking me.ochk.io again. Both are the longer of
  the time on `performance.now()` and on the wall clock now, so neither a clock set
  back nor a paused host stretches them, as auth-core 2.13.0 measures the list of
  ended sessions.
- Requests that arrive together while the rule is being read share that one read
  instead of each asking me.ochk.io.
- `checkOcSession` reads the list of ended sessions once per request and decides
  on that answer, so two reads can't disagree about the same request.

## [0.38.0] — 2026-10-22

### Added

- `checkOcSession(headers, options)`: like `getOcSession`, but resolves
  `{ status: 'signed_in', session }`, `{ status: 'signed_out' }` or
  `{ status: 'unavailable' }`, the last when the token verifies but me.ochk.io's
  list of ended sessions can't vouch for this request (a write while it can't be
  read). `getOcSession` is unchanged.

### Changed

- `withOcAuth`, `ocAuthExpress` and `ocAuthHono` answer such a write
  `503 { ok: false, reason: 'revocations_unavailable' }` before your handler runs,
  instead of treating the person as signed out (which `required` turned into a
  401). Reads go on as before.

## [0.37.0] — 2026-10-22

### Changed

- `projectKey`: a request with no session is not held to the project's sign-in
  rule and never waits on reading it, so pages that serve signed-out people keep
  working while me.ochk.io can't be reached. **A project rule no longer refuses
  signed-out requests by itself: set `required: true` if a route must refuse
  them.** A signed-in request is held to the rule as in 0.36.1. An explicit
  `requireBond` still implies `required`.

## [0.36.1] — 2026-10-22

### Fixed

- `projectKey`: an answer from me.ochk.io that does not say the sign-in rule
  (not `ok: true`, no `require_bond`, or a floor that is not a whole number of
  at least 0) counts as unreadable, not as "no requirement".
- `projectKey`: while the rule can't be read, the last one read stands for ten
  minutes, then requests are refused (`503 bond_policy_unavailable`) until it
  can be read.
- `meOrigin` now applies to the list of ended sessions too, and both the rule and
  the list are held per me.ochk.io as well as per project key.

## [0.36.0] — 2026-10-22

### Added

- `signInWithOcOutcome(options?)`: opens the sign-in popup like `signInWithOc` and
  resolves with how it ended: `{ status: 'signed_in', account, token }`,
  `'blocked'` (the browser refused the window), `'closed'` (the person closed it),
  `'aborted'` (your signal) or `'failed'`. `signInWithOc` is unchanged: it still
  resolves the account and token, or `null`.
- Shared vectors for who may sign in (`bond`), held by `bondMeets` here and by
  sdk-py's `bond_meets`.

## [0.35.0] — 2026-10-22

Requires `@orangecheck/auth-core` `^2.12.0`.

### Changed — revocation by per-audience handle

- The server helpers look up a token's `rh` (its revocation handle for its own
  audience) in me.ochk.io's list of ended handles for that audience, one list per
  audience the site's tokens carry, so a site served from both `www` and the apex
  is covered with one configuration. A token without `rh` is checked by its
  signature alone. The list names nobody, and two sites' handles for one person
  never match.

### Deprecated

- 0.34.0. me.ochk.io answers its request with an empty list, which it reads as
  "nothing ended". Use 0.35.0 or later.

## [0.34.0] — 2026-10-22

Requires `@orangecheck/auth-core` `^2.11.0`.

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

## [0.38.3] — 2026-10-23

### Changed

- The session check passes `@orangecheck/auth-core` only the options it
  reads (`issuer`, `jwksCacheTtlMs`, `jwksMaxStaleMs`, `audience`).

## [0.38.2] — 2026-10-23

### Changed

- **Unknown options throw.** `withOcAuth`, `ocAuthExpress` and `ocAuthHono`
  throw a `TypeError` when built with an option they do not read, and
  `getOcSession` / `checkOcSession` reject. So does a key in `requireBond`
  other than `minSats`, `minDays` and `maxAgeSecs`. They read only the keys
  in `WithOcAuthOptions`.

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
