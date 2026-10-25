# Changelog

All notable changes to **`@orangecheck/auth-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [2.24.0] — 2026-10-25

### Changed

- `bondMeets(payload, need)` is false when `need` is not a floor: an object of
  `minSats`, `minDays` and `maxAgeSecs` only, each left out or a whole number
  of 0 or more (a safe integer). NaN, an infinity, a negative, a fraction, a
  string, a boolean, null or a misspelt key no longer reads as no floor.

### Added

- `readBondNeed(need)`: the floor `bondMeets` applies, or null when it is not
  one, so a caller can refuse a bad floor when it is configured.
  `test-vectors/bond-need.json` holds auth-core, me-client and sdk-py to the
  same answers.

## [2.23.0] — 2026-10-25

### Changed

- A revocation list the check cannot read in full is a failed read, never
  "nothing ended". A token key that is not a string, an `accounts` or
  `handles` value that is not a finite number (a cutoff past a double parses
  as Infinity), or an `accounts` that is not a map now fail the whole read,
  where the entry used to be dropped and the session it ended stayed live.
  `integratorRevocationCheck` also needs `handles`: a list without that map
  is a failed read. A failed read keeps the last good copy; with none, writes
  are refused, as through any outage.
- `nameProblem(value, max)` counts `max` in code points, not UTF-16 units, so
  an emoji is one character, not two: 25 emoji now fit a 32-character name,
  where they read as `too_long`. That is how a reader counts, how chat's
  `shownText` already cut, and how Postgres counts a text column. A combining
  mark still counts on its own.

## [2.22.0] — 2026-10-24

### Added

- `@orangecheck/auth-core/identifiers`: `isDidOc(value)` and
  `normalizeEmail(raw)`. A did:oc is `did:oc:` and 32 lowercase hex digits with
  nothing before or after it (no upper case, no surrounding space, no trailing
  newline). An email is stored and looked up trimmed, then lower-cased, as
  every family repo already does. The entry imports nothing, so a browser
  bundle can take it; both are also exported from the package root. The rules
  are pinned by `test-vectors/identifiers.json`, which sdk-py's twins read too.
  `isDidOc` narrows to `DidOc` (`did:oc:${string}`), not to `string`, so a
  `string` it refuses is still a `string` on the other branch.

## [2.21.0] — 2026-10-24

### Added

- `@orangecheck/auth-core/family-origins`: `FAMILY_ORIGINS` and
  `isFamilyOrigin`, the list of family sites that may use the shared session
  cookie to change state and that a sign-in may return to. Like
  `/display-name`, the entry imports nothing, so a browser bundle can take it.
  Also exported from the package root. `@orangecheck/site-kit/auth` and
  `@orangecheck/auth-client` read it from here instead of keeping copies.
  Localhost counts as family only when `NODE_ENV` is `development` or `test`
  (site-kit's copy also counted an unset `NODE_ENV`), and the check reads a
  frozen list, so adding to the exported Set changes no answer.

## [2.20.0] — 2026-10-24

### Added

- `@orangecheck/auth-core/display-name`: the name rule (`nameProblem`,
  `isReservedName`, `HIDDEN_TEXT_CHARS`) on its own entry, which imports
  nothing. A page's browser bundle can apply the rule without the token
  code and jose; servers can keep importing it from the package root.

## [2.19.0] — 2026-10-24

### Added

- `nameProblem(value, max)`, `isReservedName(value)` and `HIDDEN_TEXT_CHARS`:
  the family's rule for a name other people are shown on orangecheck's pages,
  notices and email. It refuses text that can hide or reorder part of a name
  (control and format characters, bidi, zero-width marks, soft hyphens, tags,
  lone surrogates, the blank fillers) and the names orangecheck goes by
  (orangecheck, ochk, ochk.io, ochk.app), matched after NFKC, case folding and
  removing whitespace and variation selectors. me.ochk.io, ochk.io and vault
  share it instead of keeping copies.

## [2.18.0] — 2026-10-24

### Added

- `SessionPayload.merged_rh`: on a token for one audience, that audience's
  revocation handle for each account merged into this one, at most 16. A site
  matches them against handles it stored to keep a person's history after they
  merge accounts (`matchMergedUser` in `@orangecheck/me-client` 0.45.0).

### Changed

- `SessionPayload.merged_from` says it is on family sessions only; a token for
  another site carries `merged_rh` instead.

## [2.17.1] — 2026-10-24

### Docs

- `SessionPayload` declares `aud`, `iat` and `exp`, with what each means for a
  family session and for a token from the sign-in popup, and `rh` says to keep
  it with `aud` and `iat`. The types are unchanged.

## [2.17.0] — 2026-10-24

### Changed — fewer ways an outage reads as a bad token

- A key set that answers with no key this verifier can use (`{keys: []}`, or
  keys that won't import) counts as a failed fetch: the copy held stands in, and
  with none held the answer is `unavailable`. To withdraw a key, publish the set
  without it; an empty set now reads as an outage.
- The key-set fetch gives up after 10 seconds, so a host that takes the
  connection and never answers no longer holds each request for minutes.
- `checkOcToken` throws for an issuer it may not fetch from (plain http off
  localhost, or not a URL), as it does for an option it does not read. It
  answered `invalid`, which signed out every user of a misconfigured verifier.
  `verifyOcToken` and `getOcSession` still answer `null`.

## [2.16.0] — 2026-10-24

### Added — a key-set outage is not a bad token

- `checkOcToken(token, options)` answers `{ status: "valid", session }`,
  `{ status: "invalid" }`, or `{ status: "unavailable" }` when the issuer's key
  set can't be fetched and no copy younger than `jwksMaxStaleMs` is held. A
  verifier answers that as an outage (503), never as signed out. It takes
  `verifyOcToken`'s options and throws on one it does not read.
- `readOcSessionToken(headers)`: the token a request carries, as
  `getOcSession` reads it (the `oc_session` cookie, then a Bearer header).

A token whose `kid` is not in the key set held, while the latest fetch of that
set failed, is `unavailable` too: the key may have rotated in during the
outage.

`verifyOcToken` and `getOcSession` answer as before: a session, or `null`.

### Changed

- An `issuer` with a trailing slash names the same issuer: a token's `iss`
  may be either spelling.

## [2.15.0] — 2026-10-23

### Changed — a revocation handle needs one string audience

- `verifyOcToken`, `getOcSession`, `verifySessionToken` and
  `resolveSessionFromRequest` accept a token that carries `rh` only when
  `rh` is a non-empty string and `aud` is one string the verifier accepts.
  A token without `rh` verifies as before.
- `integratorRevocationCheck` answers `revoked` (and `refuses`) for claims
  whose `rh` is present but not a non-empty string (`null` included), or
  whose `aud` is not one non-empty string.

### Added

- `SessionPayload.rh`: the token's revocation handle.

## [2.14.0] — 2026-10-23

### Changed — unknown options throw

- `verifyOcToken`, `getOcSession`, `verifySessionToken`,
  `resolveSessionFromRequest`, `signSession`, `createRevocationCheck` and
  `integratorRevocationCheck` throw (or reject) a `TypeError` naming an
  option they do not read. Each reads only the keys of its options type.
- `signSession` refuses `audience` in its config: a token's audience is
  `claims.aud`.
- `verifyOcToken` and `getOcSession` accept, and do not read, the keys
  `@orangecheck/me-client` 0.38.2 and earlier pass through to them:
  `method`, `projectKey`, `meOrigin`, `revocation`, `required`,
  `requireBond`.

## [2.13.0] — 2026-10-22

### Changed — neither a clock set back nor a paused host stretches a revocation list

- A server whose wall clock stepped back kept a copy of the list past its minute,
  waited longer before asking a failing host again, and held an old list as if it
  were younger. How long a copy has been held and how long since a failed fetch
  are now the longer of the time on a monotonic clock (`performance.now()`) and on
  the wall clock, so a pause the monotonic clock sleeps through (a suspended host,
  a restored snapshot) can't stretch them either. A list's age by its own `at` is
  the longer of its age at fetch grown on the monotonic clock and its age by the
  wall clock now, and a list dated ahead of this clock is judged on every check, so
  it can vouch again once the clock catches up.

### Added

- `clock` option on `createRevocationCheck` and `integratorRevocationCheck`: the
  monotonic clock, for tests. When only `now` is given, it is used for both.
- `SAFE_METHODS`: the methods that go on while the list can't vouch for a
  session (`GET`, `HEAD`, `OPTIONS`), shared with me-client.

## [2.12.0] — 2026-10-22

### Changed — integrator revocation by per-audience handle

- `integratorRevocationCheck` looks a token's `rh` (its revocation handle for its
  own audience, minted by ochk.io) up in me.ochk.io's list of ended handles for
  that audience, one list per audience the site's tokens carry. A token without
  `rh` is checked by its signature alone. The request is signed over method,
  path, project key and audience (`${t}.GET /api/integrator/revocations?project_key=…&aud=…`),
  and the token's `aud` is sent exactly as minted.
- The list's age is measured from its own `at`; one dated more than 60 s ahead,
  or older than 10 minutes, cannot vouch for a write.
- `RevocationCheckOptions.staleFrom` (`"fetch"` default, or `"at"`) and `skewMs`;
  `RevocableClaims.rh` and `aud`; a list's optional `handles` map.

### Deprecated

- 2.11.0's integrator check. Use 2.12.0 or later: me.ochk.io answers the 2.11.0
  request with an empty list.

## [2.11.0] — 2026-10-22

### Added — integrators honour sign-out everywhere

- `integratorRevocationCheck(opts?)`: for an integrator's server, the account
  cutoffs (sign out everywhere, a passkey removed, an account deleted) from
  me.ochk.io's `/api/integrator/revocations`, fetched once a minute with a
  request signed by the project secret (`OC_PROJECT_KEY`, `OC_SIGNING_SECRET`).
  Null when either is unset. Same `status` / `refuses` policy as the family check.
- `RevocationCheckOptions.headers`: request headers for each feed fetch, in place
  of the Bearer feed token.

## [2.10.0] — 2026-10-22

### Added — key rotation

- `verifyOcToken` reads `status: "retired"` and `retired_at` (unix seconds) on a
  JWKS key, as ochk.io publishes them after a rotation. A retired key verifies
  only tokens whose `iat` is before its `retired_at`; one with no readable
  `retired_at`, or a token with no `iat`, verifies nothing.
- `VerifyOcOptions.jwksMaxStaleMs` (default 6 hours): how long the last fetched
  JWKS stands in while the key list can't be fetched. Past it, verification
  fails closed.

### Changed

- A token with an unknown `kid` refetches the key list (still at most once a
  minute per issuer) without dropping the cached one, so the keys already held
  keep answering if that refetch fails.

### Deprecated

- `SessionPayload.home_federation`. The auth host no longer sets it, so it is always
  null. Where a person's sats sit is me.ochk.io's to say, per federation
  (`/api/me/balance`).

### Changed

- `SessionPayload.signing_method` is documented as what it now is: derived by the auth
  host from the account's verified linked identities, and only about who holds
  the signing key. No one can set it.

## [2.9.0] — 2026-10-20

### Added — session revocation

- `createRevocationCheck(opts)` and the process-wide `familyRevocationCheck()`:
  check a verified session against the auth host's list of ended sessions
  (`<issuer>/api/auth/revocations`, authenticated with the site's
  `OC_REVOCATION_FEED_TOKEN`). The list is fetched at most once per `ttlMs`
  (60 s) per process. `status(payload)` answers `live`, `revoked` or
  `unverified`; `refuses(payload, method)` refuses a revoked session always,
  and an unverified one only for an unsafe method, so reads keep working when
  the host cannot be reached and writes stop once the copy is 10 minutes old.
- `revocationKey(kind, value)`: the hashed key the list is written under.
  Entries name a token by `jti`, or an account by `sub` with a cutoff (every
  token issued before it is ended); neither appears in the clear.

## [2.8.0] — 2026-10-16

### Added — the bond claim

- `SessionPayload.oc_bond` and `BondClaim`: when an account is backed by a
  bond (oc-attest-protocol `BOND.md`), its tokens carry floors (sats, days),
  when the coin was last checked, and a nullifier for the token's audience.
  Never the coin.
- `readBondClaim(payload)` and `bondMeets(payload, { minSats, minDays,
  maxAgeSecs })` to read and require it.

## [2.7.0] — 2026-09-22

### Added

- **Audience-bound session tokens.** `signSession` takes an optional `aud`
  claim, and `verifySessionToken` / `verifyOcToken` / `getOcSession` take an
  `audience` option (`AudienceRule`): a string or list for a relying party's
  own origin, or `"*"` to accept any.
- `audienceSatisfied(aud, rule)` — the pure check, exported.

### Changed

- With no `audience` given, a verifier accepts only tokens that carry **no**
  `aud` — a family session. No token minted before this release carries one,
  so existing sessions verify exactly as before. A relying party outside the
  family should pass its own origin as `audience`.

## [2.6.0] — 2026-09-14

### Added

- `_resetJwksCachesForTests()` — the JWKS caches are process-wide by design,
  which made any test touching verification order-dependent. Test-only.

### Fixed

- **An unrecognised `kid` could force an unbounded number of JWKS refetches.**
  A miss dropped the cache and fetched again, so a stream of tokens carrying
  random kids turned every integrator's server into a refetch amplifier pointed
  at the auth host, and put a network round-trip in front of each rejection.
  `inflight` only collapses CONCURRENT fetches; sequential requests each got
  their own. The forced refresh is now at most once a minute per issuer — far
  below any real rotation window, so a genuinely new key is still picked up on
  the first miss.

### Tests

- First coverage of the JWKS path. `verifyOcToken` / `getOcSession` are what
  me-client re-exports and what a third party installs, and no existing test
  reached them: kid required (no try-every-key fallback), plaintext issuer
  refused, issuer mismatch rejected, JWKS outage returns null rather than
  throwing, rotation still picked up, and the refetch bound above.

## [2.5.0] — 2026-06-11 · per-tab session resolution

Adds the server half of per-tab account pinning (multi-account: one
browser signed into N roster accounts, each tab operating as its own
one):

- `TAB_SESSION_HEADER` (`x-oc-tab-session`) — the header carrying a
  tab-pinned session JWT. The value is a full session token, a
  _credential_ verified exactly like the cookie token — never a bare
  account selector the server would have to trust.
- `resolveSessionFromRequest(headers, cfg)` — the per-tab choke point
  every consumer's `readJwtSession` should delegate to. Tab header
  first (**fail-closed**: present-but-invalid resolves to
  `{ok:false, reason:'tab_invalid'}` rather than silently executing as
  the cookie's account), then every `oc_session` cookie in the jar.
  Accepts Node-style header bags and Web `Headers`. Crypto-only; never
  throws.
- `readAllSessionCookies(cookieHeader)` — every `oc_session` value in
  a `Cookie:` header (multiple same-name cookies are legitimate);
  extracted from the consumer-template generator so sites stop
  hand-rolling it.
- `ResolveSessionResult` / `IncomingRequestHeaders` types.

## [2.4.0] — 2026-05-18 · display_identity claim

Adds the `display_identity` session claim — the identity a user has
chosen to surface as their account-badge label across every `.ochk.io`
subdomain. Same posture as `name` / `npub`: baked into the JWT so the
choice renders consistently with no network round-trip.

- `SessionPayload.display_identity?: DisplayIdentity | null` — `{ kind, value }`
  where `kind ∈ {did,btc,email,nostr}` and `value` is the full renderable
  value. Only the _promoted_ identity's value is ever carried, so an
  unrelated email never enters the token.
- New exports: `DisplayIdentity`, `DisplayIdentityKind`,
  `DISPLAY_IDENTITY_KINDS`, and `resolveDisplayIdentity(payload)` — a
  total resolver that returns the claim when well-formed and falls back
  to `{ kind:'did', value:did_oc }` otherwise (pre-field tokens, malformed
  claims). Both `<OcAccountMenu>` and integrators building their own chip
  should resolve through this.
- `signSession()` accepts `display_identity` in its claims argument.

Additive — older tokens (no claim) resolve cleanly to the did.

## [2.2.0] — 2026-05-14 · Inline sudo-mode claim

Additive · all v2.1.x consumers keep working unchanged. New
`sudo_at?: number` claim on `SessionPayload` carries the unix seconds
when the user last successfully re-authenticated inline (email-OTP for
email-primary identities, BIP-322 challenge for btc-primary identities)
on the auth host. New `verifySudoClaim(payload, { max_age_secs })`
helper · same shape as `verifyStepUpClaim`, independent claim.

Replaces the hostile 1-hour fresh-`iat` gate previously protecting
WebAuthn key registration. Sensitive auth-graph-mutating operations
(register an additional hardware key, revoke a key, link a new
identity, generate recovery codes, change recovery method) gate on
`verifySudoClaim` instead of a full re-signin.

`signSession` claims now accept `sudo_at?: number` (omitted when
undefined, so existing tokens mint byte-identically).

## [2.1.0] — 2026-05-14 · WebAuthn step-up surface

Additive · all v2.0.0 consumers continue to verify unchanged. New
`step_up_at?: number` claim on `SessionPayload` carries the unix
seconds when the user last completed a WebAuthn assertion on the
auth host. New `verifyStepUpClaim(payload, { max_age_secs })` helper
is the single source of truth for "is this session freshly stepped
up." Consumer subdomains gating sensitive actions (spend > 1M sats,
project_key creation, etc.) read it both before triggering
`useStepUpAuth()` and again server-side after JWT verify.

`signSession`'s `claims` type now accepts `merged_from?: string[]`
and `step_up_at?: number`. Existing callers that don't pass them
mint identical tokens (omitted claims, not null-valued).

See `AUTH-OVERVIEW.md` §6 + `AUTH-TODO.md` §6 in the workspace for
the broader design. The matching auth-client hooks ship in
`@orangecheck/auth-client` v2.1.0 the same day.

## [0.1.0] — Initial published state

Initial public release. Crypto-only Ed25519 JWT verify + cookie helpers — the consumer half of the ochk.io auth host stack.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-auth-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-auth-core-v0.1.0
