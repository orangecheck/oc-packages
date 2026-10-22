# Changelog

All notable changes to the **`orangecheck`** Python package. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

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
