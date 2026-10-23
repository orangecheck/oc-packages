# Changelog

All notable changes to the **`orangecheck`** Python package. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

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
