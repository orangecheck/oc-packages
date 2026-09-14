# Changelog

All notable changes to **`@orangecheck/agent-core`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/). Wire-format / canonical-message
changes are coordinated via the relevant `oc-*-protocol` spec repo's CHANGELOG;
this file tracks the package's TS / Node / runtime API surface.

## [2.1.0] — 2026-09-14

### Fixed — ordered-op constraint values are now parsed as decimal integers

SPEC §7.4: "values MUST be decimal integers for ordered ops". `opToRange` used
`Number()`, which is far looser and accepted `1e3`, `0x3e8`, `+1000`,
`" 1000 "` and `1.5` — and `""`, which becomes `0`, turning an empty constraint
into a silent zero bound nobody wrote.

A verifier using a strict decimal parser rejects every one of those, so the same
delegation bytes produced different accept/reject answers on different
implementations. SECURITY §5 requires that they not: "same inputs on different
implementations MUST produce the same accept/reject answer."

Now `/^-?\d+$/` plus a safe-integer bound. Checked the conformance vectors
first: no vector uses a non-decimal ordered-op value, and the one that looks
like it (`max_bytes<=abc` in v09) is the malformed-scope vector that expects
rejection anyway.

## [2.0.0] — 2026-09-14

### Security — revocation checking was opt-IN, and the spec says opt-OUT

**BREAKING.** SECURITY §7 item 7: "Query revocation feeds (Nostr kind-30085 by
`#delegation`) for the cited delegation id before reporting OK, **unless the
caller explicitly opts out** of revocation checking."

The default was inverted:

- `verifyDelegation` had **no revocations parameter at all**. A revoked
  delegation returned `ok: true`, and a caller who wanted the check had no way
  to ask for it.
- `verifyAction` accepted `revocations` and evaluated them correctly, but only
  `if (input.revocations && length > 0)`. Omitting them skipped the check
  silently, so "checked, clean" and "never checked" were the same result, and
  `VerifyActionOkExtra` carried no revocation-status field to tell them apart.

Both verifiers now refuse unless given `revocations` or an explicit
`skipRevocationCheck: true`. An empty array is a valid, meaningful answer — "I
queried the feed and there were none" — and is distinct from declining to look.

This library has no network by design, so the caller still fetches the feed.
What changed is that declining to is a decision they must state, rather than
something that happens by omission. Same shape as vote-core's refusal to tally
without a signature verifier and pledge-core's refusal to verify an outcome
without the pledge.

`verifyDelegation` also now actually evaluates the revocations it is handed,
returning `E_REVOKED`. `verifyAction` continues to evaluate the whole chain
against the action's effective time; its internal `verifyDelegation` call
forwards `skipRevocationCheck: true` deliberately, because a per-link check
there would use the wrong clock and double-report.

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
