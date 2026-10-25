# Changelog

All notable changes to the **`orangecheck`** Python package. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [3.9.0] — 2026-10-25

### Changed

- `verify_abandonment` verifies an abandonment whose `reason` is any string:
  empty, longer than 280 UTF-8 bytes, or over several lines. `verify_outcome`
  verifies an outcome whose `evidence.result` or `evidence.witness` is empty
  or long, and one whose witness spans lines (OC Pledge SPEC §4.1, §5.1,
  §11.13). A value that is not a string, or a line feed in `evidence.result`,
  is `E_*_MALFORMED`, returned rather than raised; so is an `abandoned_at`,
  `resolved_at` or `dispute_window_ends_at` that is not a string. The
  producers keep the signer's limits, and refuse a reason that is not a string
  or holds a lone surrogate. New: `read_outcome_input` and
  `read_abandonment_input` (the verifier's rules) and `utf8_bytes`.
- Canonical bytes encode a lone surrogate as U+FFFD, as `@orangecheck/pledge-core`
  does (SPEC §0), so both SDKs compute the same id for one. As pledge-core
  3.4.0, held to vectors `v34`–`v41`.

## [3.8.0] — 2026-10-25

### Added

- `is_did_oc(value)` and `normalize_email(value)`: what a did:oc is (`did:oc:`
  and 32 lowercase hex digits, nothing before or after it, so a trailing
  newline is refused where a `$` regex would take it), and the form an email
  is stored and looked up in (trimmed of exactly the characters JavaScript's
  `trim` removes, then lower-cased). As `@orangecheck/auth-core/identifiers`
  2.22.0, held to the same vectors (`auth-core/test-vectors/identifiers.json`).

### Changed

- `connect_provision` checks the returned did with `is_did_oc`.

## [3.7.0] — 2026-10-24

### Added

- `safe_return_path(value, fallback="/")`: where to send someone back to after
  they sign in or prove it is them again. A path on your own site comes back
  unchanged; anything a browser would take elsewhere (`//evil.com`,
  `/\\evil.com`, a scheme), a backslash anywhere, C0 and C1 control
  characters, a lone surrogate (which a JSON body can carry), a percent that
  does not decode, dot segments (plain or
  percent-encoded) and anything over 2048 UTF-16 units answer `fallback`. As
  `@orangecheck/me-client` 0.51.0's `safeReturnPath`, held to the same vectors
  (`me-client/test-vectors/return-path.json`).

### Changed

- This changelog ships in the wheel (`orangecheck/CHANGELOG.md`) and the sdist,
  and PyPI links it as "Changelog".

## [3.6.0] — 2026-10-24

### Changed

- `exchange_native_code(code, code_verifier, redirect_uri, audience, *, project_key, issuer=, me_origin=, revocations=, require_bond=, timeout=)`
  checks the traded token as `check_oc_session` checks a request's, so
  `valid` means the same thing on both paths: not ended on `revocations` (the
  trade counts as a write: a list that can't be read answers `unavailable`
  `revocations_unavailable`), and the account meets the project's "who can
  sign in" rule, read and cached as `check_sign_in_rule` reads it (`invalid`
  `bond_required`, with `need`, `have` and `back_url` on `NativeRefusal`;
  `unavailable` `bond_policy_unavailable`; `invalid` `unknown_project_key`).
  New refusal: `session_ended`.
- `project_key` is keyword-only: it is your own key, from your config. The
  3.5.0 call, with the key fourth, raises `TypeError`.

As `@orangecheck/me-client` 0.50.0's `exchangeNativeCode`, held to the
shared vectors (`exchange_native`).

## [3.5.0] — 2026-10-24

### Added

- `exchange_native_code(code, code_verifier, redirect_uri, project_key, audience, *, issuer=, timeout=)`
  → `NativeSignIn` or `NativeRefusal`: the server's half of native sign-in,
  for an app on the person's own device. It trades the one-time code the app's
  loopback listener received at `POST <issuer>/api/auth/native/token`, then
  verifies the token for your `audience` as `verify_session` does. Only a
  mistake in the call raises. As `@orangecheck/me-client` 0.49.0's
  `exchangeNativeCode`, held to the shared vectors (`exchange_native`).

## [3.4.0] — 2026-10-24

### Added

- `Session.merged_rh`, `merged_handles(session)` and
  `match_merged_user(session, lookup)` → `MergedUserMatch`: after an account
  merge, a sign-in token names your site's handle for each account merged in.
  Look them up in the handles you stored: `"none"` (a new user), `"one"`
  (attach this `did_oc` to that user) or `"conflict"` (two of your users: pick
  neither). As `@orangecheck/me-client` 0.45.0's `matchMergedUser`, held to
  the shared vectors (`merged`).

## [3.3.1] — 2026-10-24

### Changed

- `RevocationList` reads the `tokens` of its audience's list and answers
  `"revoked"` for a token whose own `jti` is there, as
  `@orangecheck/auth-core`'s `integratorRevocationCheck` does, so a token ended
  with `revoke_token` stops passing once me.ochk.io lists it. `status()` and
  `status_for()` take the jti (shared vectors "a token ended on its own").

## [3.3.0] — 2026-10-24

### Added

- `check_sign_in_rule(session, project_key=…)`: your project's "who can sign
  in" rule for a session you verified yourself, as `@orangecheck/me-client`
  0.43.0's `checkSignInRule`. One `SignInPolicy` per project is kept, so the
  rule is read once a minute, and its stand-in and refusal rules hold. It
  answers a `SessionCheck`: 200, 403 `bond_required` with `need`, `have` and
  `back_url`, 503 `bond_policy_unavailable`, or 500 `unknown_project_key`.
  Pass `policy=` to use a `SignInPolicy` you already warm, or `require_bond=`
  to set the floor yourself (nothing is read). It takes only the `Session`
  that `verify_session` or `check_oc_session` returned, and raises TypeError
  for a dict of claims or a Session built any other way. Both SDKs are held to
  `me-client/test-vectors/server-helpers.json` (`sign_in_rule`).

## [3.2.1] — 2026-10-24

### Fixed

- A key set that answers with no Ed25519 key counts as a failed fetch, as in
  `@orangecheck/auth-core` 2.17.0: the copy held stands in, and with none held
  `check_oc_session` answers 503 `key_set_unavailable` (shared vector "a key set
  with no key the verifier can use"). It answered 401, signing out everyone. To
  withdraw a key, the host publishes the set without it.

## [3.2.0] — 2026-10-24

### Added

- `check_oc_session(token, audience, …)`: `verify_session`'s arguments,
  answered as a `SessionCheck` with the HTTP status and JSON body
  `@orangecheck/me-client`'s adapters send: 200 with `session`; 401
  `unauthenticated` (no token, a bad one, or one the person ended) or
  `no_session_handle`; 403 `bond_required` with `need`, `have` and `back_url`;
  503 `revocations_unavailable` or `bond_policy_unavailable`; 500
  `unknown_project_key`. Both SDKs are held to
  `me-client/test-vectors/server-helpers.json`, and both answer 503
  `key_set_unavailable` while the key set can't be read (me-client 0.41.0).
- `spend_once(jti, exp, store)`, `JtiStore` and `MemoryJtiStore`: a token's
  `jti` starts one session. True the first time, False for a repeat or a token
  that has expired. The store is yours, shared by every server; a store that
  fails raises. `spend_once_async` takes a store whose `add` is a coroutine.
- `revoke_token(token, issuer=, timeout=)`: ends a token, or up to eight, at
  the auth host (`POST <issuer>/api/auth/revoke`). Returns `TokensRevoked` or
  `RevokeRefusal` (`rate_limited`, `bad_request`, `unavailable`), never raises
  on an outage.
- `warm_session(…, issuer=, jwks=)`, as `verify_session` takes them. With
  `jwks` given nothing is fetched and `keys` reads `"kept"`.

### Changed

- `issuer=` on `verify_session` also names where the key set is fetched:
  `<issuer>/.well-known/jwks.json`, as `@orangecheck/me-client` fetches it.
  Before, the key set was always ochk.io's. The issuer must be one origin
  (https, or http on localhost only; no path, query, fragment or user name),
  or it raises `ValueError`; a trailing slash names the same issuer. A `jwks=`
  given explicitly wins, and nothing is fetched.
- A token whose `kid` is not in the key set held, while the latest fetch of
  that set failed, raises `InvalidSession("key_set_unavailable")`: the key may
  have rotated in during the outage. Once a fetch succeeds it is `unknown_key`
  again. The same for webhooks.
- `RevocationList(project_key, signing_secret)` raises `ValueError` unless each
  is one non-empty string. An empty one signs requests me.ochk.io refuses, so
  every write would answer `revocations_unavailable` for as long as the
  process runs.

## [3.1.0] — 2026-10-23

### Changed

- `verify_session` accepts a token that carries `rh` only when `rh` is a
  non-empty string (`InvalidSession("claims")` otherwise, with
  `require_handle=False`) and `aud` is one string (`InvalidSession("audience")`
  otherwise). A token without `rh` verifies as before.
- `RevocationList.status(rh, aud, iat)` answers `"revoked"` for a handle that
  is not a non-empty string, or one given without a non-empty string `aud`.
- The same as `@orangecheck/auth-core` 2.15.0 and `@orangecheck/me-client`
  0.40.1, held to `me-client/test-vectors/integrator.json`.

### Added

- `RevocationList.status_for(claims)`: the same answer from a token's claims,
  telling a missing `rh` (`"live"`) from `"rh": null` (`"revoked"`), as
  auth-core's `integratorRevocationCheck` does. `verify_session` uses it.
- `Session.rh`: the token's revocation handle.

## [3.0.0] — 2026-10-23

### Changed

- **Breaking, by design.** `verify_session` refuses a token with no `rh` with
  `InvalidSession("no_session_handle")`. `rh` is the token's handle on your
  project's list of ended sessions, so without it sign out everywhere can't end
  the session, and the quickstart asked every site to refuse such a token itself.
  Now the SDK does. Every token from the ochk.app sign-in popup carries one, so a
  site that signs people in that way sees no change. `require_handle=False`
  accepts such a token, which sign out everywhere then does not end;
  `require_handle` must be `True` or `False`. The same as
  `@orangecheck/me-client` 0.40.0 (`requireHandle`), held to
  `me-client/test-vectors/integrator.json`, where every token now carries `rh`
  and two that don't are refused.
- Popup tokens have carried `rh` since 2026-10-22 and live up to 30 days. A site
  that keeps the popup token and verifies it again on later requests, rather
  than starting its own session, signs out anyone still holding an older one,
  once, until about 2026-11-21; they sign in again.

## [2.13.0] — 2026-10-23

### Added

- OC Connect for a site that keeps its own login: `connect_provision`,
  `connect_claim_link` and `connect_delete`. Each takes the Connect API key and
  your user id, and returns `ConnectAccount`, `ConnectClaimLink` or
  `ConnectDeleted`, or a `ConnectRefusal(reason, status)`. A refusal or an outage
  is a result, never an exception, and a call gives up after `timeout` (5 s, at
  most 30 s). Only a mistake in the call raises: an argument it does not take, a
  missing key or user id, `email_verified` without `email`, or `consent=False`
  (an unticked box means no call at all). Every call goes to `https://ochk.io`
  and nowhere else; a redirect is an error. A claim link anywhere but
  `https://ochk.app` is `unavailable`. A user id is counted in UTF-16 code units,
  as ochk.io counts it.
- `CONNECT_CONSENT_LABEL` and `CONNECT_CONSENT_BLURB`: the words for an optional
  "also make me an orangecheck account" box, the same as `@orangecheck/me-client`
  0.39.0. Both SDKs are held to `me-client/test-vectors/connect.json`.

## [2.12.0] — 2026-10-23

### Changed

- `pledge.create_pledge` needs no signer from the principal on the agent path:
  with `via_delegation`, `swearer_signer` may be left out, and the swearer is the
  `swearer` address. One given anyway must be for `swearer`. Without
  `via_delegation`, `swearer_signer` is required and must be for `swearer`. Both
  are refused with `E_PLEDGE_MALFORMED` before anything is signed; `verify_pledge`
  already refused such a direct envelope (SPEC §3.6). The agent is checked against
  `swearer` rather than against the signer. As `@orangecheck/pledge-core` 3.3.0.

## [2.11.1] — 2026-10-22

### Fixed

- A server whose wall clock stepped back let the last sign-in rule stand past ten
  minutes, kept a revocation list or key set past its minute or hour, waited longer
  before asking again after a failure, and held an old list as if it were younger.
  How long a copy has been held, and how long since a failed read, are now the
  longer of the time on `time.monotonic()` and on the wall clock, so neither a
  clock set back nor a paused host (a suspended machine, a restored snapshot)
  stretches them. A list's age by its own `at` is the longer of its age at fetch
  grown on the monotonic clock and its age by the wall clock now, and a list dated
  ahead of this clock is judged on every check. As `@orangecheck/auth-core` 2.13.0
  and `@orangecheck/me-client` 0.38.1.
- After a failed read of the sign-in rule, the ten-second wait counts from the
  failure, not from when the read began, so a slow failure is not retried early.

## [2.11.0] — 2026-10-22

### Added

- `warm_session` returns a `WarmResult` instead of `None`: for the key set, the
  sign-in rule and each audience's list, a `WarmPart` whose `state` is
  `"fetched"`, `"kept"` or `"failed"`, with a `reason` when it failed (`HTTP 403
  domain_unverified`, `unknown_project_key`, a list older than ten minutes by its
  own clock). `result.ok` and `result.failures()` make a failing warm loop easy to
  log. It still never raises.

## [2.10.1] — 2026-10-22

### Fixed

- `SignInPolicy`: an answer that does not say the rule (not `ok: true`, no
  `require_bond`, or a floor that is not a whole number of at least 0) counts as
  unreadable, not as "no requirement". While the rule can't be read, the last one
  read stands for ten minutes, then sign-in is refused (`bond_policy_unavailable`).
- `RevocationList` takes only the list shape `@orangecheck/auth-core` takes
  (`v` 1, a `tokens` array, an `accounts` object); any other answer leaves the
  status `unverified`. Cutoffs that are not finite numbers are skipped.
- `read_bond_claim` and `bond_meets` decide as auth-core does: finite floors, the
  whole nullifier, `v` that is not a bool, and the claim's age counted from its own
  `checked_at`.
- A key set that answers with no keys is fetched again on the hour, not on every call.
- After a fork, the child process gets fresh locks, so a fetch in flight in the
  parent can't leave the child waiting forever.
- `warm_session` never raises, whatever an answer holds.

## [2.10.0] — 2026-10-22

### Added

- `warm_session(audience, *, revocations=, policy=)` fetches what `verify_session`
  with the same arguments would otherwise fetch inside a request: ochk.io's key
  set, the project's sign-in requirement and each audience's revocation list, each
  only when its copy is due. Call it at startup and every ten seconds from a
  background thread, in each process. It never raises.

### Changed

- After a failed key-set refresh, the session and webhook key sets wait ten
  seconds before trying again, as `RevocationList` and `SignInPolicy` already do.
  Until then requests use the keys already held (for up to six hours, as before)
  instead of each waiting on a fetch of their own.

## [2.9.0] — 2026-10-22

### Added — who may sign in, at parity with me-client

- `SignInPolicy(project_key)`: your project's "who can sign in" requirement, set on
  ochk.app, read from me.ochk.io's `/api/integrator/<key>/sign-in` and held a minute,
  as `withOcAuth({ projectKey })` reads it. While it can't be read the last one read
  stands; with none read yet, sign-in is refused (`bond_policy_unavailable`). A key
  that names no project is refused (`unknown_project_key`).
- `verify_session(..., policy=, require_bond=)`: raises `BondRequired` (an
  `InvalidSession`, reason `bond_required`, with `need`, `have` and `back_url`) when
  the account's coin backing doesn't meet it. `require_bond` in code wins over the
  project's.
- `bond_meets(claims, min_sats=, min_days=, max_age_secs=)` and `read_bond_claim`,
  as auth-core's `bondMeets` / `readBondClaim`, held to shared vectors (`bond`).

## [2.8.0] — 2026-10-22

### Changed — revocation by per-audience handle

As `@orangecheck/auth-core` 2.12.0. A sign-in token carries `rh`, its revocation
handle for its own audience; `RevocationList` looks it up in me.ochk.io's list of
ended handles for that audience, one list per audience, fetched at most once a
minute with a request signed over method, path and audience
(`<t>.GET /api/integrator/revocations?project_key=…&aud=…`). The handles name
nobody, and two sites' handles for one person never match.
- `RevocationList.status(rh, aud, iat)` replaces `status(sub, iat)`. A token
  without `rh` is `"live"`: checked by its signature alone.
- A list's age is measured from its own `at`; one older than ten minutes, or dated
  more than 60 s ahead, cannot vouch for a write.
- The first failed fetch logs one warning (`orangecheck` logger).

### Deprecated

- 2.7.0. me.ochk.io answers its request with an empty list, which it reads as
  "nothing ended". Use 2.8.0 or later.

## [2.7.0] — 2026-10-22

### Added — refuse a session the person ended everywhere

As `@orangecheck/auth-core`'s `integratorRevocationCheck`. `RevocationList(project_key,
signing_secret)` reads the account cutoffs (sign out everywhere, a passkey removed, an
account deleted) from me.ochk.io's `/api/integrator/revocations` at most once a minute,
signed with `X-OC-Signature` over the query. `verify_session(..., revocations=, method=)`
raises `SessionEnded` (an `InvalidSession`, reason `ended`) for a session it ends; while
no copy younger than ten minutes can be read, a read goes on and anything else is
refused (`revocations_unavailable`). `RevocationList.status(sub, iat)` answers for a
site whose own session replaced the token. `revocation_key(kind, value)` derives the
list's keys. Held to me-client's vectors (`revocation`).

## [2.6.0] — 2026-10-22

### Changed — key rotation and outages, as `@orangecheck/auth-core` 2.10.0

- `verify_session` reads `status: "retired"` and `retired_at` on a key in the
  set. A retired key verifies only tokens whose `iat` is before its
  `retired_at`; anything else is refused with reason `retired_key`. The
  shared integrator vectors carry both cases, so the Node and Python SDKs
  agree.
- A fetched key set stands in through a failed refresh for at most six hours.
  Past that, `verify_session` and `verify_webhook` refuse with
  `key_set_unavailable` until a fetch succeeds.

## [2.5.2] — 2026-10-22

### Fixed — an agent pledge's agent is never its swearer

As `@orangecheck/pledge-core` 3.2.2 (SPEC §7.3). `verify_pledge` refuses an
envelope whose `agent_address` equals `swearer.address` (`E_PLEDGE_MALFORMED`).
Vector `v33`.

## [2.5.1] — 2026-10-22

### Fixed — a signed outcome dated after expires_at comes too late

As `@orangecheck/pledge-core` 3.2.1 (SPEC §3.4.2, §4.4). `verify_outcome`, given
the pledge, refuses a signed outcome dated at or after `expires_at`, and
`classify_state` leaves it out. Deterministic outcomes are exempt.

## [2.5.0] — 2026-10-22

### Fixed — legacy signatures, as @orangecheck/bip322 verifies them

- `verify_bip322_signature` verifies a 65-byte legacy BIP-137 `signmessage`
  signature on every address it can stand for: P2PKH (compressed or
  uncompressed key), P2SH-P2WPKH, P2WPKH and P2TR, under any header flag
  (27–42). Before, it refused every legacy signature, P2PKH included. The
  signature's bytes decide: 65 bytes is BIP-137, anything else BIP-322
  simple. It now agrees with `@orangecheck/bip322` on the bip322-js corpus
  that package is held to and on BIP-137 cases across every header range
  and recovery-id parity.
- BIP-137 recovers the key with integer arithmetic over public values, and
  `cryptography` checks the signature against it. RIPEMD-160 comes from
  hashlib, or a pure-Python fallback where hashlib lacks it.

### Changed — one spelling per address

- `verify_bip322_signature` refuses a bech32 address that is not lowercase,
  as `@orangecheck/bip322` does, so one key has one address that verifies.

### Added

- `normalize_address(text)`: the canonical spelling of an address a person
  typed or scanned (whitespace dropped, all-capitals bech32 lowercased, base58
  unchanged), or None. Key and compare addresses in this form.
- `decode_address(address)` returns its type, network and program, or None.
  Bonds read addresses through it.

## [2.4.0] — 2026-10-22

### Changed — an agent pledge is checked as of the time of verification

As `@orangecheck/pledge-core` 3.2.0 (SPEC §7.3, §11.12, §4.4).

- `verify_pledge` takes `now` (default: the current time). The delegation
  lookup is asked as of `now`, not as of `sworn_at`, and the delegation must
  still be unexpired then. `VerifyOk.as_of` is `{"basis": "now", "now": …}`.
- `classify_state` leaves out an outcome, or a contradicting one, whose
  `resolved_at` is later than `now`.

### Added

- `verify_pledge_as_of_sworn_at` checks a past pledge as of its own
  `sworn_at`, for a history. `as_of` is
  `{"basis": "sworn_at", "sworn_at": …, "anchored": False}`.

## [2.3.1] — 2026-10-21

### Fixed — signatures from wallets that follow the finalized BIP-322

- `verify_bip322_signature` accepts a simple signature with the `smp` prefix
  the finalized BIP-322 requires of signers, as well as without it. Before,
  every prefixed signature returned `False`. A `ful` or `pof` signature is not
  supported and returns `False`, as in `@orangecheck/bip322` 1.1.
- Tests run the BIP's official vectors (bitcoin/bips `d77863fb9e9b`), the same
  files the TypeScript package uses.

## [2.3.0] — 2026-10-20

For a site that signs people in with ochk.app and runs a Python backend.

### Added

- `verify_session(token, audience)` verifies a token from the sign-in popup
  against `https://ochk.io/.well-known/jwks.json` (cached for an hour, kept
  through an outage) and returns a `Session` with `did_oc`, `sub`, `jti`,
  `exp` and any `oc_bond`. The audience is the exact origin of the page that
  opened the popup; a token for any other origin, or with no `aud`, raises
  `InvalidSession` with a one-word `reason`.
- `sign_event(secret, body)` builds the `X-OC-Signature` header for
  `/api/integrator/event`: HMAC-SHA256 keyed by the secret's text over
  `f"{t}.{body}"`.
- `verify_webhook(headers, body)` checks a delivery's Ed25519 signature
  against `https://me.ochk.io/api/dev-jwks` and returns the parsed event, or
  raises `InvalidWebhook`.
- These are held to `me-client/test-vectors/integrator.json`, the same vectors
  `@orangecheck/me-client` is tested against.

### Changed

- `cryptography` (41 or later) is now a dependency, for Ed25519.

### Fixed

- `build_canonical_message` and `format_identities` accept the
  `IdentityBinding` exported as `orangecheck.IdentityBinding`. They took only
  the canonical module's own class or a dict, so the documented example raised
  `TypeError`.

## [2.2.0] — 2026-10-16

Matches `@orangecheck/sdk` 1.13.0 and the spec's regenerated `tv24`–`tv27`.

### Changed (security)

- `bond_nullifier(key, audience, outpoint)` takes the registry's secret key
  (at least 32 bytes) and returns HMAC-SHA256. 2.1.0's unkeyed hash could be
  inverted by hashing every unspent output, which found the coin.
- The signed acknowledgement reads "I back this subject with this coin. It
  stays in my wallet."

### Added

- `verify_bond_signature` refuses a signing window longer than an hour
  (`bond_window_too_long`; `max_window_seconds`, `BOND_MAX_WINDOW_SECONDS`).

### Fixed

- A bond's address is checked the way `@orangecheck/bip322` checks it,
  checksum included, so a mistyped address is `bond_malformed` here as in
  TypeScript rather than `sig_invalid`.

## [2.1.0] — 2026-10-16

### Added — bonds (oc-attest-protocol `BOND.md`)

- `BondFields`, `build_bond_message`, `parse_bond_message`, `bond_id`,
  `bond_nullifier`, `bond_floors`, `verify_bond_signature`: the same message,
  id, nullifier and floors as `@orangecheck/sdk` 1.12, held to the spec's
  vectors `tv24`–`tv28`. Bond signatures verify through the `[verify]` extra,
  an implementation independent of the TypeScript one.

## [2.0.0] — 2026-10-08

`orangecheck.pledge` now matches `@orangecheck/pledge-core` 3.1 on who may
resolve, abandon or delegate a pledge. Calls that used to pass without that
context now fail closed, hence the major version, as in pledge-core 2.0 and 3.0.

### Changed

- `verify_outcome` takes `pledge=` (the canonical input or the envelope dict)
  and checks the outcome names that pledge and comes from the resolver SPEC §1
  names for its mechanism. Without `pledge` it returns
  `E_OUTCOME_RESOLVER_UNAUTHORIZED` unless `skip_resolver_authorization=True`.
- `verify_abandonment` takes `pledge=` and checks the pledge id, that the
  swearer signed, and that it is not dated before `sworn_at`. Without `pledge`
  it returns `E_ABANDONMENT_BAD_SIG` unless `skip_pledge_binding=True`.
- `verify_pledge` refuses an agent pledge (`via_delegation`) with
  `E_DELEGATION_NOT_FOUND` when no `delegation_lookup` is given, unless
  `skip_delegation_verification=True`.
- `classify_state` ignores an outcome or abandonment that names another
  pledge, and an abandonment not signed by the swearer.

### Added

- `VerifyOk.recompute_required`: true for an unsigned deterministic outcome,
  which the caller must re-evaluate against public state (SPEC §11.4).
