# Changelog

All notable changes to **`@orangecheck/agent-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [Unreleased]

- _(no pending changes)_

## [1.1.0] — reconstructed 2026-09-04

**Reconstructed from the published artifacts.** 1.0.0 and 1.1.0 shipped to npm
with no CHANGELOG entry, and the gap had a cost: six `agent-*` adapters still
pin `^0.1.0` or `^0.3.0`, and a caret on a `0.x` version locks the MINOR, so
none of them can resolve 1.x. Nobody bumping them could tell what would break.
The entries below were derived by unpacking 0.1.0, 1.0.0 and 1.1.0 from npm and
diffing `dist/index.d.ts` and `dist/types.d.ts`, so they describe the shipped
surface rather than anyone's recollection.

### Added

- **Federation principal — M-of-N guardian authority.** `FederationPrincipal`
  (`alg: 'federation'`) carrying a `FederationDescriptor` (`kind:
  'agent-federation'`, a `threshold` string, and a `guardians` array of
  `FederationGuardian`), plus `FederationSignature` (`alg:
  'federation-bip322'`) holding one `{ guardian_address, value }` per signing
  guardian. A delegation can now be authorised by a threshold of guardians
  rather than a single address.

## [1.0.0] — reconstructed 2026-09-04

### Changed — BREAKING

- **`scopes` is now optional: `scopes?: string[]`,** alongside a new
  `scopes_encrypted?: ScopesEncryptedEnvelope`. A delegation may carry its
  scope list sealed instead of in the clear, so the plaintext field is absent
  in that case.

  **This is the change that breaks consumers, and the fix is not a `?? []`.**
  An adapter that maps over `delegation.scopes` to check a scope is within the
  grant gets `undefined` and must **refuse** — absent scopes mean "encrypted,
  and you did not supply a key", never "no restrictions". `oc-packages/agent-mcp`
  has exactly this shape at `src/index.ts`, and treating an absent list as an
  empty or universal grant would turn an authorisation check into a no-op.

  To read sealed scopes, pass `decryptScopesWith: { device_id, secretKey }` to
  `verifyDelegation` / `verifyAction` / `verifySubdelegation`.

- **`VerifyDelegationResult.delegation` is a `ChainLink`,** not a
  `DelegationEnvelope` — it may now be one link in a subdelegation chain.

### Added

- **Subdelegation.** `SubdelegationEnvelope`, `verifySubdelegation`,
  `SubdelegationCanonicalInput`, `computeSubdelegationId`,
  `subdelegationCanonicalBytes` / `subdelegationCanonicalMessage`, and
  `ChainLink`. `verifyDelegation` / `verifyAction` accept
  `subdelegationChain?: SubdelegationEnvelope[]` and `maxChainDepth?: number`,
  bounded by `DEFAULT_MAX_CHAIN_DEPTH = 5`.
- **Encrypted scopes.** `ScopesEncryptedEnvelope`, and a dependency on
  `@orangecheck/lock-core` for the seal / unseal primitives.

## [0.1.0] — Initial published state

Initial public release. Canonical delegation + action envelope format, scope parser, BIP-322 verifier.

The package passes its conformance harness in CI on every change. See the
shared [conformance vectors](https://github.com/orangecheck/oc-packages#conformance)
section in the monorepo README for the cross-impl byte-equality discipline.

[Unreleased]: https://github.com/orangecheck/oc-packages/compare/orangecheck-agent-core-v0.1.0...HEAD
[0.1.0]: https://github.com/orangecheck/oc-packages/releases/tag/orangecheck-agent-core-v0.1.0
