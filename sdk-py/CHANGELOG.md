# Changelog

All notable changes to the **`orangecheck`** Python package. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

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
