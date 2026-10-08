# Changelog

All notable changes to the **`orangecheck`** Python package. Follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

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
